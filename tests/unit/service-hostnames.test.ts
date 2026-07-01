import { describe, expect, it } from "vitest";
import {
  customHostnamesJsonOrNull,
  getPrimaryServiceHostname,
  getServiceHostnames,
  parseCustomHostnamesInput,
} from "@/lib/service-hostnames";

describe("custom hostname normalization", () => {
  it("parses arrays", () => {
    expect(parseCustomHostnamesInput(["overseerr.example.com", " requests.example.com "])).toEqual([
      "overseerr.example.com",
      "requests.example.com",
    ]);
  });

  it("parses JSON strings from the service form", () => {
    expect(parseCustomHostnamesInput('["overseerr.example.com","requests.example.com"]')).toEqual([
      "overseerr.example.com",
      "requests.example.com",
    ]);
  });

  it("parses newline and comma separated text", () => {
    expect(parseCustomHostnamesInput("overseerr.example.com\nrequests.example.com,alt.example.com")).toEqual([
      "overseerr.example.com",
      "requests.example.com",
      "alt.example.com",
    ]);
  });

  it("serializes normalized hostnames for database storage", () => {
    expect(customHostnamesJsonOrNull('["overseerr.example.com","requests.example.com"]')).toBe(
      JSON.stringify(["overseerr.example.com", "requests.example.com"]),
    );
  });

  it("builds subdomain hostnames", () => {
    expect(getServiceHostnames(
      { hostnameMode: "subdomain", subdomain: "app", customHostnames: null },
      { domain: "example.com" },
    )).toEqual(["app.example.com"]);
  });

  it("builds apex hostnames without a subdomain", () => {
    expect(getPrimaryServiceHostname(
      { hostnameMode: "apex", subdomain: null, customHostnames: null },
      { domain: "example.com" },
    )).toBe("example.com");
  });

  it("uses the first custom hostname as the primary service hostname", () => {
    expect(getPrimaryServiceHostname(
      { hostnameMode: "custom", subdomain: null, customHostnames: JSON.stringify(["custom.example.net", "alt.example.net"]) },
      { domain: "example.com" },
    )).toBe("custom.example.net");
  });

  it("does not invent a hostname for incomplete service routing", () => {
    expect(getPrimaryServiceHostname(
      { hostnameMode: "subdomain", subdomain: null, customHostnames: null },
      { domain: "example.com" },
    )).toBeNull();
    expect(getPrimaryServiceHostname(
      { hostnameMode: "custom", subdomain: null, customHostnames: null },
      { domain: "example.com" },
    )).toBeNull();
  });
});
