import { NextRequest, NextResponse } from "next/server";
import {
  adminCookieOptions,
  createAdminSessionCookie,
  createInitialLocalAdminUser,
  getAdminAuthConfig,
} from "@/lib/admin-auth";
import { ADMIN_SESSION_COOKIE, adminAuthEnabled } from "@/lib/admin-auth-shared";
import { readJsonBody, rateLimit, RequestBodyError } from "@/lib/request-guards";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "admin-local-setup", limit: 5, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const wantsHtml = isFormPost(request);
  if (!adminAuthEnabled()) {
    return authError(request, "Admin authentication is disabled", 400, wantsHtml);
  }

  try {
    const { username, password, confirmPassword, returnTo } = await readCredentials(request);
    if (!username || !password) {
      return authError(request, "Username and password are required", 400, wantsHtml);
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return authError(request, "Passwords do not match", 400, wantsHtml);
    }

    const user = await createInitialLocalAdminUser(username, password);
    const config = await getAdminAuthConfig();
    const sessionToken = await createAdminSessionCookie({ sub: user.username, name: user.username }, user.role, config.sessionDurationHours);
    const response = wantsHtml
      ? redirectToPublicUrl(request, safeReturnTo(returnTo), 303)
      : NextResponse.json({ ok: true, user: { username: user.username, role: user.role } });
    response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, adminCookieOptions(config.sessionDurationHours * 60 * 60));
    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return authError(request, error.message, error.status, wantsHtml);
    }

    return authError(request, error instanceof Error ? error.message : "Unable to create admin user", 400, wantsHtml);
  }
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
      confirmPassword: String(form.get("confirm-password") || ""),
      returnTo: String(form.get("returnTo") || "/"),
    };
  }

  return readJsonBody<{ username?: string; password?: string; confirmPassword?: string; returnTo?: string }>(request);
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
