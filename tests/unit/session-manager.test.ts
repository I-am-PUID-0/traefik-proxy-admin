import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {},
  sessions: {},
  services: {},
}));

import { getBoundedServiceSessionExpiry } from "@/lib/session-manager";

describe("getBoundedServiceSessionExpiry", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("uses the requested session duration for Forever services", () => {
    const expiry = getBoundedServiceSessionExpiry(now, 60, now, null);

    expect(expiry.toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  it("caps a long session at the service auto-disable time", () => {
    const expiry = getBoundedServiceSessionExpiry(now, 24 * 60, now, 120);

    expect(expiry.toISOString()).toBe("2026-01-01T02:00:00.000Z");
  });

  it("keeps a short session when the service auto-disable time is later", () => {
    const expiry = getBoundedServiceSessionExpiry(now, 45, now, 120);

    expect(expiry.toISOString()).toBe("2026-01-01T00:45:00.000Z");
  });
});
