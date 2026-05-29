import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionManager } from "@/lib/session-manager";
import { db, domains, services, sharedLinks } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { TRAEFIK_SESSION_COOKIE, COOKIE_DEFAULTS } from "@/lib/constants";
import { ServiceSecurityService } from "@/lib/services/service-security.service";
import type { Domain, Service } from "@/lib/db/schema";
import { getGlobalConfig } from "@/lib/app-config";
import { consumeServiceAuthTicket, SERVICE_AUTH_TICKET_PARAM } from "@/lib/service-auth-tickets";
import { getSessionRequestContext } from "@/lib/session-request-context";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const serviceId = searchParams.get("serviceId");

  const forwardedUri = request.headers.get("X-Forwarded-Uri");
  const originalUri = forwardedUri || request.nextUrl.pathname + request.nextUrl.search;
  const originalUrl = new URL(originalUri, "https://example.com");
  const traefikToken = originalUrl.searchParams.get("traefik-token");
  const serviceAuthTicket = originalUrl.searchParams.get(SERVICE_AUTH_TICKET_PARAM);

  if (!serviceId) {
    return NextResponse.json({ error: "Service ID required" }, { status: 400 });
  }

  try {
    const [service] = await db.select().from(services).where(eq(services.id, serviceId));

    if (!service || !service.enabled) {
      return NextResponse.json({ error: "Service not found or disabled" }, { status: 404 });
    }

    const [domain] = await db.select().from(domains).where(eq(domains.id, service.domainId));
    if (!domain) {
      return NextResponse.json({ error: "Service domain not found" }, { status: 404 });
    }

    const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(serviceId);

    if (securityConfigs.length === 0) {
      if (isDirectVerifierRequest(originalUri)) {
        return NextResponse.redirect(getServicePublicUrl(request, service, domain), { status: 302 });
      }

      return NextResponse.json({ status: "authorized" });
    }

    const sharedLinkConfig = securityConfigs.find((config) => config.securityType === "shared_link");
    if (traefikToken && sharedLinkConfig) {
      const sharedLinkResponse = await authorizeSharedLink(request, service, domain, serviceId, traefikToken, originalUri);
      if (sharedLinkResponse) return sharedLinkResponse;
    }

    if (serviceAuthTicket) {
      const ticketResponse = await authorizeServiceAuthTicket(serviceAuthTicket, serviceId, request, originalUri, service, domain);
      if (ticketResponse) return ticketResponse;
    }

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(TRAEFIK_SESSION_COOKIE)?.value;
    const ssoConfig = securityConfigs.find((config) => config.securityType === "sso");

    if (!sessionToken) {
      return ssoConfig ? await ssoRequiredResponse(request, serviceId, originalUri, service, domain) : unauthorized(sharedLinkConfig);
    }

    const session = await sessionManager.getSession(sessionToken, getSessionRequestContext(request, originalUri));

    if (!session || session.serviceId !== serviceId || session.authMethod === "bypass_observed") {
      return ssoConfig ? await ssoRequiredResponse(request, serviceId, originalUri, service, domain) : unauthorized(sharedLinkConfig);
    }

    if (serviceAuthTicket) {
      return NextResponse.redirect(getCleanOriginalUrl(request, originalUri, service, domain), { status: 302 });
    }

    if (isDirectVerifierRequest(originalUri)) {
      return NextResponse.redirect(getServicePublicUrl(request, service, domain), { status: 302 });
    }

    return NextResponse.json({
      status: "authorized",
      user: session.userIdentifier,
    });
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function authorizeServiceAuthTicket(
  ticketToken: string,
  serviceId: string,
  request: NextRequest,
  originalUri: string,
  service: Service,
  domain: Domain,
) {
  const consumed = await consumeServiceAuthTicket(ticketToken, serviceId);
  if (!consumed) return null;

  sessionManager.rememberSession(consumed.session);
  await sessionManager.getSession(consumed.session.sessionToken, getSessionRequestContext(request, originalUri));

  const response = NextResponse.redirect(getCleanOriginalUrl(request, originalUri, service, domain), { status: 302 });

  response.cookies.set(TRAEFIK_SESSION_COOKIE, consumed.session.sessionToken, {
    ...COOKIE_DEFAULTS,
    expires: consumed.session.expiresAt,
  });

  return response;
}

async function authorizeSharedLink(
  request: NextRequest,
  service: Service,
  domain: Domain,
  serviceId: string,
  traefikToken: string,
  originalUri: string,
) {
  const [sharedLink] = await db
    .select()
    .from(sharedLinks)
    .where(and(eq(sharedLinks.token, traefikToken), eq(sharedLinks.serviceId, serviceId), gt(sharedLinks.expiresAt, new Date())));

  if (!sharedLink) return null;

  const cookieStore = await cookies();
  const existingSessionToken = cookieStore.get(TRAEFIK_SESSION_COOKIE)?.value;

  if (existingSessionToken) {
    const existingSession = await sessionManager.getSession(existingSessionToken, getSessionRequestContext(request, originalUri));

    if (existingSession && existingSession.serviceId === serviceId) {
      const cookieExpiresAt = getServiceSessionExpiry(service);
      await sessionManager.extendSession(existingSessionToken, cookieExpiresAt);
      cookieStore.set(TRAEFIK_SESSION_COOKIE, existingSessionToken, {
        ...COOKIE_DEFAULTS,
        expires: cookieExpiresAt,
      });

      return NextResponse.redirect(getCleanOriginalUrl(request, originalUri, service, domain), { status: 302 });
    }
  }

  const newSessionToken = crypto.randomUUID().replace(/-/g, "");
  const { session, cookieExpiresAt } = await sessionManager.createSessionWithOptimalCookieExpiry(
    serviceId,
    newSessionToken,
    sharedLink.sessionDurationMinutes,
    sharedLink.id,
    "shared-link-user",
    {
      ...getSessionRequestContext(request, originalUri),
      authMethod: "shared_link",
    },
  );

  cookieStore.set(TRAEFIK_SESSION_COOKIE, session.sessionToken, {
    ...COOKIE_DEFAULTS,
    expires: cookieExpiresAt,
  });

  return NextResponse.redirect(getCleanOriginalUrl(request, originalUri, service, domain), { status: 302 });
}

function getServiceSessionExpiry(service: Service) {
  if (service.enableDurationMinutes === null || service.enableDurationMinutes === undefined || !service.enabledAt) {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  }

  return new Date(service.enabledAt.getTime() + service.enableDurationMinutes * 60 * 1000);
}

async function ssoRequiredResponse(
  request: NextRequest,
  serviceId: string,
  originalUri: string,
  service: Service,
  domain: Domain,
) {
  const loginUrl = await buildSSOLoginUrl(request, serviceId, originalUri, service, domain);

  if (isInteractiveBrowserRequest(request, originalUri)) {
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  return NextResponse.json(
    { error: "SSO session required", loginUrl: loginUrl.toString() },
    { status: 401, headers: { "X-TPA-Login-Url": loginUrl.toString() } },
  );
}

async function buildSSOLoginUrl(
  request: NextRequest,
  serviceId: string,
  originalUri: string,
  service: Service,
  domain: Domain,
) {
  const loginUrl = new URL("/api/auth/sso/login", await getAdminPublicBaseUrl(request));
  loginUrl.searchParams.set("serviceId", serviceId);
  loginUrl.searchParams.set("returnTo", getOriginalRequestUrl(request, originalUri, service, domain));
  return loginUrl;
}

function isInteractiveBrowserRequest(request: NextRequest, originalUri: string) {
  if (isDirectVerifierRequest(originalUri)) return true;

  const accept = request.headers.get("Accept") || "";
  const mode = request.headers.get("Sec-Fetch-Mode") || "";
  const destination = request.headers.get("Sec-Fetch-Dest") || "";
  const requestedWith = request.headers.get("X-Requested-With") || "";

  if (requestedWith.toLowerCase() === "xmlhttprequest") return false;
  if (destination && destination !== "document") return false;
  if (mode && mode !== "navigate") return false;
  if (accept.includes("text/html")) return true;

  try {
    const url = new URL(originalUri || "/", "https://example.invalid");
    return !url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

async function getAdminPublicBaseUrl(request: NextRequest) {
  const globalConfig = await getGlobalConfig();
  const configuredPublicUrl = globalConfig.adminPanelPublicUrl?.trim() || "";

  if (configuredPublicUrl) {
    return normalizeBaseUrl(configuredPublicUrl);
  }

  return normalizeBaseUrl(request.nextUrl.origin);
}

function normalizeBaseUrl(value: string) {
  let baseUrl = value.trim();

  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = "https://" + baseUrl;
  }

  while (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return baseUrl;
}

function getOriginalRequestUrl(
  request: NextRequest,
  originalUri: string,
  service: Service,
  domain: Domain,
) {
  if (isDirectVerifierRequest(originalUri)) {
    return getServicePublicUrl(request, service, domain).toString();
  }

  const host = firstForwardedHeader(request.headers.get("X-Forwarded-Host")) || request.headers.get("Host") || "localhost";
  const protocol = firstForwardedHeader(request.headers.get("X-Forwarded-Proto")) || "https";
  return new URL(originalUri || "/", `${protocol}://${host}`).toString();
}

function getCleanOriginalUrl(
  request: NextRequest,
  originalUri: string,
  service: Service,
  domain: Domain,
) {
  const cleanUrl = new URL(getOriginalRequestUrl(request, originalUri, service, domain));
  cleanUrl.searchParams.delete("traefik-token");
  cleanUrl.searchParams.delete(SERVICE_AUTH_TICKET_PARAM);
  return cleanUrl.toString();
}

function isDirectVerifierRequest(originalUri: string) {
  try {
    const url = new URL(originalUri || "/", "https://example.invalid");
    return url.pathname.startsWith("/api/auth/verify");
  } catch {
    return true;
  }
}

function getServicePublicUrl(
  request: NextRequest,
  service: Service,
  domain: Domain,
) {
  const protocol = firstForwardedHeader(request.headers.get("X-Forwarded-Proto")) || "https";
  const host = getServiceHost(service, domain) || firstForwardedHeader(request.headers.get("X-Forwarded-Host")) || request.headers.get("Host") || request.nextUrl.host;
  return new URL("/", `${protocol}://${host}`);
}

function getServiceHost(service: Service, domain: Domain) {
  if (service.hostnameMode === "apex") return domain.domain;

  if (service.hostnameMode === "custom") {
    const hostnames = parseCustomHostnames(service.customHostnames);
    if (hostnames.length > 0) return hostnames[0];
  }

  return service.subdomain ? `${service.subdomain}.${domain.domain}` : domain.domain;
}

function parseCustomHostnames(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function firstForwardedHeader(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function unauthorized(sharedLinkConfig?: { securityType: string }) {
  if (sharedLinkConfig) {
    return NextResponse.json({ error: "Shared link session required" }, { status: 401 });
  }

  return NextResponse.json({ error: "No session found" }, { status: 401 });
}
