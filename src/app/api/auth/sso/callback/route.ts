import { NextRequest, NextResponse } from "next/server";
import { getSSOConfig, getServiceSSOConfig, exchangeCodeForToken, getUserInfo, SSOAuthError, type SSOConfig } from "@/lib/sso-config";
import { sessionManager } from "@/lib/session-manager";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { ServiceSecurityService } from "@/lib/services/service-security.service";
import {
  adminCookieOptions,
  createAdminSessionCookie,
  getAdminAuthConfig,
  resolveAdminRole,
} from "@/lib/admin-auth";
import { hasAdminRoleMappings } from "@/lib/admin-role-mapping";
import { ADMIN_SESSION_COOKIE, adminAuthEnabled, type AdminRole } from "@/lib/admin-auth-shared";
import { rateLimit } from "@/lib/request-guards";
import { LEGACY_SSO_STATE_COOKIES, SSO_STATE_COOKIES } from "@/lib/sso-state-cookies";
import { verifySignedSSOState } from "@/lib/sso-state-token";
import { buildServiceAuthTicketUrl, createServiceAuthTicket } from "@/lib/service-auth-tickets";
import { getSessionRequestContext } from "@/lib/session-request-context";

type SSOState = {
  type?: "service" | "admin" | "test";
  serviceId?: string;
  returnTo?: string | null;
  ssoConfigId?: string | null;
  redirectUri?: string;
  testConfig?: SSOConfig;
  roleConfig?: { roles: Record<AdminRole, { users?: string[]; groups?: string[] }> } | null;
  timestamp: number;
};

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { key: "sso-callback", limit: 120, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    const stateData = findMatchingStateData(request, state);

    if (!stateData) {
      return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
    }

    if (Date.now() - stateData.timestamp > 600000) {
      return NextResponse.json({ error: "State expired" }, { status: 400 });
    }

    const ssoProviderConfig = stateData.type === "service"
      ? await getServiceSSOConfig(stateData.ssoConfigId)
      : stateData.type === "test" && stateData.testConfig
        ? stateData.testConfig
        : await getSSOConfig();
    const tokenExchangeConfig = stateData.redirectUri
      ? { ...ssoProviderConfig, redirectUri: stateData.redirectUri }
      : ssoProviderConfig;

    if (stateData.redirectUri && stateData.redirectUri !== ssoProviderConfig.redirectUri) {
      console.warn("SSO redirect URI changed between login and callback; using login-time redirect URI for token exchange.");
    }

    const tokens = await exchangeCodeForToken(tokenExchangeConfig, code);
    const userInfo = await getUserInfo(ssoProviderConfig, tokens.access_token);

    if (stateData.type === "admin") {
      return handleAdminCallback(request, stateData, userInfo);
    }

    if (stateData.type === "test") {
      return handleTestCallback(userInfo, stateData);
    }

    return handleServiceCallback(request, stateData, userInfo, ssoProviderConfig);
  } catch (error) {
    console.error("SSO callback error:", error);
    if (error instanceof SSOAuthError) {
      return NextResponse.json({ error: "SSO authentication failed", stage: error.code, detail: error.publicDetail }, { status: 400 });
    }

    return NextResponse.json({ error: "SSO authentication failed", stage: "callback_unhandled" }, { status: 400 });
  }
}

async function handleTestCallback(
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
  stateData: SSOState,
) {
  const role = stateData.roleConfig ? resolveAdminRole({
    enabled: true,
    provider: "sso",
    allowLocalFallback: false,
    sessionDurationHours: 8,
    localUsers: [],
    roles: stateData.roleConfig.roles,
  }, userInfo) : null;
  const hasMappings = stateData.roleConfig ? hasAdminRoleMappings(stateData.roleConfig) : null;

  const payload = {
    ok: true,
    user: {
      sub: userInfo.sub,
      name: userInfo.name || null,
      email: userInfo.email || null,
      groups: userInfo.groups || [],
    },
    role,
    roleAllowed: stateData.roleConfig ? Boolean(role) : null,
    roleMappingConfigured: hasMappings,
    accessNote: stateData.roleConfig && !hasMappings
      ? "No admin SSO role mappings are configured. TPA admin access will be denied until this user or one of their groups is mapped to a role."
      : undefined,
  };

  const response = new NextResponse(renderTestResult(payload), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  clearStateCookies(response);
  return response;
}
async function handleAdminCallback(
  request: NextRequest,
  stateData: SSOState,
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
) {
  if (!adminAuthEnabled()) {
    return NextResponse.json({ error: "Admin authentication is disabled" }, { status: 400 });
  }

  const adminConfig = await getAdminAuthConfig();
  const role = resolveAdminRole(adminConfig, userInfo);

  if (!role) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const durationHours = adminConfig.sessionDurationHours || 8;
  const sessionToken = await createAdminSessionCookie(userInfo, role, durationHours);
  const response = redirectToPublicUrl(request, safeLocalReturnTo(stateData.returnTo, "/"));

  response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, adminCookieOptions(durationHours * 60 * 60));
  clearStateCookies(response);
  return response;
}

async function handleServiceCallback(
  request: NextRequest,
  stateData: SSOState,
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
  ssoProviderConfig: SSOConfig,
) {
  const { serviceId } = stateData;
  if (!serviceId) {
    return NextResponse.json({ error: "Service ID required" }, { status: 400 });
  }

  const [service] = await db.select().from(services).where(eq(services.id, serviceId));

  if (!service || !service.enabled) {
    return NextResponse.json({ error: "Service not found or disabled" }, { status: 404 });
  }

  const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(serviceId);
  const ssoConfigRecord = securityConfigs.find((config) => config.securityType === "sso");

  if (!ssoConfigRecord) {
    return NextResponse.json({ error: "SSO not configured for this service" }, { status: 403 });
  }

  const ssoConfig = JSON.parse(ssoConfigRecord.config) as { ssoConfigId?: string; groups: string[]; users: string[] };
  if (!checkUserAuthorization(ssoConfig, userInfo)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const userIdentifier = getDisplayUserIdentifier(userInfo);
  const requestContext = getSessionRequestContext(request, stateData.returnTo);
  const existingSession = await sessionManager.getActiveSessionForServiceUser(serviceId, userIdentifier);
  const sessionToken = existingSession?.sessionToken || randomBytes(32).toString("hex");

  if (!existingSession) {
    const sessionDurationHours = 8;
    await sessionManager.createSessionWithOptimalCookieExpiry(
      serviceId,
      sessionToken,
      sessionDurationHours * 60,
      undefined,
      userIdentifier,
      {
        ...requestContext,
        authMethod: "sso",
        ssoIssuer: ssoProviderConfig.idpUrl || ssoProviderConfig.authorizationUrl || null,
        ssoSubject: userInfo.sub,
        ssoEmail: userInfo.email || null,
        ssoName: userInfo.name || null,
        ssoGroups: userInfo.groups || [],
      },
    );
  }

  const fallback = publicUrl(request, "/auth/success").toString();
  const returnTo = safeServiceReturnTo(stateData.returnTo, fallback);
  const ticket = await createServiceAuthTicket({
    serviceId,
    sessionToken,
    returnTo,
    userIdentifier,
  });
  const response = NextResponse.redirect(buildServiceAuthTicketUrl(returnTo, serviceId, ticket.token));

  clearStateCookies(response);
  return response;
}

function redirectToPublicUrl(request: NextRequest, path: string) {
  return NextResponse.redirect(publicUrl(request, path));
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

function findMatchingStateData(request: NextRequest, state: string): SSOState | null {
  const cookiePairs = [
    SSO_STATE_COOKIES.service,
    SSO_STATE_COOKIES.admin,
    SSO_STATE_COOKIES.test,
    LEGACY_SSO_STATE_COOKIES,
  ];

  for (const pair of cookiePairs) {
    const data = request.cookies.get(pair.data)?.value;
    const token = request.cookies.get(pair.token)?.value;

    if (data && token === state) {
      return JSON.parse(data) as SSOState;
    }
  }

  const signedState = verifySignedSSOState(state);
  if (signedState) return signedState as SSOState;

  return null;
}

function clearStateCookies(response: NextResponse) {
  for (const pair of [
    SSO_STATE_COOKIES.service,
    SSO_STATE_COOKIES.admin,
    SSO_STATE_COOKIES.test,
    LEGACY_SSO_STATE_COOKIES,
  ]) {
    response.cookies.delete(pair.data);
    response.cookies.delete(pair.token);
  }
}

function safeLocalReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  return returnTo;
}

function safeServiceReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (!returnTo) return fallback;
  try {
    const url = new URL(returnTo);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function getDisplayUserIdentifier(userInfo: { sub: string; name?: string; email?: string }) {
  return userInfo.email?.trim() || userInfo.name?.trim() || userInfo.sub;
}

function checkUserAuthorization(
  ssoConfig: { groups: string[]; users: string[] },
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
): boolean {
  if (ssoConfig.groups.length === 0 && ssoConfig.users.length === 0) {
    return true;
  }

  if (ssoConfig.groups.length > 0 && userInfo.groups) {
    if (userInfo.groups.some((group) => ssoConfig.groups.includes(group))) {
      return true;
    }
  }

  if (ssoConfig.users.length > 0) {
    const identities = [userInfo.sub, userInfo.name, userInfo.email].filter(Boolean);
    if (ssoConfig.users.some((user) => identities.includes(user))) {
      return true;
    }
  }

  return false;
}

function renderTestResult(payload: unknown) {
  const json = JSON.stringify(payload, null, 2);
  const escaped = escapeHtml(json);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SSO Provider Test</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111827; color: #e5e7eb; }
    main { max-width: 900px; margin: 48px auto; padding: 24px; }
    .card { border: 1px solid #334155; background: #0f172a; border-radius: 8px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #94a3b8; }
    pre { overflow: auto; border-radius: 6px; background: #020617; padding: 16px; color: #bfdbfe; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>SSO provider test succeeded</h1>
      <p>The provider completed login and returned the following identity data. No admin or service session was created.</p>
      <pre>${escaped}</pre>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
