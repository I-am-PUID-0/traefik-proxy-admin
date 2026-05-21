import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { generateSSOAuthUrl, validateSSOConfigForUse, type SSOConfig } from "@/lib/sso-config";
import type { AdminAuthConfig } from "@/lib/admin-auth";
import { bodyErrorResponse, rateLimit, readJsonBody } from "@/lib/request-guards";

function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) return scopes.map((scope) => String(scope).trim()).filter(Boolean);
  if (typeof scopes === "string") return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  return ["openid", "profile", "email"];
}

function normalizeConfig(body: Record<string, unknown>): SSOConfig {
  return {
    enabled: true,
    idpUrl: typeof body.idpUrl === "string" ? body.idpUrl.trim() : "",
    authorizationUrl: typeof body.authorizationUrl === "string" ? body.authorizationUrl.trim() : "",
    tokenUrl: typeof body.tokenUrl === "string" ? body.tokenUrl.trim() : "",
    userinfoUrl: typeof body.userinfoUrl === "string" ? body.userinfoUrl.trim() : "",
    clientId: typeof body.clientId === "string" ? body.clientId.trim() : "",
    clientSecret: typeof body.clientSecret === "string" ? body.clientSecret.trim() : "",
    redirectUri: typeof body.redirectUri === "string" ? body.redirectUri.trim() : "",
    scopes: normalizeScopes(body.scopes),
  };
}

function normalizeRoleConfig(value: unknown): Pick<AdminAuthConfig, "roles"> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Pick<AdminAuthConfig, "roles">>;
  if (!record.roles) return null;
  return { roles: record.roles } as Pick<AdminAuthConfig, "roles">;
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "sso-test-start", limit: 20, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 64 * 1024);
    const configBody = body.config && typeof body.config === "object"
      ? body.config as Record<string, unknown>
      : body;
    const config = normalizeConfig(configBody);
    const errors = validateSSOConfigForUse(config);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
    }

    const state = randomBytes(32).toString("hex");
    const stateData = {
      type: "test",
      testConfig: config,
      roleConfig: normalizeRoleConfig(body.roleConfig),
      timestamp: Date.now(),
    };

    const response = NextResponse.json({ authorizationUrl: generateSSOAuthUrl(config, state) });
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
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start SSO provider test" },
      { status: 500 },
    );
  }
}
