import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SsoProviderService } from "@/lib/services/sso-provider.service";

export interface SSOConfig {
  enabled: boolean;
  idpUrl?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userinfoUrl?: string | null;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

const DEFAULT_SSO_CONFIG: SSOConfig = {
  enabled: false,
  idpUrl: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "",
  scopes: ["openid", "profile", "email"],
};

function normalizeConfig(value: unknown): SSOConfig {
  if (!value || typeof value !== "object") {
    return DEFAULT_SSO_CONFIG;
  }

  const config = value as Partial<SSOConfig>;
  return {
    enabled: Boolean(config.enabled),
    idpUrl: typeof config.idpUrl === "string" ? config.idpUrl : "",
    authorizationUrl: typeof config.authorizationUrl === "string" ? config.authorizationUrl : "",
    tokenUrl: typeof config.tokenUrl === "string" ? config.tokenUrl : "",
    userinfoUrl: typeof config.userinfoUrl === "string" ? config.userinfoUrl : "",
    clientId: typeof config.clientId === "string" ? config.clientId : "",
    clientSecret: typeof config.clientSecret === "string" ? config.clientSecret : "",
    redirectUri: typeof config.redirectUri === "string" ? config.redirectUri : "",
    scopes: Array.isArray(config.scopes) ? config.scopes.filter((scope): scope is string => typeof scope === "string") : DEFAULT_SSO_CONFIG.scopes,
  };
}

export async function getSSOConfig(): Promise<SSOConfig> {
  const configs = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "sso_config"));

  if (configs.length === 0) {
    return DEFAULT_SSO_CONFIG;
  }

  return normalizeConfig(JSON.parse(configs[0].value));
}

export async function getServiceSSOConfig(ssoConfigId?: string | null): Promise<SSOConfig> {
  if (ssoConfigId) {
    const config = await SsoProviderService.getSecretConfigById(ssoConfigId);
    if (!config) {
      throw new Error("SSO provider configuration not found");
    }

    return {
      enabled: config.enabled,
      idpUrl: config.idpUrl,
      authorizationUrl: config.authorizationUrl,
      tokenUrl: config.tokenUrl,
      userinfoUrl: config.userinfoUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      scopes: JSON.parse(config.scopes) as string[],
    };
  }

  return getSSOConfig();
}

export async function updateSSOConfig(config: SSOConfig): Promise<void> {
  const configValue = JSON.stringify(normalizeConfig(config));

  await db
    .insert(appConfig)
    .values({
      key: "sso_config",
      value: configValue,
      description: "SSO Identity Provider Configuration",
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: {
        value: configValue,
        updatedAt: new Date(),
      },
    });
}

export function endpoint(config: SSOConfig, explicit: keyof Pick<SSOConfig, "authorizationUrl" | "tokenUrl" | "userinfoUrl">, suffix: string): string {
  const configured = config[explicit];
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }

  const base = config.idpUrl?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("SSO provider endpoint is not configured");
  }

  return `${base}${suffix}`;
}

export function resolveSSOEndpoints(config: SSOConfig) {
  return {
    authorizationUrl: endpoint(config, "authorizationUrl", "/auth"),
    tokenUrl: endpoint(config, "tokenUrl", "/token"),
    userinfoUrl: endpoint(config, "userinfoUrl", "/userinfo"),
  };
}

export function validateSSOConfigForUse(config: SSOConfig, options: { requireEnabled?: boolean } = {}) {
  const errors: string[] = [];
  if (options.requireEnabled && !config.enabled) errors.push("Provider is disabled");
  if (!config.clientId?.trim()) errors.push("Client ID is required");
  if (!config.clientSecret?.trim()) errors.push("Client secret is required");
  if (!config.redirectUri?.trim()) errors.push("Redirect URI is required");
  if (!Array.isArray(config.scopes) || config.scopes.filter(Boolean).length === 0) errors.push("At least one scope is required");

  try {
    const endpoints = resolveSSOEndpoints(config);
    for (const [label, value] of Object.entries(endpoints)) {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) errors.push(`${label} must use http or https`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Provider endpoints are invalid");
  }

  try {
    const redirect = new URL(config.redirectUri);
    if (!["http:", "https:"].includes(redirect.protocol)) errors.push("Redirect URI must use http or https");
  } catch {
    if (config.redirectUri?.trim()) errors.push("Redirect URI must be a valid URL");
  }

  return errors;
}
export function generateSSOAuthUrl(config: SSOConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(" "),
    state,
  });

  return `${endpoint(config, "authorizationUrl", "/auth")}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  config: SSOConfig,
  code: string
): Promise<{ access_token: string; id_token?: string }> {
  const response = await fetch(endpoint(config, "tokenUrl", "/token"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange code for token");
  }

  return response.json();
}

export async function getUserInfo(
  config: SSOConfig,
  accessToken: string
): Promise<{ sub: string; name?: string; email?: string; groups?: string[] }> {
  const response = await fetch(endpoint(config, "userinfoUrl", "/userinfo"), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  return response.json();
}
