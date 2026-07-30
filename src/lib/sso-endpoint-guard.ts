import type { IncomingHttpHeaders } from "node:http";
import type { LookupAddress } from "node:dns";
import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";
import { Client } from "undici";

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const resolvedEndpointBrand: unique symbol = Symbol("ResolvedSsoEndpoint");

export class SsoEndpointRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsoEndpointRejectedError";
  }
}

export interface SsoEndpointRequestOptions {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  maxResponseBytes?: number;
}

interface ResolvedSsoEndpoint {
  url: string;
  protocol: "http:" | "https:";
  hostname: string;
  hostHeader: string;
  requestPath: string;
  port: string;
  addresses: LookupAddress[];
  readonly [resolvedEndpointBrand]: true;
}

function splitList(value: string | undefined) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

function normalizedHostname(parsed: URL) {
  return parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

function allowedPrivateHosts() {
  return splitList(process.env.SSO_ENDPOINT_ALLOW_HOSTS);
}

function isHostAllowedForPrivateResolution(hostname: string) {
  return allowedPrivateHosts().includes(hostname.toLowerCase());
}

function endpointError(error: unknown) {
  if (error instanceof SsoEndpointRejectedError) return error;
  if (error instanceof Error && error.message) {
    return new SsoEndpointRejectedError(error.message);
  }
  return new SsoEndpointRejectedError("SSO endpoint is invalid");
}

async function resolveSsoEndpoint(
  rawUrl: string,
): Promise<ResolvedSsoEndpoint> {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new SsoEndpointRejectedError("SSO endpoint must use http or https");
    }
    if (parsed.username || parsed.password) {
      throw new SsoEndpointRejectedError(
        "SSO endpoint must not include embedded credentials",
      );
    }

    const hostname = normalizedHostname(parsed);
    const literalFamily = net.isIP(hostname);
    const addresses: LookupAddress[] = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await dns.lookup(hostname, { all: true, verbatim: true });

    if (addresses.length === 0) {
      throw new SsoEndpointRejectedError(
        "SSO endpoint hostname did not resolve",
      );
    }

    const hasNonPublicAddress = addresses.some(
      (entry) => !isPublicAddress(entry.address),
    );
    if (hasNonPublicAddress && !isHostAllowedForPrivateResolution(hostname)) {
      throw new SsoEndpointRejectedError(
        "SSO endpoint resolves to a private, local, or reserved address. " +
          "Add the hostname to SSO_ENDPOINT_ALLOW_HOSTS if this is intentional.",
      );
    }

    return {
      url: parsed.toString(),
      protocol: parsed.protocol === "https:" ? "https:" : "http:",
      hostname,
      hostHeader: parsed.host,
      requestPath: `${parsed.pathname}${parsed.search}`,
      port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
      addresses,
      [resolvedEndpointBrand]: true,
    };
  } catch (error) {
    throw endpointError(error);
  }
}

function transportOrigin(endpoint: ResolvedSsoEndpoint) {
  const selectedAddress = endpoint.addresses[0];
  const host =
    selectedAddress.family === 6
      ? `[${selectedAddress.address}]`
      : selectedAddress.address;
  return `${endpoint.protocol}//${host}:${endpoint.port}`;
}

function copyResponseHeaders(headers: IncomingHttpHeaders) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (typeof value === "string") {
      result.set(name, value);
    }
  }
  return result;
}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  maxResponseBytes: number,
) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxResponseBytes) {
      throw new Error(
        `SSO endpoint response exceeded ${maxResponseBytes} bytes`,
      );
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export async function assertSsoEndpointAllowed(rawUrl: string) {
  return (await resolveSsoEndpoint(rawUrl)).url;
}

export async function requestSsoEndpoint(
  rawUrl: string,
  options: SsoEndpointRequestOptions = {},
) {
  const endpoint = await resolveSsoEndpoint(rawUrl);
  // Connect directly to the classified DNS result so the request cannot be
  // rebound between validation and use. Preserve the provider hostname for
  // virtual hosting and TLS certificate/SNI verification.
  const client = new Client(transportOrigin(endpoint), {
    connect: {
      servername: net.isIP(endpoint.hostname) ? undefined : endpoint.hostname,
    },
  });

  try {
    const response = await client.request({
      path: endpoint.requestPath,
      method: options.method ?? "GET",
      headers: {
        ...options.headers,
        host: endpoint.hostHeader,
      },
      body: options.body,
      signal: options.signal,
    });
    const maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const responseBody = await readBoundedBody(response.body, maxResponseBytes);
    const bodyAllowed =
      ![101, 204, 205, 304].includes(response.statusCode) &&
      options.method !== "HEAD";

    return new Response(bodyAllowed ? responseBody : null, {
      status: response.statusCode,
      headers: copyResponseHeaders(response.headers),
    });
  } finally {
    await client.close();
  }
}
