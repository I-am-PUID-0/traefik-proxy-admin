import { NextRequest, NextResponse } from "next/server";
import { generateSSOAuthUrl, getServiceSSOConfig } from "@/lib/sso-config";
import { ServiceSecurityService } from "@/lib/services/service-security.service";
import { randomBytes } from "crypto";
import { rateLimit } from "@/lib/request-guards";
import { SSO_STATE_COOKIES } from "@/lib/sso-state-cookies";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { key: "service-sso-login", limit: 60, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const searchParams = request.nextUrl.searchParams;
    const serviceId = searchParams.get("serviceId");
    const returnTo = searchParams.get("returnTo");

    if (!serviceId) {
      return NextResponse.json({ error: "Service ID required" }, { status: 400 });
    }

    const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(serviceId);
    const serviceSsoConfig = securityConfigs.find((config) => config.securityType === "sso");
    if (!serviceSsoConfig) {
      return NextResponse.json({ error: "SSO not configured for this service" }, { status: 400 });
    }

    const parsedServiceConfig = JSON.parse(serviceSsoConfig.config) as { ssoConfigId?: string };
    const ssoConfig = await getServiceSSOConfig(parsedServiceConfig.ssoConfigId);

    if (!ssoConfig.enabled) {
      return NextResponse.json({ error: "SSO not configured" }, { status: 400 });
    }

    const state = randomBytes(32).toString("hex");
    const stateData = {
      type: "service",
      serviceId,
      returnTo,
      ssoConfigId: parsedServiceConfig.ssoConfigId || null,
      timestamp: Date.now(),
    };

    const response = NextResponse.redirect(generateSSOAuthUrl(ssoConfig, state));
    response.cookies.set(SSO_STATE_COOKIES.service.data, JSON.stringify(stateData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    response.cookies.set(SSO_STATE_COOKIES.service.token, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("SSO login error:", error);
    return NextResponse.json({ error: "SSO login failed" }, { status: 500 });
  }
}
