import { NextRequest, NextResponse } from "next/server";
import { getSSOConfig, getServiceSSOConfig, exchangeCodeForToken, getUserInfo, type SSOConfig } from "@/lib/sso-config";
import { sessionManager } from "@/lib/session-manager";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { TRAEFIK_SESSION_COOKIE, COOKIE_DEFAULTS } from "@/lib/constants";
import { ServiceSecurityService } from "@/lib/services/service-security.service";
import {
  adminCookieOptions,
  createAdminSessionCookie,
  getAdminAuthConfig,
  resolveAdminRole,
} from "@/lib/admin-auth";
import { ADMIN_SESSION_COOKIE, adminAuthEnabled, type AdminRole } from "@/lib/admin-auth-shared";

type SSOState = {
  type?: "service" | "admin" | "test";
  serviceId?: string;
  returnTo?: string | null;
  ssoConfigId?: string | null;
  testConfig?: SSOConfig;
  roleConfig?: { roles: Record<AdminRole, { users?: string[]; groups?: string[] }> } | null;
  timestamp: number;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    const storedStateData = request.cookies.get("sso_state")?.value;
    const storedStateToken = request.cookies.get("sso_state_token")?.value;

    if (!storedStateData || !storedStateToken || storedStateToken !== state) {
      return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
    }

    const stateData = JSON.parse(storedStateData) as SSOState;

    if (Date.now() - stateData.timestamp > 600000) {
      return NextResponse.json({ error: "State expired" }, { status: 400 });
    }

    const ssoProviderConfig = stateData.type === "service"
      ? await getServiceSSOConfig(stateData.ssoConfigId)
      : stateData.type === "test" && stateData.testConfig
        ? stateData.testConfig
        : await getSSOConfig();
    const tokens = await exchangeCodeForToken(ssoProviderConfig, code);
    const userInfo = await getUserInfo(ssoProviderConfig, tokens.access_token);

    if (stateData.type === "admin") {
      return handleAdminCallback(request, stateData, userInfo);
    }

    if (stateData.type === "test") {
      return handleTestCallback(userInfo, stateData);
    }

    return handleServiceCallback(request, stateData, userInfo);
  } catch (error) {
    console.error("SSO callback error:", error);
    return NextResponse.json({ error: "SSO authentication failed" }, { status: 500 });
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

  const sessionToken = randomBytes(32).toString("hex");
  const sessionDurationHours = 8;
  const { cookieExpiresAt } = await sessionManager.createSessionWithOptimalCookieExpiry(
    serviceId,
    sessionToken,
    sessionDurationHours * 60,
    undefined,
    userInfo.sub,
  );

  const fallback = publicUrl(request, "/auth/success").toString();
  const response = NextResponse.redirect(safeServiceReturnTo(stateData.returnTo, fallback));

  response.cookies.set(TRAEFIK_SESSION_COOKIE, sessionToken, {
    ...COOKIE_DEFAULTS,
    expires: cookieExpiresAt,
  });
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

function clearStateCookies(response: NextResponse) {
  response.cookies.delete("sso_state");
  response.cookies.delete("sso_state_token");
}

function safeLocalReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  return returnTo;
}

function safeServiceReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (!returnTo) return fallback;
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;

  try {
    const url = new URL(returnTo);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
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