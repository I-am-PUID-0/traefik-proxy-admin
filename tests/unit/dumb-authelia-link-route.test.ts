import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminAuthConfig: vi.fn(),
  updateAdminAuthConfig: vi.fn(),
  getSSOConfig: vi.fn(),
  updateSSOConfig: vi.fn(),
  getAllConfigs: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  getAdminAuthConfig: mocks.getAdminAuthConfig,
  updateAdminAuthConfig: mocks.updateAdminAuthConfig,
}));

vi.mock("@/lib/sso-config", () => ({
  getSSOConfig: mocks.getSSOConfig,
  updateSSOConfig: mocks.updateSSOConfig,
}));

vi.mock("@/lib/services/sso-provider.service", () => ({
  SsoProviderService: {
    getAllConfigs: mocks.getAllConfigs,
    createConfig: mocks.createConfig,
    updateConfig: mocks.updateConfig,
  },
}));

import { POST } from "@/app/api/integrations/dumb/authelia/link/route";

const TOKEN = "a".repeat(48);

function request(body: unknown, token = TOKEN) {
  return new NextRequest(
    "http://127.0.0.1:3004/api/integrations/dumb/authelia/link",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    providerName: "DUMB-managed Authelia",
    issuerUrl: "https://auth.example.com",
    authorizationUrl: "https://auth.example.com/api/oidc/authorization",
    tokenUrl: "https://auth.example.com/api/oidc/token",
    userinfoUrl: "https://auth.example.com/api/oidc/userinfo",
    clientId: "tpa",
    clientSecret: "generated-secret",
    tokenEndpointAuthMethod: "client_secret_basic",
    redirectUri: "https://tpa.example.com/api/auth/sso/callback",
    scopes: ["openid", "profile", "email", "groups"],
    configureAdminSso: true,
    allowLocalFallback: true,
    adminGroups: ["admins"],
    ...overrides,
  };
}

describe("DUMB-managed Authelia link route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DUMB_INTEGRATION_TOKEN", TOKEN);
    mocks.getAllConfigs.mockResolvedValue([]);
    mocks.createConfig.mockResolvedValue({
      id: "provider-id",
      name: "DUMB-managed Authelia",
    });
    mocks.getSSOConfig.mockResolvedValue({ enabled: false });
    mocks.getAdminAuthConfig.mockResolvedValue({
      provider: "local",
      allowLocalFallback: false,
      roles: {
        viewer: { users: [], groups: [] },
        editor: { users: [], groups: [] },
        admin: { users: [], groups: [] },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests when the integration token is absent or incorrect", async () => {
    const response = await POST(request(body(), "incorrect-token"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid DUMB integration token",
    });
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("creates the reusable provider and preserves local admin fallback", async () => {
    const response = await POST(request(body()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      linked: true,
      providerId: "provider-id",
      providerName: "DUMB-managed Authelia",
      adminSsoConfigured: true,
      localFallbackEnabled: true,
    });
    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "DUMB-managed Authelia",
        clientSecret: "generated-secret",
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    );
    expect(mocks.updateSSOConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "tpa",
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    );
    expect(mocks.updateAdminAuthConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "sso",
        allowLocalFallback: true,
        roles: expect.objectContaining({
          admin: expect.objectContaining({ groups: ["admins"] }),
        }),
      }),
    );
  });

  it("defaults older managed-link requests to Authelia client_secret_basic", async () => {
    const legacyBody: Record<string, unknown> = body();
    delete legacyBody.tokenEndpointAuthMethod;

    const response = await POST(request(legacyBody));

    expect(response.status).toBe(200);
    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenEndpointAuthMethod: "client_secret_basic",
      }),
    );
  });

  it("updates an existing provider without changing admin auth when requested", async () => {
    mocks.getAllConfigs.mockResolvedValue([
      { id: "existing-id", name: "DUMB-managed Authelia" },
    ]);
    mocks.updateConfig.mockResolvedValue({
      id: "existing-id",
      name: "DUMB-managed Authelia",
    });

    const response = await POST(
      request(body({ configureAdminSso: false })),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateConfig).toHaveBeenCalledWith(
      "existing-id",
      expect.objectContaining({ clientId: "tpa" }),
    );
    expect(mocks.updateSSOConfig).not.toHaveBeenCalled();
    expect(mocks.updateAdminAuthConfig).not.toHaveBeenCalled();
  });
});
