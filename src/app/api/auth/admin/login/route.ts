import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSSOConfig, generateSSOAuthUrl } from "@/lib/sso-config";
import { getAdminAuthConfig } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/request-guards";
import { SSO_STATE_COOKIES } from "@/lib/sso-state-cookies";

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
    const state = randomBytes(32).toString("hex");
    const stateData = {
      type: "admin",
      returnTo,
      timestamp: Date.now(),
    };

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
    console.error("Admin SSO login error:", error);
    return NextResponse.json({ error: "Admin SSO login failed" }, { status: 500 });
  }
}

function safeReturnTo(returnTo: string | null) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return "/";
  return returnTo;
}
