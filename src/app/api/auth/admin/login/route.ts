import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSSOConfig, generateSSOAuthUrl } from "@/lib/sso-config";
import { getAdminAuthConfig } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
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
    response.cookies.set("sso_state", JSON.stringify(stateData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    response.cookies.set("sso_state_token", state, {
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
