import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  delete: vi.fn(),
}));

const sessionManagerMocks = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getActiveSessions: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbMocks.select,
    delete: dbMocks.delete,
  },
  domains: {
    domain: "domains.domain",
    id: "domains.id",
  },
  services: {
    customHostnames: "services.customHostnames",
    domainId: "services.domainId",
    hostnameMode: "services.hostnameMode",
    id: "services.id",
    name: "services.name",
    subdomain: "services.subdomain",
  },
  sessions: {
    accessCount: "sessions.accessCount",
    authMethod: "sessions.authMethod",
    clientIp: "sessions.clientIp",
    clientIpSource: "sessions.clientIpSource",
    createdAt: "sessions.createdAt",
    entryPoint: "sessions.entryPoint",
    expiresAt: "sessions.expiresAt",
    id: "sessions.id",
    ipChanged: "sessions.ipChanged",
    lastAccessedAt: "sessions.lastAccessedAt",
    lastIp: "sessions.lastIp",
    lastPath: "sessions.lastPath",
    lastUserAgent: "sessions.lastUserAgent",
    requestedHost: "sessions.requestedHost",
    riskFlags: "sessions.riskFlags",
    serviceId: "sessions.serviceId",
    sessionToken: "sessions.sessionToken",
    ssoEmail: "sessions.ssoEmail",
    ssoGroups: "sessions.ssoGroups",
    ssoIssuer: "sessions.ssoIssuer",
    ssoName: "sessions.ssoName",
    ssoSubject: "sessions.ssoSubject",
    userAgent: "sessions.userAgent",
    userAgentChanged: "sessions.userAgentChanged",
    userIdentifier: "sessions.userIdentifier",
  },
}));

vi.mock("@/lib/session-manager", () => ({
  sessionManager: sessionManagerMocks,
}));

import { GET } from "@/app/api/sessions/route";

function mockSessionQuery(rows: Array<Record<string, unknown>>) {
  const secondJoinResult = Promise.resolve(rows);
  const firstJoinChain = { leftJoin: vi.fn(() => secondJoinResult) };
  const fromChain = { leftJoin: vi.fn(() => firstJoinChain) };
  const selectChain = { from: vi.fn(() => fromChain) };

  dbMocks.select.mockReturnValue(selectChain);
}

describe("sessions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionManagerMocks.getActiveSessions.mockReturnValue([]);
  });

  it("does not expose raw service session tokens in the inventory response", async () => {
    mockSessionQuery([
      {
        id: "session-row-id",
        serviceId: "service-id",
        userIdentifier: "shared-link-user",
        authMethod: "shared_link",
        expiresAt: "2026-01-01T00:00:00.000Z",
        lastAccessedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        serviceName: "Example service",
        domain: "example.com",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbMocks.select).toHaveBeenCalledWith(expect.not.objectContaining({
      sessionToken: expect.anything(),
    }));
    expect(body).toEqual([
      expect.not.objectContaining({
        sessionToken: expect.anything(),
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("session-token");
  });
});
