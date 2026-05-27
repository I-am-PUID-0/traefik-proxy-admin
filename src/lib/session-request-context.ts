import type { NextRequest } from "next/server";

export type SessionAuthMethod = "sso" | "shared_link" | "bypass_observed";

export interface SessionRequestContext {
  clientIp?: string | null;
  clientIpSource?: string | null;
  userAgent?: string | null;
  requestedHost?: string | null;
  lastPath?: string | null;
  entryPoint?: string | null;
}

export function getSessionRequestContext(request: NextRequest, fallbackUrl?: string | null): SessionRequestContext {
  const ip = getClientIp(request);
  const forwardedUri = firstHeaderValue(request.headers.get("x-forwarded-uri"));
  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) || request.headers.get("host") || request.nextUrl.host;
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")) || request.nextUrl.protocol.replace(":", "") || "https";

  return {
    clientIp: ip.value,
    clientIpSource: ip.source,
    userAgent: trimToLength(request.headers.get("user-agent"), 500),
    requestedHost: trimToLength(host, 255),
    lastPath: getSafePath(forwardedUri || fallbackUrl || request.nextUrl.pathname + request.nextUrl.search, `${protocol}://${host || "localhost"}`),
    entryPoint: trimToLength(firstHeaderValue(request.headers.get("x-forwarded-entrypoint")) || firstHeaderValue(request.headers.get("x-forwarded-server")), 120),
  };
}

function getClientIp(request: NextRequest) {
  const candidates = [
    ["cf-connecting-ip", firstHeaderValue(request.headers.get("cf-connecting-ip"))],
    ["true-client-ip", firstHeaderValue(request.headers.get("true-client-ip"))],
    ["x-real-ip", firstHeaderValue(request.headers.get("x-real-ip"))],
    ["x-forwarded-for", firstHeaderValue(request.headers.get("x-forwarded-for"))],
    ["forwarded", parseForwardedFor(request.headers.get("forwarded"))],
  ] as const;

  for (const [source, value] of candidates) {
    const normalized = normalizeIp(value);
    if (normalized) return { value: normalized, source };
  }

  return { value: null, source: null };
}

function parseForwardedFor(value: string | null) {
  if (!value) return "";
  const first = value.split(",")[0] || "";
  const match = first.match(/for=(?:\"?)([^;\"]+)/i);
  return match?.[1] || "";
}

function normalizeIp(value: string | null | undefined) {
  if (!value) return null;
  let ip = value.trim();
  if (!ip) return null;
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") > -1 ? ip.indexOf("]") : undefined);
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length === 2 && /^\d+$/.test(parts[1] || "")) ip = parts[0] || ip;
  }
  return trimToLength(ip.replace(/^\"|\"$/g, ""), 120);
}

function getSafePath(value: string, base: string) {
  try {
    const url = new URL(value || "/", base);
    return trimToLength(url.pathname || "/", 500);
  } catch {
    const path = value.split("?")[0] || "/";
    return trimToLength(path.startsWith("/") ? path : `/${path}`, 500);
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function trimToLength(value: string | null | undefined, max: number) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
