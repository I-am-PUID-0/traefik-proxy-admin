import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requestSsoEndpoint: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  appConfig: {},
}));

vi.mock("@/lib/services/sso-provider.service", () => ({
  SsoProviderService: {},
}));

vi.mock("@/lib/sso-endpoint-guard", () => ({
  requestSsoEndpoint: mocks.requestSsoEndpoint,
  SsoEndpointRejectedError: class SsoEndpointRejectedError extends Error {},
}));

import { exchangeCodeForToken, type SSOConfig } from "@/lib/sso-config";

function config(
  tokenEndpointAuthMethod: SSOConfig["tokenEndpointAuthMethod"],
): SSOConfig {
  return {
    enabled: true,
    idpUrl: "https://idp.example.com",
    authorizationUrl: "https://idp.example.com/authorize",
    tokenUrl: "https://idp.example.com/token",
    userinfoUrl: "https://idp.example.com/userinfo",
    clientId: "test-client",
    clientSecret: "test-secret",
    tokenEndpointAuthMethod,
    redirectUri: "https://tpa.example.com/api/auth/sso/callback",
    scopes: ["openid", "profile", "email"],
  };
}

describe("SSO token exchange client authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestSsoEndpoint.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "provider-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("uses HTTP Basic authentication for client_secret_basic providers", async () => {
    await exchangeCodeForToken(config("client_secret_basic"), "authorization-code");

    const [, options] = mocks.requestSsoEndpoint.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    const body = new URLSearchParams(options.body as string);
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("test-client:test-secret", "utf8").toString("base64")}`,
    );
    expect(body.get("client_id")).toBeNull();
    expect(body.get("client_secret")).toBeNull();
    expect(body.get("code")).toBe("authorization-code");
  });

  it("retains POST-body authentication for existing providers", async () => {
    await exchangeCodeForToken(config("client_secret_post"), "authorization-code");

    const [, options] = mocks.requestSsoEndpoint.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    const body = new URLSearchParams(options.body as string);
    expect(headers.Authorization).toBeUndefined();
    expect(body.get("client_id")).toBe("test-client");
    expect(body.get("client_secret")).toBe("test-secret");
  });
});
