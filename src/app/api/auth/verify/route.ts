import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionManager } from "@/lib/session-manager";
import { db, services, sharedLinks } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { TRAEFIK_SESSION_COOKIE, COOKIE_DEFAULTS } from "@/lib/constants";
import { ServiceSecurityService } from "@/lib/services/service-security.service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const serviceId = searchParams.get("serviceId");

  const originalUri = request.headers.get("X-Forwarded-Uri") || "/";
  const originalUrl = new URL(originalUri, "https://example.com");
  const traefikToken = originalUrl.searchParams.get("traefik-token");

  if (!serviceId) {
    return NextResponse.json({ error: "Service ID required" }, { status: 400 });
  }

  try {
    const [service] = await db.select().from(services).where(eq(services.id, serviceId));

    if (!service || !service.enabled) {
      return NextResponse.json({ error: "Service not found or disabled" }, { status: 404 });
    }

    const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(serviceId);

    if (securityConfigs.length === 0) {
      return NextResponse.json({ status: "authorized" });
    }

    const sharedLinkConfig = securityConfigs.find((config) => config.securityType === "shared_link");
    if (traefikToken && sharedLinkConfig) {
      const sharedLinkResponse = await authorizeSharedLink(request, service, serviceId, traefikToken, originalUri);
      if (sharedLinkResponse) return sharedLinkResponse;
    }

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(TRAEFIK_SESSION_COOKIE)?.value;
    const ssoConfig = securityConfigs.find((config) => config.securityType === "sso");

    if (!sessionToken) {
      return ssoConfig ? redirectToSSOLogin(request, serviceId, originalUri) : unauthorized();
    }

    const session = await sessionManager.getSession(sessionToken);

    if (!session || session.serviceId !== serviceId) {
      return ssoConfig ? redirectToSSOLogin(request, serviceId, originalUri) : unauthorized();
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

async function authorizeSharedLink(
  request: NextRequest,
  service: typeof services.$inferSelect,
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
    const existingSession = await sessionManager.getSession(existingSessionToken);

    if (existingSession && existingSession.serviceId === serviceId) {
      const cookieExpiresAt = getServiceSessionExpiry(service);
      await sessionManager.extendSession(existingSessionToken, cookieExpiresAt);
      cookieStore.set(TRAEFIK_SESSION_COOKIE, existingSessionToken, {
        ...COOKIE_DEFAULTS,
        expires: cookieExpiresAt,
      });

      return NextResponse.redirect(getCleanOriginalUrl(request, originalUri), { status: 302 });
    }
  }

  const newSessionToken = crypto.randomUUID().replace(/-/g, "");
  const { session, cookieExpiresAt } = await sessionManager.createSessionWithOptimalCookieExpiry(
    serviceId,
    newSessionToken,
    sharedLink.sessionDurationMinutes,
    sharedLink.id,
    "shared-link-user",
  );

  cookieStore.set(TRAEFIK_SESSION_COOKIE, session.sessionToken, {
    ...COOKIE_DEFAULTS,
    expires: cookieExpiresAt,
  });

  return NextResponse.redirect(getCleanOriginalUrl(request, originalUri), { status: 302 });
}

function getServiceSessionExpiry(service: typeof services.$inferSelect) {
  if (service.enableDurationMinutes === null || service.enableDurationMinutes === undefined || !service.enabledAt) {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  }

  return new Date(service.enabledAt.getTime() + service.enableDurationMinutes * 60 * 1000);
}

function redirectToSSOLogin(request: NextRequest, serviceId: string, originalUri: string) {
  const loginUrl = new URL("/api/auth/sso/login", request.nextUrl.origin);
  loginUrl.searchParams.set("serviceId", serviceId);
  loginUrl.searchParams.set("returnTo", getOriginalRequestUrl(request, originalUri));
  return NextResponse.redirect(loginUrl, { status: 302 });
}

function getOriginalRequestUrl(request: NextRequest, originalUri: string) {
  const host = request.headers.get("X-Forwarded-Host") || request.headers.get("Host") || "localhost";
  const protocol = request.headers.get("X-Forwarded-Proto") || "https";
  return new URL(originalUri || "/", `${protocol}://${host}`).toString();
}

function getCleanOriginalUrl(request: NextRequest, originalUri: string) {
  const cleanUrl = new URL(getOriginalRequestUrl(request, originalUri));
  cleanUrl.searchParams.delete("traefik-token");
  return cleanUrl.toString();
}

function unauthorized() {
  return NextResponse.json({ error: "No session found" }, { status: 401 });
}
