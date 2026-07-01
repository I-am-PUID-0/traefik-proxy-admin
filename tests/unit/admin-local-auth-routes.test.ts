import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminAuthMocks = vi.hoisted(() => ({
  adminAuthEnabled: vi.fn(() => true),
  getAdminAuthConfig: vi.fn(),
  authenticateLocalAdminUser: vi.fn(),
  createInitialLocalAdminUser: vi.fn(),
  createAdminSessionCookie: vi.fn(),
  adminCookieOptions: vi.fn((maxAgeSeconds?: number) => ({
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/",
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  })),
}));

vi.mock("@/lib/admin-auth-shared", () => ({
  ADMIN_SESSION_COOKIE: "tpa-admin-session",
  adminAuthEnabled: adminAuthMocks.adminAuthEnabled,
}));

vi.mock("@/lib/admin-auth", () => ({
  adminCookieOptions: adminAuthMocks.adminCookieOptions,
  authenticateLocalAdminUser: adminAuthMocks.authenticateLocalAdminUser,
  createInitialLocalAdminUser: adminAuthMocks.createInitialLocalAdminUser,
  createAdminSessionCookie: adminAuthMocks.createAdminSessionCookie,
  getAdminAuthConfig: adminAuthMocks.getAdminAuthConfig,
}));

import { POST as loginPost } from "@/app/api/auth/admin/local/login/route";
import { POST as setupPost } from "@/app/api/auth/admin/local/setup/route";
import { POST as logoutPost } from "@/app/api/auth/admin/logout/route";

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`https://admin.example.com${path}`, init);
}

function jsonLoginRequest(body: unknown) {
  return request("/api/auth/admin/local/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formLoginRequest(body: Record<string, string>) {
  return request("/api/auth/admin/local/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "admin.example.net",
    },
    body: new URLSearchParams(body).toString(),
  });
}

function jsonSetupRequest(body: unknown) {
  return request("/api/auth/admin/local/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formSetupRequest(body: Record<string, string>) {
  return request("/api/auth/admin/local/setup", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "admin.example.net",
    },
    body: new URLSearchParams(body).toString(),
  });
}

function localConfig(overrides: Partial<Awaited<ReturnType<typeof adminAuthMocks.getAdminAuthConfig>>> = {}) {
  return {
    enabled: true,
    provider: "local",
    allowLocalFallback: false,
    sessionDurationHours: 8,
    roles: {
      viewer: { users: [], groups: [] },
      editor: { users: [], groups: [] },
      admin: { users: [], groups: [] },
    },
    localUsers: [],
    ...overrides,
  };
}

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("admin local auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMocks.adminAuthEnabled.mockReturnValue(true);
    adminAuthMocks.getAdminAuthConfig.mockResolvedValue(localConfig());
    adminAuthMocks.authenticateLocalAdminUser.mockResolvedValue({
      username: "admin",
      role: "editor",
      passwordHash: "hash",
      disabled: false,
    });
    adminAuthMocks.createInitialLocalAdminUser.mockResolvedValue({
      username: "admin",
      role: "admin",
      passwordHash: "hash",
      disabled: false,
    });
    adminAuthMocks.createAdminSessionCookie.mockResolvedValue("signed-session-token");
  });

  it("creates an admin session cookie after successful JSON login", async () => {
    adminAuthMocks.getAdminAuthConfig.mockResolvedValue(localConfig({ sessionDurationHours: 4 }));

    const response = await loginPost(jsonLoginRequest({
      username: "admin",
      password: "correct-password",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      user: { username: "admin", role: "editor" },
    });
    expect(adminAuthMocks.authenticateLocalAdminUser).toHaveBeenCalledWith("admin", "correct-password");
    expect(adminAuthMocks.createAdminSessionCookie).toHaveBeenCalledWith(
      { sub: "admin", name: "admin" },
      "editor",
      4,
    );
    expect(response.headers.get("set-cookie")).toContain("tpa-admin-session=signed-session-token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=14400");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("blocks local login when SSO is selected without local fallback", async () => {
    adminAuthMocks.getAdminAuthConfig.mockResolvedValue(localConfig({
      provider: "sso",
      allowLocalFallback: false,
    }));

    const response = await loginPost(jsonLoginRequest({
      username: "admin",
      password: "correct-password",
    }));

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({
      error: "Local admin login is disabled while SSO is the selected provider",
    });
    expect(adminAuthMocks.authenticateLocalAdminUser).not.toHaveBeenCalled();
  });

  it("sanitizes form login return targets before redirecting", async () => {
    const response = await loginPost(formLoginRequest({
      username: "admin",
      password: "correct-password",
      returnTo: "https://evil.example/steal",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://admin.example.net/");
    expect(response.headers.get("set-cookie")).toContain("tpa-admin-session=signed-session-token");
  });

  it("clears the admin session cookie on logout", async () => {
    const response = await logoutPost();

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toEqual({ success: true });
    expect(response.headers.get("set-cookie")).toContain("tpa-admin-session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("creates the first local admin and starts a session during JSON setup", async () => {
    adminAuthMocks.getAdminAuthConfig.mockResolvedValue(localConfig({ sessionDurationHours: 12 }));

    const response = await setupPost(jsonSetupRequest({
      username: "admin",
      password: "new-admin-password",
      confirmPassword: "new-admin-password",
    }));

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      user: { username: "admin", role: "admin" },
    });
    expect(adminAuthMocks.createInitialLocalAdminUser).toHaveBeenCalledWith("admin", "new-admin-password");
    expect(adminAuthMocks.createAdminSessionCookie).toHaveBeenCalledWith(
      { sub: "admin", name: "admin" },
      "admin",
      12,
    );
    expect(response.headers.get("set-cookie")).toContain("tpa-admin-session=signed-session-token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=43200");
  });

  it("rejects setup when password confirmation does not match", async () => {
    const response = await setupPost(jsonSetupRequest({
      username: "admin",
      password: "new-admin-password",
      confirmPassword: "different-password",
    }));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Passwords do not match" });
    expect(adminAuthMocks.createInitialLocalAdminUser).not.toHaveBeenCalled();
  });

  it("returns setup creation errors without creating a session", async () => {
    adminAuthMocks.createInitialLocalAdminUser.mockRejectedValue(new Error("Local admin user already exists"));

    const response = await setupPost(jsonSetupRequest({
      username: "admin",
      password: "new-admin-password",
    }));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Local admin user already exists" });
    expect(adminAuthMocks.createAdminSessionCookie).not.toHaveBeenCalled();
  });

  it("sanitizes form setup return targets before redirecting", async () => {
    const response = await setupPost(formSetupRequest({
      username: "admin",
      password: "new-admin-password",
      "confirm-password": "new-admin-password",
      returnTo: "//evil.example/steal",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://admin.example.net/");
    expect(response.headers.get("set-cookie")).toContain("tpa-admin-session=signed-session-token");
  });
});
