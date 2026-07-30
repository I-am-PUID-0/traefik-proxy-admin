import { NextRequest, NextResponse } from "next/server";
import {
  getAdminAuthConfig,
  updateAdminAuthConfig,
} from "@/lib/admin-auth";
import { getSSOConfig, updateSSOConfig } from "@/lib/sso-config";
import {
  bodyErrorResponse,
  rateLimit,
  readJsonBody,
  RequestBodyError,
} from "@/lib/request-guards";
import { SsoProviderService } from "@/lib/services/sso-provider.service";
import { isDumbIntegrationAuthorized } from "@/lib/dumb-integration-auth";

export const runtime = "nodejs";

interface LinkRequest {
  providerName?: string;
  issuerUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  configureAdminSso?: boolean;
  allowLocalFallback?: boolean;
  adminGroups?: string[];
}

function cleanUrl(value: unknown, label: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    if (parsed.username || parsed.password) throw new Error();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new RequestBodyError(`${label} must be a valid HTTP(S) URL`);
  }
}

function cleanStrings(value: unknown, defaults: string[] = []) {
  if (!Array.isArray(value)) return defaults;
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "dumb-authelia-link",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;
  if (!isDumbIntegrationAuthorized(request)) {
    return NextResponse.json({ error: "Invalid DUMB integration token" }, { status: 401 });
  }

  try {
    const body = await readJsonBody<LinkRequest>(request, 32 * 1024);
    const providerName = body.providerName?.trim() || "DUMB-managed Authelia";
    const issuerUrl = cleanUrl(body.issuerUrl, "Issuer URL");
    const authorizationUrl = cleanUrl(body.authorizationUrl, "Authorization URL");
    const tokenUrl = cleanUrl(body.tokenUrl, "Token URL");
    const userinfoUrl = cleanUrl(body.userinfoUrl, "Userinfo URL");
    const clientId = body.clientId?.trim() || "";
    const clientSecret = body.clientSecret?.trim() || "";
    const redirectUri = cleanUrl(body.redirectUri, "Redirect URI");
    const scopes = cleanStrings(body.scopes, ["openid", "profile", "email", "groups"]);
    if (!clientId || !clientSecret) {
      throw new RequestBodyError("Client ID and client secret are required");
    }

    const providerData = {
      name: providerName,
      description: "Managed by DUMB. Re-link from DUMB to rotate or update this provider.",
      enabled: true,
      idpUrl: issuerUrl,
      authorizationUrl,
      tokenUrl,
      userinfoUrl,
      clientId,
      clientSecret,
      redirectUri,
      scopes,
    };
    const existing = (await SsoProviderService.getAllConfigs()).find(
      (item) => item.name === providerName,
    );
    const provider = existing
      ? await SsoProviderService.updateConfig(existing.id, providerData)
      : await SsoProviderService.createConfig(providerData);

    let adminSsoConfigured = false;
    if (body.configureAdminSso !== false) {
      const currentSso = await getSSOConfig();
      await updateSSOConfig({
        ...currentSso,
        enabled: true,
        idpUrl: issuerUrl,
        authorizationUrl,
        tokenUrl,
        userinfoUrl,
        clientId,
        clientSecret,
        redirectUri,
        scopes,
      });
      const adminConfig = await getAdminAuthConfig();
      await updateAdminAuthConfig({
        ...adminConfig,
        provider: "sso",
        allowLocalFallback: body.allowLocalFallback !== false,
        roles: {
          ...adminConfig.roles,
          admin: {
            ...adminConfig.roles.admin,
            groups: cleanStrings(body.adminGroups, ["admins"]),
          },
        },
      });
      adminSsoConfigured = true;
    }

    return NextResponse.json({
      linked: true,
      providerId: provider.id,
      providerName: provider.name,
      adminSsoConfigured,
      localFallbackEnabled: body.allowLocalFallback !== false,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error);
    return NextResponse.json(
      { error: "Unable to link the DUMB-managed Authelia provider" },
      { status: 500 },
    );
  }
}
