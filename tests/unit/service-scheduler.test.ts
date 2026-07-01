import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {},
  services: {},
}));

import { getServiceAutoDisableAt } from "@/lib/service-scheduler";

describe("getServiceAutoDisableAt", () => {
  it("treats null duration as Forever", () => {
    const enabledAt = new Date("2026-01-01T00:00:00.000Z");

    expect(getServiceAutoDisableAt(enabledAt, null)).toBeNull();
  });

  it("treats undefined duration as no scheduled expiry", () => {
    const enabledAt = new Date("2026-01-01T00:00:00.000Z");

    expect(getServiceAutoDisableAt(enabledAt, undefined)).toBeNull();
  });

  it("calculates expiry for finite durations", () => {
    const enabledAt = new Date("2026-01-01T00:00:00.000Z");

    expect(getServiceAutoDisableAt(enabledAt, 10080)?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});
