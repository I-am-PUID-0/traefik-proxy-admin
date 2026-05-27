import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { COOKIE_DEFAULTS, TRAEFIK_SESSION_COOKIE } from "@/lib/constants";
import { db, services } from "@/lib/db";
import { getSessionRequestContext } from "@/lib/session-request-context";
import { sessionManager } from "@/lib/session-manager";
import { ServiceSecurityService } from "@/lib/services/service-security.service";

const LONG_LIVED_OBSERVED_MINUTES = 10 * 365 * 24 * 60;

export async function GET(request: NextRequest) {
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const configId = request.nextUrl.searchParams.get("configId");
  const originalUri = request.headers.get("X-Forwarded-Uri") || request.nextUrl.pathname + request.nextUrl.search;

  if (!serviceId || !configId) {
    return NextResponse.json({ error: "serviceId and configId are required" }, { status: 400 });
  }

  try {
    const [service] = await db.select().from(services).where(eq(services.id, serviceId));
    if (!service || !service.enabled) {
      return NextResponse.json({ error: "Service not found or disabled" }, { status: 404 });
    }

    const securityConfig = await ServiceSecurityService.getSecurityConfigById(configId);
    if (!securityConfig || securityConfig.serviceId !== serviceId || securityConfig.securityType !== "bypass" || !securityConfig.isEnabled) {
      return NextResponse.json({ error: "Observed bypass configuration not found" }, { status: 404 });
    }

    const parsedConfig = securityConfig.parsedConfig as { name?: string; mode?: string; sessionDurationMinutes?: number };
    if (parsedConfig.mode !== "observed") {
      return NextResponse.json({ error: "Bypass configuration is not observed" }, { status: 400 });
    }

    const context = getSessionRequestContext(request, originalUri);
    const cookieStore = await cookies();
    const existingToken = cookieStore.get(TRAEFIK_SESSION_COOKIE)?.value;
    const sessionDurationMinutes = typeof parsedConfig.sessionDurationMinutes === "number" && parsedConfig.sessionDurationMinutes > 0
      ? Math.min(parsedConfig.sessionDurationMinutes, LONG_LIVED_OBSERVED_MINUTES)
      : LONG_LIVED_OBSERVED_MINUTES;

    if (existingToken) {
      const existingSession = await sessionManager.getSession(existingToken, context);
      if (existingSession && existingSession.serviceId === serviceId && existingSession.authMethod === "bypass_observed") {
        return NextResponse.json({ status: "authorized", observed: true });
      }
    }

    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + sessionDurationMinutes * 60 * 1000);
    const session = await sessionManager.createSession(
      serviceId,
      sessionToken,
      expiresAt,
      undefined,
      parsedConfig.name ? `Bypass: ${parsedConfig.name}` : "Bypass rule",
      {
        ...context,
        authMethod: "bypass_observed",
      },
    );

    const response = NextResponse.json({ status: "authorized", observed: true });
    const cookieExpiresAt = expiresAt;
    response.cookies.set(TRAEFIK_SESSION_COOKIE, session.sessionToken, {
      ...COOKIE_DEFAULTS,
      expires: cookieExpiresAt,
    });
    return response;
  } catch (error) {
    console.error("Observed bypass error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
