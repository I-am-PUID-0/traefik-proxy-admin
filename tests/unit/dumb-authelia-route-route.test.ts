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
      routeApplications: ["authelia", "dumb", "tpa"],
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

  it.each([
    ["dumb", "DUMB", "https://dumb.example.com", "dumb", 3005],
    ["tpa", "Traefik Proxy Admin", "https://proxy.example.com", "proxy", 3004],
  ] as const)(
    "creates an unprotected %s application route",
    async (application, name, publicUrl, subdomain, targetPort) => {
      const response = await POST(request("POST", {
        application,
        domainId: domain.id,
        publicUrl,
        targetPort,
      }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(expect.objectContaining({
        application,
        configured: true,
        created: true,
        authentication: "none",
      }));
      expect(mocks.createService).toHaveBeenCalledWith(expect.objectContaining({
        name,
        serviceGroup: "DUMB",
        hostnameMode: "subdomain",
        subdomain,
        domainId: domain.id,
        targetIp: "127.0.0.1",
        targetPort,
        isHttps: false,
        middlewares: null,
      }));
    },
  );

  it("allows a custom reachable target for an external DUMB frontend", async () => {
    const response = await POST(request("POST", {
      application: "dumb",
      domainId: domain.id,
      publicUrl: "https://dumb.example.com",
      targetHost: "dmbdb_dev",
      targetPort: 3005,
    }));

    expect(response.status).toBe(200);
    expect(mocks.createService).toHaveBeenCalledWith(expect.objectContaining({
      name: "DUMB",
      targetIp: "dmbdb_dev",
      targetPort: 3005,
    }));
  });

  it("rejects unsafe or non-DUMB custom route targets", async () => {
    for (const body of [
      {
        application: "dumb",
        domainId: domain.id,
        publicUrl: "https://dumb.example.com",
        targetHost: "http://dmbdb_dev/path",
        targetPort: 3005,
      },
      {
        application: "tpa",
        domainId: domain.id,
        publicUrl: "https://proxy.example.com",
        targetHost: "other-container",
        targetPort: 3004,
      },
    ]) {
      const response = await POST(request("POST", body));
      expect(response.status).toBe(400);
    }
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("accepts the explicit fixed loopback target for Authelia", async () => {
    const response = await POST(request("POST", {
      application: "authelia",
      domainId: domain.id,
      publicUrl: "https://auth.example.com",
      targetHost: "127.0.0.1",
      targetPort: 9091,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      application: "authelia",
      configured: true,
      created: true,
      targetHost: "127.0.0.1",
      targetPort: 9091,
    }));
    expect(mocks.createService).toHaveBeenCalledWith(expect.objectContaining({
      name: "Authelia",
      targetIp: "127.0.0.1",
      targetPort: 9091,
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
