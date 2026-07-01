import { describe, expect, it } from "vitest";

import { isLoopbackIpJailSubject, normalizeIpJailSubject, serializeIpJailDecision } from "@/lib/ip-jail-shared";
import type { IpJailDecision } from "@/lib/db";

describe("ip jail helpers", () => {
  it("normalizes exact IP addresses and CIDR ranges", () => {
    expect(normalizeIpJailSubject(" 203.0.113.10 ")).toBe("203.0.113.10");
    expect(normalizeIpJailSubject("2001:DB8::1/64")).toBe("2001:db8::1/64");
  });

  it("rejects invalid subjects and CIDR prefixes", () => {
    expect(() => normalizeIpJailSubject("not-an-ip")).toThrow("valid IPv4 or IPv6");
    expect(() => normalizeIpJailSubject("203.0.113.10/64")).toThrow("between 0 and 32");
    expect(() => normalizeIpJailSubject("2001:db8::1/129")).toThrow("between 0 and 128");
  });

  it("detects loopback subjects", () => {
    expect(isLoopbackIpJailSubject("127.0.0.1")).toBe(true);
    expect(isLoopbackIpJailSubject("127.0.0.0/8")).toBe(true);
    expect(isLoopbackIpJailSubject("::1")).toBe(true);
    expect(isLoopbackIpJailSubject("203.0.113.10")).toBe(false);
  });

  it("marks expired decisions inactive", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const decision = {
      id: "00000000-0000-0000-0000-000000000001",
      subject: "203.0.113.10",
      reason: null,
      source: "manual",
      evidence: null,
      isEnabled: true,
      expiresAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } satisfies IpJailDecision;

    expect(serializeIpJailDecision(decision, now).isActive).toBe(false);
  });
});
