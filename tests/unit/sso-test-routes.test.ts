import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ssoMocks = vi.hoisted(() => ({
  assertSsoEndpointAllowed: vi.fn(async (url: string) => url),
  generateSSOAuthUrl: vi.fn(() => "https://idp.example.com/auth?state=generated-state"),
  resolveSSOEndpoints: vi.fn(() => ({
    authorizationUrl: "https://idp.example.com/auth",
    tokenUrl: "https://idp.example.com/token",
    userinfoUrl: "https://idp.example.com/userinfo",
  })),
  validateSSOConfigForUse: vi.fn(() => [] as string[]),
}));

vi.mock("@/lib/sso-config", () => ({
  generateSSOAuthUrl: ssoMocks.generateSSOAuthUrl,
  resolveSSOEndpoints: ssoMocks.resolveSSOEndpoints,
  validateSSOConfigForUse: ssoMocks.validateSSOConfigForUse,
}));

vi.mock("@/lib/sso-endpoint-guard", () => ({
  assertSsoEndpointAllowed: ssoMocks.assertSsoEndpointAllowed,
}));

import { POST as checkPost } from "@/app/api/auth/sso/test/check/route";
import { POST as startPost } from "@/app/api/auth/sso/test/start/route";

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

function request(path: string, body: unknown, init: Omit<NextRequestInit, "body"> = {}) {
  return new NextRequest(`https://admin.example.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
    ...init,
    body: JSON.stringify(body),
  });
}

function checkRequest(body: unknown, init?: Omit<NextRequestInit, "body">) {
  return request("/api/auth/sso/test/check", body, init);
}

function startRequest(body: unknown, init?: Omit<NextRequestInit, "body">) {
  return request("/api/auth/sso/test/start", body, init);
}

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    authorizationUrl: "https://idp.example.com/auth",
    tokenUrl: "https://idp.example.com/token",
    userinfoUrl: "https://idp.example.com/userinfo",
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://admin.example.com/api/auth/sso/callback",
    scopes: "openid profile email",
    ...overrides,
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("SSO provider test routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ssoMocks.assertSsoEndpointAllowed.mockImplementation(async (url: string) => url);
    ssoMocks.generateSSOAuthUrl.mockReturnValue("https://idp.example.com/auth?state=generated-state");
    ssoMocks.resolveSSOEndpoints.mockReturnValue({
      authorizationUrl: "https://idp.example.com/auth",
      tokenUrl: "https://idp.example.com/token",
      userinfoUrl: "https://idp.example.com/userinfo",
    });
    ssoMocks.validateSSOConfigForUse.mockReturnValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns validation errors without probing endpoints", async () => {
    ssoMocks.validateSSOConfigForUse.mockReturnValue(["Client secret is required"]);

    const response = await checkPost(checkRequest(validConfig({ clientSecret: "" })));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      errors: ["Client secret is required"],
      probes: [],
    });
    expect(ssoMocks.resolveSSOEndpoints).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("probes configured endpoints and reports success", async () => {
    const response = await checkPost(checkRequest(validConfig()));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      errors: [],
      endpoints: {
        authorizationUrl: "https://idp.example.com/auth",
        tokenUrl: "https://idp.example.com/token",
        userinfoUrl: "https://idp.example.com/userinfo",
      },
      probes: [
        expect.objectContaining({ label: "authorization", reachable: true, status: 204 }),
        expect.objectContaining({ label: "token", reachable: true, status: 204 }),
        expect.objectContaining({ label: "userinfo", reachable: true, status: 204 }),
      ],
    });
    expect(ssoMocks.assertSsoEndpointAllowed).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledWith("https://idp.example.com/auth", expect.objectContaining({ method: "HEAD" }));
  });

  it("reports endpoint guard failures as unreachable probes", async () => {
    ssoMocks.assertSsoEndpointAllowed.mockImplementation(async (url: string) => {
      if (url.includes("/token")) throw new Error("SSO endpoint resolves to a private address");
      return url;
    });

    const response = await checkPost(checkRequest(validConfig()));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      ok: false,
      errors: [expect.stringContaining("token endpoint is not reachable")],
      probes: expect.arrayContaining([
        expect.objectContaining({
          label: "token",
          reachable: false,
          error: "SSO endpoint resolves to a private address",
        }),
      ]),
    });
  });

  it("starts an interactive SSO test and stores flow-specific state cookies", async () => {
    const response = await startPost(startRequest({
      config: validConfig(),
      roleConfig: {
        roles: {
          viewer: { users: ["viewer@example.com"], groups: [] },
          editor: { users: [], groups: [] },
          admin: { users: [], groups: ["admins"] },
        },
      },
    }));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      authorizationUrl: "https://idp.example.com/auth?state=generated-state",
    });
    expect(ssoMocks.generateSSOAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-id",
        clientSecret: "client-secret",
        scopes: ["openid", "profile", "email"],
      }),
      expect.any(String),
    );
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("test_sso_state=");
    expect(setCookie).toContain("test_sso_state_token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=600");
  });

  it("rejects invalid SSO test starts without setting state cookies", async () => {
    ssoMocks.validateSSOConfigForUse.mockReturnValue(["Redirect URI is required"]);

    const response = await startPost(startRequest({ config: validConfig({ redirectUri: "" }) }));

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({
      error: "Validation failed",
      details: ["Redirect URI is required"],
    });
    expect(ssoMocks.generateSSOAuthUrl).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects oversized SSO test check bodies", async () => {
    const response = await checkPost(checkRequest("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": String(80 * 1024),
      },
    }));

    expect(response.status).toBe(413);
    await expect(json(response)).resolves.toEqual({ error: "Request body is too large" });
    expect(ssoMocks.validateSSOConfigForUse).not.toHaveBeenCalled();
  });
});
