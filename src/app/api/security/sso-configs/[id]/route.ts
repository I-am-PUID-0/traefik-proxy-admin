import { NextRequest, NextResponse } from "next/server";
import { SsoProviderService } from "@/lib/services/sso-provider.service";
import type { UpdateSsoConfigRequest, SsoConfigData } from "@/lib/dto/sso-provider.dto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) {
    return scopes.map((scope) => String(scope).trim()).filter(Boolean);
  }
  if (typeof scopes === "string") {
    return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  }
  return ["openid", "profile", "email"];
}

function normalizeBody(body: UpdateSsoConfigRequest): SsoConfigData {
  return {
    name: body.name?.trim() || "",
    description: body.description?.trim() || null,
    enabled: body.enabled ?? true,
    idpUrl: body.idpUrl?.trim() || null,
    authorizationUrl: body.authorizationUrl?.trim() || null,
    tokenUrl: body.tokenUrl?.trim() || null,
    userinfoUrl: body.userinfoUrl?.trim() || null,
    clientId: body.clientId?.trim() || "",
    clientSecret: body.clientSecret?.trim(),
    redirectUri: body.redirectUri?.trim() || "",
    scopes: normalizeScopes(body.scopes),
  };
}

function validate(data: SsoConfigData) {
  const errors: string[] = [];
  if (!data.name) errors.push("Name is required");
  if (!data.clientId) errors.push("Client ID is required");
  if (!data.redirectUri) errors.push("Redirect URI is required");
  if (!data.authorizationUrl && !data.idpUrl) errors.push("Authorization URL or IdP base URL is required");
  if (!data.tokenUrl && !data.idpUrl) errors.push("Token URL or IdP base URL is required");
  if (!data.userinfoUrl && !data.idpUrl) errors.push("Userinfo URL or IdP base URL is required");
  if (data.scopes.length === 0) errors.push("At least one scope is required");
  return errors;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    const includeSecret = request.nextUrl.searchParams.get("includeSecret") === "true";
    const config = await SsoProviderService.getConfigById(id, includeSecret);
    if (!config) return NextResponse.json({ error: "SSO configuration not found" }, { status: 404 });
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error fetching SSO config:", error);
    return NextResponse.json({ error: "Failed to fetch SSO configuration" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    const data = normalizeBody(await request.json());
    const errors = validate(data);
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
    }
    const config = await SsoProviderService.updateConfig(id, data);
    return NextResponse.json(config);
  } catch (error) {
    console.error("Error updating SSO config:", error);
    if (error instanceof Error) {
      if (error.message === "SSO configuration not found") return NextResponse.json({ error: error.message }, { status: 404 });
      if (error.message.includes("already exists")) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update SSO configuration" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    await SsoProviderService.deleteConfig(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting SSO config:", error);
    if (error instanceof Error && error.message === "SSO configuration not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete SSO configuration" }, { status: 500 });
  }
}
