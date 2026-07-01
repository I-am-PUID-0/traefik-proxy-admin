import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getSSOConfig, generateSSOAuthUrl } from "@/lib/sso-config";
import { getAdminAuthConfig } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/request-guards";
import { SSO_STATE_COOKIES } from "@/lib/sso-state-cookies";
import { createSignedSSOState } from "@/lib/sso-state-token";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { key: "admin-sso-login", limit: 30, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const adminConfig = await getAdminAuthConfig();
    if (adminConfig.provider !== "sso") {
      return NextResponse.json({ error: "Admin SSO is not enabled" }, { status: 400 });
    }

    const ssoConfig = await getSSOConfig();
    if (!ssoConfig.enabled) {
      const hasConfig = Boolean(ssoConfig.clientId || ssoConfig.redirectUri || ssoConfig.authorizationUrl || ssoConfig.idpUrl);
      return NextResponse.json({ error: hasConfig ? "Global SSO provider is saved but disabled" : "Global SSO provider is not configured" }, { status: 400 });
    }

    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const stateData = {
      type: "admin" as const,
      returnTo,
      redirectUri: ssoConfig.redirectUri,
      timestamp: Date.now(),
    };
    const state = createSignedSSOState(stateData);

    const response = NextResponse.redirect(generateSSOAuthUrl(ssoConfig, state));
    response.cookies.set(SSO_STATE_COOKIES.admin.data, JSON.stringify(stateData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    response.cookies.set(SSO_STATE_COOKIES.admin.token, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error("Admin SSO login error:", error);
    return NextResponse.json({ error: "Admin SSO login failed" }, { status: 500 });
  }
}

function safeReturnTo(returnTo: string | null) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return "/";
  return returnTo;
}
