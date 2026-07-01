import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const callbackMocks = vi.hoisted(() => {
  class SSOAuthError extends Error {
    code: "token_exchange_failed" | "userinfo_fetch_failed" | "provider_config_invalid";
    publicDetail?: string;

    constructor(code: SSOAuthError["code"], message: string, publicDetail?: string) {
      super(message);
      this.name = "SSOAuthError";
      this.code = code;
      this.publicDetail = publicDetail;
    }
  }

  return {
    SSOAuthError,
    exchangeCodeForToken: vi.fn(),
    getSSOConfig: vi.fn(),
    getServiceSSOConfig: vi.fn(),
    getUserInfo: vi.fn(),
    verifySignedSSOState: vi.fn(),
    resolveAdminRole: vi.fn(),
    hasAdminRoleMappings: vi.fn(),
    rateLimit: vi.fn(() => null),
  };
});

vi.mock("@/lib/sso-config", () => ({
  SSOAuthError: callbackMocks.SSOAuthError,
  exchangeCodeForToken: callbackMocks.exchangeCodeForToken,
  getSSOConfig: callbackMocks.getSSOConfig,
  getServiceSSOConfig: callbackMocks.getServiceSSOConfig,
  getUserInfo: callbackMocks.getUserInfo,
}));

vi.mock("@/lib/sso-state-token", () => ({
  verifySignedSSOState: callbackMocks.verifySignedSSOState,
}));

vi.mock("@/lib/request-guards", () => ({
  rateLimit: callbackMocks.rateLimit,
}));

vi.mock("@/lib/admin-auth", () => ({
  adminCookieOptions: vi.fn(() => ({ httpOnly: true, secure: false, sameSite: "lax", path: "/" })),
  createAdminSessionCookie: vi.fn(),
  getAdminAuthConfig: vi.fn(),
  resolveAdminRole: callbackMocks.resolveAdminRole,
}));

vi.mock("@/lib/admin-role-mapping", () => ({
  hasAdminRoleMappings: callbackMocks.hasAdminRoleMappings,
}));

vi.mock("@/lib/admin-auth-shared", () => ({
  ADMIN_SESSION_COOKIE: "tpa-admin-session",
  adminAuthEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/session-manager", () => ({
  sessionManager: {
    createSessionWithOptimalCookieExpiry: vi.fn(),
    getActiveSessionForServiceUser: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
  services: {},
}));

vi.mock("@/lib/services/service-security.service", () => ({
  ServiceSecurityService: {
    getEnabledSecurityConfigsForService: vi.fn(),
  },
}));

vi.mock("@/lib/service-auth-tickets", () => ({
  buildServiceAuthTicketUrl: vi.fn(() => "https://service.example.com/tpa/auth/ticket?tpa-auth-ticket=ticket"),
  createServiceAuthTicket: vi.fn(),
}));

vi.mock("@/lib/session-request-context", () => ({
  getSessionRequestContext: vi.fn(() => ({})),
}));

import { GET } from "@/app/api/auth/sso/callback/route";

function request(search: string) {
  return new NextRequest(`https://admin.example.com/api/auth/sso/callback${search}`);
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function testState(overrides: Record<string, unknown> = {}) {
  return {
    type: "test",
    timestamp: Date.now(),
    testConfig: {
      enabled: true,
      authorizationUrl: "https://idp.example.com/auth",
      tokenUrl: "https://idp.example.com/token",
      userinfoUrl: "https://idp.example.com/userinfo",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://admin.example.com/api/auth/sso/callback",
      scopes: ["openid", "profile", "email"],
    },
    roleConfig: {
      roles: {
        viewer: { users: [], groups: [] },
        editor: { users: [], groups: [] },
        admin: { users: ["admin@example.com"], groups: ["admins"] },
      },
    },
    ...overrides,
  };
}

describe("SSO callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    callbackMocks.verifySignedSSOState.mockReturnValue(testState());
    callbackMocks.exchangeCodeForToken.mockResolvedValue({ access_token: "provider-access-token" });
    callbackMocks.getUserInfo.mockResolvedValue({
      sub: "provider-subject",
      email: "admin@example.com",
      name: "Admin User",
      groups: ["admins"],
    });
    callbackMocks.resolveAdminRole.mockReturnValue("admin");
    callbackMocks.hasAdminRoleMappings.mockReturnValue(true);
  });

  it("rejects missing code or state", async () => {
    const response = await GET(request("?code=abc"));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ error: "Missing code or state" });
    expect(callbackMocks.verifySignedSSOState).not.toHaveBeenCalled();
  });

  it("rejects invalid state", async () => {
    callbackMocks.verifySignedSSOState.mockReturnValue(null);

    const response = await GET(request("?code=abc&state=bad-state"));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ error: "Invalid state parameter" });
    expect(callbackMocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("rejects expired state before contacting the provider", async () => {
    callbackMocks.verifySignedSSOState.mockReturnValue(testState({
      timestamp: Date.now() - 601_000,
    }));

    const response = await GET(request("?code=abc&state=expired-state"));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ error: "State expired" });
    expect(callbackMocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("returns safe provider failure stages", async () => {
    callbackMocks.exchangeCodeForToken.mockRejectedValue(
      new callbackMocks.SSOAuthError("token_exchange_failed", "token exchange failed", "invalid_client"),
    );

    const response = await GET(request("?code=abc&state=signed-state"));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({
      error: "SSO authentication failed",
      stage: "token_exchange_failed",
      detail: "invalid_client",
    });
  });

  it("renders test callback identity results without creating a session", async () => {
    const response = await GET(request("?code=abc&state=signed-state"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("SSO provider test succeeded");
    expect(html).toContain("admin@example.com");
    expect(html).toContain("&quot;role&quot;: &quot;admin&quot;");
    expect(callbackMocks.exchangeCodeForToken).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-id" }),
      "abc",
    );
    expect(callbackMocks.getUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-id" }),
      "provider-access-token",
    );
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("test_sso_state=");
    expect(setCookie).toContain("test_sso_state_token=");
  });
});
