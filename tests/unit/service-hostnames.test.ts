import { describe, expect, it } from "vitest";
import { customHostnamesJsonOrNull, parseCustomHostnamesInput } from "@/lib/service-hostnames";

describe("custom hostname normalization", () => {
  it("parses arrays", () => {
    expect(parseCustomHostnamesInput(["overseerr.33w.io", " requests.33w.io "])).toEqual([
      "overseerr.33w.io",
      "requests.33w.io",
    ]);
  });

  it("parses JSON strings from the service form", () => {
    expect(parseCustomHostnamesInput('["overseerr.33w.io","requests.33w.io"]')).toEqual([
      "overseerr.33w.io",
      "requests.33w.io",
    ]);
  });

  it("parses newline and comma separated text", () => {
    expect(parseCustomHostnamesInput("overseerr.33w.io\nrequests.33w.io,alt.33w.io")).toEqual([
      "overseerr.33w.io",
      "requests.33w.io",
      "alt.33w.io",
    ]);
  });

  it("serializes normalized hostnames for database storage", () => {
    expect(customHostnamesJsonOrNull('["overseerr.33w.io","requests.33w.io"]')).toBe(
      JSON.stringify(["overseerr.33w.io", "requests.33w.io"]),
    );
  });
});
