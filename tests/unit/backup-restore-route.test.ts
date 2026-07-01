import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: dbMocks.transaction,
  },
}));

import { POST } from "@/app/api/backup/restore/route";

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

function request(body: unknown, init: Omit<NextRequestInit, "body"> = {}) {
  return new NextRequest("https://admin.example.com/api/backup/restore", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    ...init,
    body: JSON.stringify(body),
  });
}

function backupPayload(overrides: Record<string, unknown> = {}) {
  return {
    format: "traefik-proxy-admin.backup",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    includesSecrets: true,
    excluded: ["sessions", "serviceAuthTickets"],
    data: {
      appConfig: [
        {
          id: 1,
          key: "admin_auth_config",
          value: "{\"localUsers\":[{\"username\":\"admin\",\"passwordHash\":\"hash\"}]}",
          description: "Admin authentication provider and role mapping",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      domains: [
        {
          id: 1,
          domain: "example.com",
          isDefault: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      services: [],
      serviceSecurityConfigs: [],
      sharedLinks: [],
      basicAuthConfigs: [],
      basicAuthUsers: [],
      ssoConfigs: [],
      ipJailDecisions: [],
    },
    ...overrides,
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("backup restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbMocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const tx = {
        delete: vi.fn(async () => undefined),
        insert: vi.fn(() => ({
          values: vi.fn(async () => undefined),
        })),
      };

      await callback(tx);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a dry-run summary without writing to the database", async () => {
    const response = await POST(request({
      dryRun: true,
      backup: backupPayload(),
    }));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      mode: "dry-run",
      counts: {
        appConfig: 1,
        domains: 1,
        services: 0,
      },
      warnings: expect.arrayContaining([
        expect.stringContaining("replace mode deletes existing services"),
        expect.stringContaining("include sensitive data"),
        expect.stringContaining("Active sessions and one-time auth tickets are intentionally excluded"),
      ]),
    });
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects replace restores without explicit confirmation", async () => {
    const response = await POST(request({
      backup: backupPayload(),
    }));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({
      error: "Restore requires confirmReplace=true",
    });
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects unsupported backup formats", async () => {
    const response = await POST(request({
      dryRun: true,
      backup: backupPayload({ format: "wrong.format" }),
    }));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({
      error: "Unsupported backup format or version",
    });
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("runs replace restore only after confirmation", async () => {
    const response = await POST(request({
      confirmReplace: true,
      backup: backupPayload(),
    }));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      mode: "replace",
      restored: true,
      counts: {
        appConfig: 1,
        domains: 1,
      },
    });
    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized restore request bodies", async () => {
    const response = await POST(request("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": String(6 * 1024 * 1024),
      },
    }));

    expect(response.status).toBe(413);
    await expect(json(response)).resolves.toEqual({ error: "Request body is too large" });
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });
});
