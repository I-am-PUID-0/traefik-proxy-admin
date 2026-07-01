import { describe, expect, it } from "vitest";
import {
  isValidHostname,
  isValidSubdomain,
  isValidTargetHost,
  isValidTargetPort,
  isValidTraefikName,
  validateDomainRoutingInput,
  validateServiceRoutingInput,
} from "@/lib/validators/route-input.validator";

describe("route input validation", () => {
  it("accepts valid hostnames, target hosts, Traefik names, and ports", () => {
    expect(isValidHostname("app.example.com")).toBe(true);
    expect(isValidHostname("example.test")).toBe(true);
    expect(isValidTargetHost("127.0.0.1")).toBe(true);
    expect(isValidTargetHost("service.docker")).toBe(true);
    expect(isValidTraefikName("websecure")).toBe(true);
    expect(isValidTraefikName("lets-encrypt_01")).toBe(true);
    expect(isValidTargetPort(443)).toBe(true);
  });

  it("rejects malformed hostnames and subdomains", () => {
    expect(isValidHostname("https://example.com")).toBe(false);
    expect(isValidHostname("*.example.com")).toBe(false);
    expect(isValidHostname("bad_host.example.com")).toBe(false);
    expect(isValidHostname(" example.com")).toBe(false);
    expect(isValidSubdomain("api")).toBe(true);
    expect(isValidSubdomain("api.example")).toBe(false);
    expect(isValidSubdomain("-api")).toBe(false);
  });

  it("rejects invalid Traefik names and ports", () => {
    expect(isValidTraefikName("websecure")).toBe(true);
    expect(isValidTraefikName("web secure")).toBe(false);
    expect(isValidTraefikName("@file")).toBe(false);
    expect(isValidTargetPort(0)).toBe(false);
    expect(isValidTargetPort(65536)).toBe(false);
    expect(isValidTargetPort(8080.5)).toBe(false);
  });

  it("validates domain routing input", () => {
    expect(() => validateDomainRoutingInput({
      domain: "example.com",
      certResolver: "letsencrypt",
      certificateConfigs: [
        {
          name: "example",
          main: "example.com",
          sans: ["www.example.com"],
          certResolver: "letsencrypt",
        },
      ],
    })).not.toThrow();

    expect(() => validateDomainRoutingInput({
      domain: "https://example.com",
      certResolver: "letsencrypt",
    })).toThrow("Invalid domain");
  });

  it("validates service routing input", () => {
    expect(() => validateServiceRoutingInput({
      name: "Example",
      subdomain: "app",
      hostnameMode: "subdomain",
      customHostnames: null,
      domainId: "domain-id",
      targetIp: "127.0.0.1",
      targetPort: 8080,
      entrypoint: "websecure",
      isHttps: false,
      insecureSkipVerify: false,
      passHostHeader: true,
      enabled: true,
    })).not.toThrow();

    expect(() => validateServiceRoutingInput({
      name: "Example",
      subdomain: "app.example",
      hostnameMode: "subdomain",
      customHostnames: null,
      domainId: "domain-id",
      targetIp: "127.0.0.1",
      targetPort: 8080,
      entrypoint: "websecure",
      isHttps: false,
      insecureSkipVerify: false,
      passHostHeader: true,
      enabled: true,
    })).toThrow("Invalid subdomain");
  });
});
