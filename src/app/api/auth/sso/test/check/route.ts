import { NextRequest, NextResponse } from "next/server";
import { resolveSSOEndpoints, validateSSOConfigForUse, type SSOConfig } from "@/lib/sso-config";
import { assertSsoEndpointAllowed } from "@/lib/sso-endpoint-guard";
import { bodyErrorResponse, rateLimit, readJsonBody } from "@/lib/request-guards";

interface ProbeResult {
  label: string;
  url: string;
  reachable: boolean;
  status?: number;
  error?: string;
}

function normalizeScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) return scopes.map((scope) => String(scope).trim()).filter(Boolean);
  if (typeof scopes === "string") return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  return ["openid", "profile", "email"];
}

function normalizeConfig(body: Record<string, unknown>): SSOConfig {
  return {
    enabled: Boolean(body.enabled ?? true),
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

async function probe(label: string, url: string): Promise<ProbeResult> {
  let allowedUrl: string;
  try {
    allowedUrl = await assertSsoEndpointAllowed(url);
  } catch (error) {
    return {
      label,
      url,
      reachable: false,
      error: error instanceof Error ? error.message : "Endpoint is not allowed",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // allowedUrl has been parsed, DNS-resolved, and rejected unless private/local results are explicitly allowlisted.
    // codeql[js/request-forgery]
    const response = await fetch(allowedUrl, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
    });
    return { label, url, reachable: response.status < 500, status: response.status };
  } catch (error) {
    return {
      label,
      url,
      reachable: false,
      error: error instanceof Error ? error.message : "Endpoint probe failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "sso-test-check", limit: 30, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const config = normalizeConfig(await readJsonBody<Record<string, unknown>>(request, 64 * 1024));
    const errors = validateSSOConfigForUse(config);
    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors, probes: [] });
    }

    const endpoints = resolveSSOEndpoints(config);
    const probes = await Promise.all([
      probe("authorization", endpoints.authorizationUrl),
      probe("token", endpoints.tokenUrl),
      probe("userinfo", endpoints.userinfoUrl),
    ]);
    const failed = probes.filter((item) => !item.reachable);

    return NextResponse.json({
      ok: failed.length === 0,
      errors: failed.map((item) => `${item.label} endpoint is not reachable${item.error ? `: ${item.error}` : ""}`),
      endpoints,
      probes,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    return NextResponse.json(
      { ok: false, errors: [error instanceof Error ? error.message : "SSO provider check failed"], probes: [] },
      { status: 500 },
    );
  }
}
