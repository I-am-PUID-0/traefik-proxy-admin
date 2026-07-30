import { createServer, type Server } from "node:http";
import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSsoEndpointAllowed,
  requestSsoEndpoint,
  SsoEndpointRejectedError,
} from "@/lib/sso-endpoint-guard";

const originalAllowHosts = process.env.SSO_ENDPOINT_ALLOW_HOSTS;

function restoreAllowHosts() {
  if (originalAllowHosts === undefined) {
    delete process.env.SSO_ENDPOINT_ALLOW_HOSTS;
  } else {
    process.env.SSO_ENDPOINT_ALLOW_HOSTS = originalAllowHosts;
  }
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not expose a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreAllowHosts();
});

describe("SSO endpoint guard", () => {
  it.each([
    "http://127.0.0.1/token",
    "http://10.0.0.1/token",
    "http://100.64.0.1/token",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/token",
    "http://[::1]/token",
    "http://[::ffff:127.0.0.1]/token",
    "http://[fc00::1]/token",
  ])("rejects non-public endpoint %s", async (url) => {
    delete process.env.SSO_ENDPOINT_ALLOW_HOSTS;

    await expect(assertSsoEndpointAllowed(url)).rejects.toBeInstanceOf(
      SsoEndpointRejectedError,
    );
  });

  it("rejects unsupported schemes and embedded credentials", async () => {
    await expect(
      assertSsoEndpointAllowed("file:///etc/passwd"),
    ).rejects.toThrow("must use http or https");
    await expect(
      assertSsoEndpointAllowed("https://user:secret@example.com/token"),
    ).rejects.toThrow("must not include embedded credentials");
  });

  it("allows an explicitly allowlisted private endpoint and completes the request", async () => {
    process.env.SSO_ENDPOINT_ALLOW_HOSTS = "127.0.0.1";
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"access_token":"test-token"}');
    });
    const port = await listen(server);

    try {
      const response = await requestSsoEndpoint(
        `http://127.0.0.1:${port}/token`,
        { method: "POST", body: "grant_type=authorization_code" },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        access_token: "test-token",
      });
    } finally {
      await close(server);
    }
  });

  it("connects to the validated address while preserving the provider hostname", async () => {
    const providerHostname = "sso.example.test";
    process.env.SSO_ENDPOINT_ALLOW_HOSTS = providerHostname;
    const lookup = vi
      .spyOn(dns, "lookup")
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    let receivedHost = "";
    let receivedPath = "";
    const server = createServer((request, response) => {
      receivedHost = request.headers.host ?? "";
      receivedPath = request.url ?? "";
      response.writeHead(204);
      response.end();
    });
    const port = await listen(server);

    try {
      const response = await requestSsoEndpoint(
        `http://${providerHostname}:${port}/userinfo?flow=test`,
      );

      expect(response.status).toBe(204);
      expect(lookup).toHaveBeenCalledOnce();
      expect(receivedHost).toBe(`${providerHostname}:${port}`);
      expect(receivedPath).toBe("/userinfo?flow=test");
    } finally {
      await close(server);
    }
  });

  it("rejects oversized provider responses", async () => {
    process.env.SSO_ENDPOINT_ALLOW_HOSTS = "127.0.0.1";
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("response-is-too-large");
    });
    const port = await listen(server);

    try {
      await expect(
        requestSsoEndpoint(`http://127.0.0.1:${port}/userinfo`, {
          maxResponseBytes: 8,
        }),
      ).rejects.toThrow("response exceeded 8 bytes");
    } finally {
      await close(server);
    }
  });
});
