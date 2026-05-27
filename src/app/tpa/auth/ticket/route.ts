import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { COOKIE_DEFAULTS, TRAEFIK_SESSION_COOKIE } from "@/lib/constants";
import { db, domains, services } from "@/lib/db";
import type { Domain, Service } from "@/lib/db/schema";
import {
  consumeServiceAuthTicket,
  removeServiceAuthTicket,
  SERVICE_AUTH_TICKET_PARAM,
  SERVICE_AUTH_TICKET_RETURN_PARAM,
} from "@/lib/service-auth-tickets";
import { getSessionRequestContext } from "@/lib/session-request-context";
import { sessionManager } from "@/lib/session-manager";

export async function GET(request: NextRequest) {
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const ticketToken = request.nextUrl.searchParams.get(SERVICE_AUTH_TICKET_PARAM);

  if (!serviceId || !ticketToken) {
    return NextResponse.json({ error: "Service ID and auth ticket are required" }, { status: 400 });
  }

  const [service] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!service || !service.enabled) {
    return NextResponse.json({ error: "Service not found or disabled" }, { status: 404 });
  }

  const [domain] = await db.select().from(domains).where(eq(domains.id, service.domainId));
  if (!domain) {
    return NextResponse.json({ error: "Service domain not found" }, { status: 404 });
  }

  const returnTo = getSafeReturnTo(request, service, domain);
  const consumed = await consumeServiceAuthTicket(ticketToken, serviceId);
  if (!consumed) {
    return NextResponse.redirect(returnTo, { status: 302 });
  }

  sessionManager.rememberSession(consumed.session);
  await sessionManager.getSession(consumed.session.sessionToken, getSessionRequestContext(request, returnTo.pathname + returnTo.search));

  const response = NextResponse.redirect(returnTo, { status: 302 });
  response.cookies.set(TRAEFIK_SESSION_COOKIE, consumed.session.sessionToken, {
    ...COOKIE_DEFAULTS,
    expires: consumed.session.expiresAt,
  });

  return response;
}

function getSafeReturnTo(request: NextRequest, service: Service, domain: Domain) {
  const fallback = new URL("/", request.url);
  const rawReturnTo = request.nextUrl.searchParams.get(SERVICE_AUTH_TICKET_RETURN_PARAM);

  if (!rawReturnTo) return fallback;

  try {
    const returnTo = new URL(rawReturnTo, request.url);
    if (returnTo.protocol !== "http:" && returnTo.protocol !== "https:") return fallback;
    if (!getServiceHostnames(service, domain).includes(returnTo.host)) return fallback;

    return new URL(removeServiceAuthTicket(returnTo.toString()));
  } catch {
    return fallback;
  }
}

function getServiceHostnames(service: Service, domain: Domain) {
  switch (service.hostnameMode) {
    case "subdomain":
      return service.subdomain ? [service.subdomain + "." + domain.domain] : [];
    case "apex":
      return [domain.domain];
    case "custom":
      return parseCustomHostnames(service.customHostnames);
    default:
      return [];
  }
}

function parseCustomHostnames(customHostnames: string | null) {
  if (!customHostnames) return [];

  try {
    const parsed = JSON.parse(customHostnames);
    if (Array.isArray(parsed)) {
      return parsed.map((hostname) => String(hostname).trim()).filter(Boolean);
    }
  } catch {
    return customHostnames.split(",").map((hostname) => hostname.trim()).filter(Boolean);
  }

  return [];
}
