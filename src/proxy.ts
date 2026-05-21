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
  "/api/auth/sso/test/check",
  "/api/auth/sso/test/start",
  "/api/auth/verify",
  "/api/auth/shared-link",
  "/api/health",
  "/api/traefik/config",
  "/auth/forbidden",
  "/auth/login",
  "/auth/success",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES = ["/api/static/", "/_next/"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
    path.startsWith("/api/auth/admin/config") ||
    path.startsWith("/api/auth/admin/users")
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
    return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
  }

  const loginUrl = publicUrl(request, "/auth/login");
  loginUrl.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

function forbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Insufficient admin role" }, { status: 403 });
  }

  return NextResponse.redirect(publicUrl(request, "/auth/forbidden"));
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
  if (!adminAuthEnabled() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const session = await verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) {
    return unauthorized(request);
  }

  if (!roleAllows(session.role, requiredRole(request))) {
    return forbidden(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\..*).*)", "/api/:path*"],
};
