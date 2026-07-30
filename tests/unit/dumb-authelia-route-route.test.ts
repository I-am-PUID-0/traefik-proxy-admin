import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllDomains: vi.fn(),
  getDomainById: vi.fn(),
  getAllServices: vi.fn(),
  createService: vi.fn(),
}));

vi.mock("@/lib/services/domain.service", () => ({
  DomainService: {
    getAllDomains: mocks.getAllDomains,
    getDomainById: mocks.getDomainById,
  },
}));

vi.mock("@/lib/services/service.service", () => ({
  ServiceService: {
    getAllServices: mocks.getAllServices,
    createService: mocks.createService,
  },
}));

import {
  GET,
  POST,
} from "@/app/api/integrations/dumb/authelia/route/route";

const TOKEN = "a".repeat(48);
const domain = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Example",
  domain: "example.com",
  isDefault: true,
  useWildcardCert: true,
  certResolver: "",
  serviceCount: 2,
};

function request(
  method: "GET" | "POST",
  body?: unknown,
  token = TOKEN,
) {
  return new NextRequest(
    "http://127.0.0.1:3004/api/integrations/dumb/authelia/route",
    {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

describe("DUMB-managed Authelia route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DUMB_INTEGRATION_TOKEN", TOKEN);
    mocks.getAllDomains.mockResolvedValue([domain]);
    mocks.getDomainById.mockResolvedValue(domain);
    mocks.getAllServices.mockResolvedValue([]);
    mocks.createService.mockResolvedValue({ id: "service-id" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only safe domain discovery fields", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      domains: [{
        id: domain.id,
        name: "Example",
        domain: "example.com",
        isDefault: true,
        useWildcardCert: true,
        certResolver: "",
        serviceCount: 2,
      }],
    });
  });

  it("rejects domain discovery without the integration token", async () => {
    const response = await GET(request("GET", undefined, "wrong-token"));

    expect(response.status).toBe(401);
    expect(mocks.getAllDomains).not.toHaveBeenCalled();
  });

  it("creates an unprotected HTTP route without altering the domain", async () => {
    const response = await POST(request("POST", {
      domainId: domain.id,
      publicUrl: "https://auth.example.com",
      targetPort: 9091,
    }));

    expect(response.status).toBe(200);
    expect(mocks.createService).toHaveBeenCalledWith(expect.objectContaining({
      name: "Authelia",
      serviceGroup: "DUMB",
      hostnameMode: "subdomain",
      subdomain: "auth",
      domainId: domain.id,
      targetIp: "127.0.0.1",
      targetPort: 9091,
      isHttps: false,
      middlewares: null,
    }));
  });

  it("reuses an exact compatible route", async () => {
    mocks.getAllServices.mockResolvedValue([{
      id: "existing-service",
      name: "Authelia",
      hostnameMode: "subdomain",
      subdomain: "auth",
      customHostnames: null,
      domainId: domain.id,
      domain,
      targetIp: "127.0.0.1",
      targetPort: 9091,
      isHttps: false,
      passHostHeader: true,
      enabled: true,
      middlewares: null,
      managedMiddlewares: null,
      hasSharedLink: false,
      hasSso: false,
      hasBasicAuth: false,
    }]);

    const response = await POST(request("POST", {
      domainId: domain.id,
      publicUrl: "https://auth.example.com",
      targetPort: 9091,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      configured: true,
      created: false,
      reused: true,
      serviceId: "existing-service",
    }));
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("rejects a hostname conflict without changing it", async () => {
    mocks.getAllServices.mockResolvedValue([{
      id: "conflict-service",
      name: "Existing app",
      hostnameMode: "subdomain",
      subdomain: "auth",
      customHostnames: null,
      domainId: domain.id,
      domain,
      targetIp: "127.0.0.1",
      targetPort: 8000,
      isHttps: false,
      enabled: true,
    }]);

    const response = await POST(request("POST", {
      domainId: domain.id,
      publicUrl: "https://auth.example.com",
      targetPort: 9091,
    }));

    expect(response.status).toBe(409);
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("does not reuse an Authelia route with attached middleware", async () => {
    mocks.getAllServices.mockResolvedValue([{
      id: "protected-authelia",
      name: "Authelia",
      hostnameMode: "subdomain",
      subdomain: "auth",
      customHostnames: null,
      domainId: domain.id,
      domain,
      targetIp: "127.0.0.1",
      targetPort: 9091,
      isHttps: false,
      passHostHeader: true,
      enabled: true,
      middlewares: JSON.stringify(["some-auth@file"]),
      managedMiddlewares: null,
      hasSharedLink: false,
      hasSso: false,
      hasBasicAuth: false,
    }]);

    const response = await POST(request("POST", {
      domainId: domain.id,
      publicUrl: "https://auth.example.com",
      targetPort: 9091,
    }));

    expect(response.status).toBe(409);
    expect(mocks.createService).not.toHaveBeenCalled();
  });
});
