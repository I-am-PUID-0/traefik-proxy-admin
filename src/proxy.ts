import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminAuthEnabled,
  roleAllows,
  verifyAdminSessionToken,
  type AdminRole,
} from "@/lib/admin-auth-shared";

const PUBLIC_PATHS = new Set([
  "/api/auth/admin/login",
  "/api/auth/admin/logout",
  "/api/auth/admin/me",
  "/api/auth/admin/status",
  "/api/auth/admin/local/login",
  "/api/auth/admin/local/setup",
  "/api/auth/sso/login",
  "/api/auth/sso/callback",
  "/api/auth/verify",
  "/api/auth/observe",
  "/api/auth/shared-link",
  "/tpa/auth/ticket",
  "/api/health",
  "/api/traefik/config",
  "/auth/forbidden",
  "/auth/login",
  "/auth/success",
  "/favicon.ico",
]);

const PUBLIC_CSRF_PROTECTED_PATHS = new Set([
  "/api/auth/admin/logout",
]);

const PUBLIC_PREFIXES = ["/api/static/", "/_next/"];
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function noStore(response: NextResponse) {
  for (const [header, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(header, value);
  }

  return response;
}

function requiredRole(request: NextRequest): AdminRole {
  const path = request.nextUrl.pathname;

  if (
    path.startsWith("/security") ||
    path.startsWith("/sessions") ||
    path.startsWith("/config") ||
    path.startsWith("/api/security") ||
    path.startsWith("/api/sessions") ||
    path.startsWith("/api/config") ||
    path.startsWith("/api/backup") ||
    path.startsWith("/api/auth/admin/config") ||
    path.startsWith("/api/auth/admin/users") ||
    path.startsWith("/api/auth/sso/test")
  ) {
    return "admin";
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return "editor";
  }

  return "viewer";
}

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return noStore(NextResponse.json({ error: "Admin authentication required" }, { status: 401 }));
  }

  const loginUrl = publicUrl(request, "/auth/login");
  loginUrl.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
  return noStore(NextResponse.redirect(loginUrl));
}

function forbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return noStore(NextResponse.json({ error: "Insufficient admin role" }, { status: 403 }));
  }

  return noStore(NextResponse.redirect(publicUrl(request, "/auth/forbidden")));
}

function unsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function csrfForbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return noStore(NextResponse.json({ error: "Cross-site admin request blocked" }, { status: 403 }));
  }

  return noStore(NextResponse.redirect(publicUrl(request, "/auth/forbidden")));
}

function sameOriginRequest(request: NextRequest) {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") return false;

  const expectedOrigin = publicOrigin(request);
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return true;
}

function publicUrl(request: NextRequest, path: string) {
  return new URL(path, publicOrigin(request));
}

function publicOrigin(request: NextRequest) {
  const proto = firstForwardedHeader(request.headers.get("x-forwarded-proto")) || request.nextUrl.protocol.replace(":", "") || "http";
  const host = firstForwardedHeader(request.headers.get("x-forwarded-host")) || request.headers.get("host") || request.nextUrl.host;
  return proto + "://" + host;
}

function firstForwardedHeader(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export async function proxy(request: NextRequest) {
  if (!adminAuthEnabled()) {
    return NextResponse.next();
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    if (
      PUBLIC_CSRF_PROTECTED_PATHS.has(request.nextUrl.pathname) &&
      unsafeMethod(request.method) &&
      !sameOriginRequest(request)
    ) {
      return csrfForbidden(request);
    }

    return NextResponse.next();
  }

  const session = await verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) {
    return unauthorized(request);
  }

  if (unsafeMethod(request.method) && !sameOriginRequest(request)) {
    return csrfForbidden(request);
  }

  if (!roleAllows(session.role, requiredRole(request))) {
    return forbidden(request);
  }

  return noStore(NextResponse.next());
}

export const config = {
  matcher: ["/((?!.*\..*).*)", "/api/:path*"],
};
