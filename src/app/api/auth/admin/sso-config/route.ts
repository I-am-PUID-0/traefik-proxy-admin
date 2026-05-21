import { NextRequest, NextResponse } from "next/server";
import { getSSOConfig, updateSSOConfig, type SSOConfig } from "@/lib/sso-config";

function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) {
    return scopes.map((scope) => String(scope).trim()).filter(Boolean);
  }
  if (typeof scopes === "string") {
    return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  }
  return ["openid", "profile", "email"];
}

function redact(config: SSOConfig, includeSecret = false) {
  return {
    enabled: config.enabled,
    idpUrl: config.idpUrl || "",
    authorizationUrl: config.authorizationUrl || "",
    tokenUrl: config.tokenUrl || "",
    userinfoUrl: config.userinfoUrl || "",
    clientId: config.clientId || "",
    redirectUri: config.redirectUri || "",
    scopes: config.scopes || ["openid", "profile", "email"],
    ...(includeSecret ? { clientSecret: config.clientSecret || "" } : {}),
    hasClientSecret: Boolean(config.clientSecret),
  };
}

function validate(config: SSOConfig, hasExistingSecret: boolean) {
  const errors: string[] = [];
  if (config.enabled) {
    if (!config.clientId.trim()) errors.push("Client ID is required when admin SSO is enabled");
    if (!config.clientSecret.trim() && !hasExistingSecret) errors.push("Client secret is required when admin SSO is enabled");
    if (!config.redirectUri.trim()) errors.push("Redirect URI is required when admin SSO is enabled");
    if (!config.authorizationUrl?.trim() && !config.idpUrl?.trim()) errors.push("Authorization URL or IdP base URL is required when admin SSO is enabled");
    if (!config.tokenUrl?.trim() && !config.idpUrl?.trim()) errors.push("Token URL or IdP base URL is required when admin SSO is enabled");
    if (!config.userinfoUrl?.trim() && !config.idpUrl?.trim()) errors.push("Userinfo URL or IdP base URL is required when admin SSO is enabled");
  }
  if (config.scopes.length === 0) errors.push("At least one scope is required");
  return errors;
}

export async function GET(request: NextRequest) {
  const includeSecret = request.nextUrl.searchParams.get("includeSecret") === "true";
  return NextResponse.json(redact(await getSSOConfig(), includeSecret));
}

export async function PUT(request: NextRequest) {
  const current = await getSSOConfig();
  const body = await request.json();
  const nextConfig: SSOConfig = {
    enabled: Boolean(body.enabled),
    idpUrl: typeof body.idpUrl === "string" ? body.idpUrl.trim() : "",
    authorizationUrl: typeof body.authorizationUrl === "string" ? body.authorizationUrl.trim() : "",
    tokenUrl: typeof body.tokenUrl === "string" ? body.tokenUrl.trim() : "",
    userinfoUrl: typeof body.userinfoUrl === "string" ? body.userinfoUrl.trim() : "",
    clientId: typeof body.clientId === "string" ? body.clientId.trim() : "",
    clientSecret: typeof body.clientSecret === "string" && body.clientSecret.trim() ? body.clientSecret.trim() : current.clientSecret,
    redirectUri: typeof body.redirectUri === "string" ? body.redirectUri.trim() : "",
    scopes: normalizeScopes(body.scopes),
  };

  const errors = validate(nextConfig, Boolean(current.clientSecret));
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  await updateSSOConfig(nextConfig);
  return NextResponse.json(redact(await getSSOConfig()));
}
