import { NextRequest, NextResponse } from "next/server";
import {
  adminCookieOptions,
  authenticateLocalAdminUser,
  createAdminSessionCookie,
  getAdminAuthConfig,
} from "@/lib/admin-auth";
import { ADMIN_SESSION_COOKIE, adminAuthEnabled } from "@/lib/admin-auth-shared";
import { readJsonBody, rateLimit, RequestBodyError } from "@/lib/request-guards";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "admin-local-login", limit: 10, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const wantsHtml = isFormPost(request);
  if (!adminAuthEnabled()) {
    return authError(request, "Admin authentication is disabled", 400, wantsHtml);
  }

  const config = await getAdminAuthConfig();
  if (config.provider !== "local" && !config.allowLocalFallback) {
    return authError(request, "Local admin login is disabled while SSO is the selected provider", 403, wantsHtml);
  }

  let credentials: { username?: string; password?: string; returnTo?: string };
  try {
    credentials = await readCredentials(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return authError(request, error.message, error.status, wantsHtml);
    }
    throw error;
  }

  const { username, password, returnTo } = credentials;
  if (!username || !password) {
    return authError(request, "Username and password are required", 400, wantsHtml);
  }

  const user = await authenticateLocalAdminUser(username, password);
  if (!user) {
    return authError(request, "Incorrect username or password", 401, wantsHtml);
  }

  const sessionToken = await createAdminSessionCookie({ sub: user.username, name: user.username }, user.role, config.sessionDurationHours);
  const response = wantsHtml
    ? redirectToPublicUrl(request, safeReturnTo(returnTo), 303)
    : NextResponse.json({ ok: true, user: { username: user.username, role: user.role } });
  response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, adminCookieOptions(config.sessionDurationHours * 60 * 60));
  return response;
}

function isFormPost(request: NextRequest) {
  return request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
}

async function readCredentials(request: NextRequest) {
  if (isFormPost(request)) {
    const form = await request.formData();
    return {
      username: String(form.get("username") || ""),
      password: String(form.get("password") || ""),
      returnTo: String(form.get("returnTo") || "/"),
    };
  }

  return readJsonBody<{ username?: string; password?: string; returnTo?: string }>(request);
}

function authError(request: NextRequest, error: string, status: number, wantsHtml: boolean) {
  if (!wantsHtml) return NextResponse.json({ error }, { status });
  const url = publicUrl(request, "/auth/login");
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

function safeReturnTo(returnTo: string | undefined) {
  return returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
}

function redirectToPublicUrl(request: NextRequest, path: string, status = 302) {
  return NextResponse.redirect(publicUrl(request, path), { status });
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
