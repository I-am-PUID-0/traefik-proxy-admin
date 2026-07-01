import { beforeEach, describe, expect, it, vi } from "vitest";

const migrationMocks = vi.hoisted(() => ({
  migrate: vi.fn(),
  drizzle: vi.fn(() => ({ db: true })),
  postgres: vi.fn(),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: migrationMocks.drizzle,
}));

vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: migrationMocks.migrate,
}));

vi.mock("postgres", () => ({
  default: migrationMocks.postgres,
}));

import { runMigrations } from "@/instrumentation";

function queryText(strings: TemplateStringsArray) {
  return strings.join("?").replace(/\s+/g, " ").trim();
}

function createMigrationClient(options: {
  hasSchema: boolean;
  hasMigrationTable: boolean;
  migrationCount?: number;
}) {
  const queries: string[] = [];
  const client = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = queryText(strings);
    queries.push(sql);

    if (sql.includes("from information_schema.tables")) {
      return [{
        hasSchema: options.hasSchema,
        hasMigrationTable: options.hasMigrationTable,
      }];
    }

    if (sql.includes("select count(*)::int")) {
      return [{ count: options.migrationCount ?? 0 }];
    }

    if (sql.includes("from app_config") && sql.includes("traefik_global_config")) {
      return [{ value: JSON.stringify({ sampleDomain: "example.com", certResolver: "letsencrypt" }) }];
    }

    return [];
  });

  return Object.assign(client, {
    end: vi.fn(async () => undefined),
    queries,
  });
}

describe("legacy migration repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    migrationMocks.migrate.mockResolvedValue(undefined);
  });

  it("repairs a legacy schema and still applies pending Drizzle migrations in the same run", async () => {
    const migrationClient = createMigrationClient({
      hasSchema: true,
      hasMigrationTable: false,
    });
    migrationMocks.postgres.mockReturnValue(migrationClient);

    await runMigrations();

    expect(migrationClient.queries.some((query) => query.includes("create table if not exists domains"))).toBe(true);
    expect(migrationClient.queries.some((query) => query.includes("legacy-schema-repair-0011"))).toBe(true);
    expect(migrationClient.end).toHaveBeenCalledTimes(1);
    expect(migrationMocks.drizzle).toHaveBeenCalledWith(expect.any(String));
    expect(migrationMocks.migrate).toHaveBeenCalledTimes(1);
    expect(migrationMocks.migrate).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ migrationsFolder: expect.stringContaining("drizzle/migrations") }),
    );
  });

  it("skips legacy repair when migration history already exists", async () => {
    const migrationClient = createMigrationClient({
      hasSchema: true,
      hasMigrationTable: true,
      migrationCount: 12,
    });
    migrationMocks.postgres.mockReturnValue(migrationClient);

    await runMigrations();

    expect(migrationClient.queries.some((query) => query.includes("legacy-schema-repair-0011"))).toBe(false);
    expect(migrationClient.end).toHaveBeenCalledTimes(1);
    expect(migrationMocks.migrate).toHaveBeenCalledTimes(1);
  });
});
