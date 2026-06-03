import { describe, expect, it } from "vitest";
import { isDirectVerifierRequest } from "@/lib/auth-verifier-routing";

describe("auth verifier routing", () => {
  it("treats direct verifier visits as direct requests", () => {
    expect(isDirectVerifierRequest("/api/auth/verify?serviceId=service-1", null)).toBe(true);
  });

  it("does not treat forwarded upstream verifier endpoints as direct TPA verifier visits", () => {
    expect(isDirectVerifierRequest("/api/auth/verify?token=upstream-token", "/api/auth/verify?token=upstream-token")).toBe(false);
  });
});
