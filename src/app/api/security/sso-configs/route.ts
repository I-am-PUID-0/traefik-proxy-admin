import { NextRequest, NextResponse } from "next/server";
import { SsoProviderService } from "@/lib/services/sso-provider.service";
import type { CreateSsoConfigRequest, SsoConfigData } from "@/lib/dto/sso-provider.dto";

function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) {
    return scopes.map((scope) => String(scope).trim()).filter(Boolean);
  }
  if (typeof scopes === "string") {
    return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  }
  return ["openid", "profile", "email"];
}

function normalizeBody(body: CreateSsoConfigRequest): SsoConfigData {
  return {
    name: body.name?.trim(),
    description: body.description?.trim() || null,
    enabled: body.enabled ?? true,
    idpUrl: body.idpUrl?.trim() || null,
    authorizationUrl: body.authorizationUrl?.trim() || null,
    tokenUrl: body.tokenUrl?.trim() || null,
    userinfoUrl: body.userinfoUrl?.trim() || null,
    clientId: body.clientId?.trim(),
    clientSecret: body.clientSecret?.trim(),
    redirectUri: body.redirectUri?.trim(),
    scopes: normalizeScopes(body.scopes),
  };
}

function validate(data: SsoConfigData, requireSecret: boolean) {
  const errors: string[] = [];
  if (!data.name) errors.push("Name is required");
  if (!data.clientId) errors.push("Client ID is required");
  if (requireSecret && !data.clientSecret) errors.push("Client secret is required");
  if (!data.redirectUri) errors.push("Redirect URI is required");
  if (!data.authorizationUrl && !data.idpUrl) errors.push("Authorization URL or IdP base URL is required");
  if (!data.tokenUrl && !data.idpUrl) errors.push("Token URL or IdP base URL is required");
  if (!data.userinfoUrl && !data.idpUrl) errors.push("Userinfo URL or IdP base URL is required");
  if (data.scopes.length === 0) errors.push("At least one scope is required");
  return errors;
}

export async function GET() {
  try {
    const configs = await SsoProviderService.getAllConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error("Error fetching SSO configs:", error);
    return NextResponse.json({ error: "Failed to fetch SSO configurations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = normalizeBody(await request.json());
    const errors = validate(data, true);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
    }

    const config = await SsoProviderService.createConfig(data);
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error creating SSO config:", error);
    if (error instanceof Error && error.message.includes("already exists")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create SSO configuration" }, { status: 500 });
  }
}
