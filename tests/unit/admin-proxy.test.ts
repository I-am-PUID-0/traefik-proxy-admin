import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRole } from "@/lib/admin-auth-shared";

const authMocks = vi.hoisted(() => {
  const ranks: Record<string, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };

  return {
    adminAuthEnabled: vi.fn(() => true),
    verifyAdminSessionToken: vi.fn(),
    roleAllows: vi.fn((actual: string, required: string) => ranks[actual] >= ranks[required]),
  };
});

vi.mock("@/lib/admin-auth-shared", () => ({
  ADMIN_SESSION_COOKIE: "tpa-admin-session",
  adminAuthEnabled: authMocks.adminAuthEnabled,
  verifyAdminSessionToken: authMocks.verifyAdminSessionToken,
  roleAllows: authMocks.roleAllows,
}));

import { proxy } from "@/proxy";

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`https://admin.example.com${path}`, init);
}

function session(role: AdminRole) {
  return {
    sub: "example-user",
    groups: [],
    role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

async function json(response: Response) {
  return response.json() as Promise<{ error?: string }>;
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
}

describe("admin proxy authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.adminAuthEnabled.mockReturnValue(true);
    authMocks.roleAllows.mockImplementation((actual: string, required: string) => {
      const ranks: Record<string, number> = { viewer: 1, editor: 2, admin: 3 };
      return ranks[actual] >= ranks[required];
    });
  });

  it("allows public API paths without checking an admin session", async () => {
    const response = await proxy(request("/api/health"));

    expect(response.status).toBe(200);
    expect(authMocks.verifyAdminSessionToken).not.toHaveBeenCalled();
  });

  it("allows same-origin public logout without checking an admin session", async () => {
    const response = await proxy(request("/api/auth/admin/logout", {
      method: "POST",
      headers: {
        origin: "https://admin.example.com",
      },
    }));

    expect(response.status).toBe(200);
    expect(authMocks.verifyAdminSessionToken).not.toHaveBeenCalled();
  });

  it("blocks cross-site public logout requests", async () => {
    const response = await proxy(request("/api/auth/admin/logout", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    }));

    expect(response.status).toBe(403);
    expectNoStore(response);
    await expect(json(response)).resolves.toEqual({ error: "Cross-site admin request blocked" });
    expect(authMocks.verifyAdminSessionToken).not.toHaveBeenCalled();
  });

  it("returns 401 for protected API requests without a valid session", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(null);

    const response = await proxy(request("/api/services"));

    expect(response.status).toBe(401);
    expectNoStore(response);
    await expect(json(response)).resolves.toEqual({ error: "Admin authentication required" });
  });

  it("redirects protected pages without a session using no-store headers", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(null);

    const response = await proxy(request("/services"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.example.com/auth/login?returnTo=%2Fservices");
    expectNoStore(response);
  });

  it("blocks cross-site unsafe admin requests before role checks", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(session("admin"));

    const response = await proxy(request("/api/services", {
      method: "POST",
      headers: {
        cookie: "tpa-admin-session=token",
        "sec-fetch-site": "cross-site",
      },
    }));

    expect(response.status).toBe(403);
    expectNoStore(response);
    await expect(json(response)).resolves.toEqual({ error: "Cross-site admin request blocked" });
    expect(authMocks.roleAllows).not.toHaveBeenCalled();
  });

  it("requires editor role for same-origin mutating service requests", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(session("viewer"));

    const response = await proxy(request("/api/services", {
      method: "POST",
      headers: {
        cookie: "tpa-admin-session=token",
        origin: "https://admin.example.com",
      },
    }));

    expect(response.status).toBe(403);
    expectNoStore(response);
    await expect(json(response)).resolves.toEqual({ error: "Insufficient admin role" });
    expect(authMocks.roleAllows).toHaveBeenCalledWith("viewer", "editor");
  });

  it("allows editor role for same-origin mutating service requests", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(session("editor"));

    const response = await proxy(request("/api/services", {
      method: "POST",
      headers: {
        cookie: "tpa-admin-session=token",
        origin: "https://admin.example.com",
      },
    }));

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(authMocks.roleAllows).toHaveBeenCalledWith("editor", "editor");
  });

  it("requires admin role for admin-only API sections", async () => {
    authMocks.verifyAdminSessionToken.mockResolvedValue(session("editor"));

    const response = await proxy(request("/api/config", {
      headers: {
        cookie: "tpa-admin-session=token",
      },
    }));

    expect(response.status).toBe(403);
    expectNoStore(response);
    await expect(json(response)).resolves.toEqual({ error: "Insufficient admin role" });
    expect(authMocks.roleAllows).toHaveBeenCalledWith("editor", "admin");
  });
});
