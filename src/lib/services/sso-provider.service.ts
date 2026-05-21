import "server-only";
import { db, ssoConfigs } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { SsoConfig } from "@/lib/db/schema";
import type { SsoConfigData, SsoConfigResponse } from "@/lib/dto/sso-provider.dto";

function normalizeScopes(scopes: string[] | string | null | undefined): string[] {
  if (Array.isArray(scopes)) {
    return scopes.map((scope) => scope.trim()).filter(Boolean);
  }
  if (typeof scopes === "string") {
    try {
      const parsed = JSON.parse(scopes) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((scope) => String(scope).trim()).filter(Boolean);
      }
    } catch {
      return scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
    }
  }
  return ["openid", "profile", "email"];
}

function trimNullable(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}

function toResponse(config: SsoConfig, includeSecret = false): SsoConfigResponse {
  const { clientSecret: _clientSecret, scopes, ...rest } = config;
  return {
    ...rest,
    scopes: normalizeScopes(scopes),
    ...(includeSecret ? { clientSecret: _clientSecret || "" } : {}),
    hasClientSecret: Boolean(_clientSecret),
  };
}

export class SsoProviderService {
  static async getAllConfigs(): Promise<SsoConfigResponse[]> {
    const configs = await db.select().from(ssoConfigs);
    return configs.map((config) => toResponse(config));
  }

  static async getConfigById(id: string, includeSecret = false): Promise<SsoConfigResponse | null> {
    const [config] = await db.select().from(ssoConfigs).where(eq(ssoConfigs.id, id));
    return config ? toResponse(config, includeSecret) : null;
  }

  static async getSecretConfigById(id: string): Promise<SsoConfig | null> {
    const [config] = await db.select().from(ssoConfigs).where(eq(ssoConfigs.id, id));
    return config || null;
  }

  static async createConfig(data: SsoConfigData): Promise<SsoConfigResponse> {
    const existing = await db.select().from(ssoConfigs).where(eq(ssoConfigs.name, data.name));
    if (existing.length > 0) {
      throw new Error("SSO configuration name already exists");
    }

    if (!data.clientSecret?.trim()) {
      throw new Error("Client secret is required");
    }

    const [config] = await db
      .insert(ssoConfigs)
      .values({
        name: data.name.trim(),
        description: trimNullable(data.description),
        enabled: data.enabled,
        idpUrl: trimNullable(data.idpUrl),
        authorizationUrl: trimNullable(data.authorizationUrl),
        tokenUrl: trimNullable(data.tokenUrl),
        userinfoUrl: trimNullable(data.userinfoUrl),
        clientId: data.clientId.trim(),
        clientSecret: data.clientSecret.trim(),
        redirectUri: data.redirectUri.trim(),
        scopes: JSON.stringify(normalizeScopes(data.scopes)),
      })
      .returning();

    return toResponse(config);
  }

  static async updateConfig(id: string, data: SsoConfigData): Promise<SsoConfigResponse> {
    const [current] = await db.select().from(ssoConfigs).where(eq(ssoConfigs.id, id));
    if (!current) {
      throw new Error("SSO configuration not found");
    }

    const existing = await db.select().from(ssoConfigs).where(eq(ssoConfigs.name, data.name));
    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error("SSO configuration name already exists");
    }

    const [config] = await db
      .update(ssoConfigs)
      .set({
        name: data.name.trim(),
        description: trimNullable(data.description),
        enabled: data.enabled,
        idpUrl: trimNullable(data.idpUrl),
        authorizationUrl: trimNullable(data.authorizationUrl),
        tokenUrl: trimNullable(data.tokenUrl),
        userinfoUrl: trimNullable(data.userinfoUrl),
        clientId: data.clientId.trim(),
        clientSecret: data.clientSecret?.trim() || current.clientSecret,
        redirectUri: data.redirectUri.trim(),
        scopes: JSON.stringify(normalizeScopes(data.scopes)),
        updatedAt: new Date(),
      })
      .where(eq(ssoConfigs.id, id))
      .returning();

    return toResponse(config);
  }

  static async deleteConfig(id: string): Promise<void> {
    const result = await db.delete(ssoConfigs).where(eq(ssoConfigs.id, id)).returning();
    if (result.length === 0) {
      throw new Error("SSO configuration not found");
    }
  }
}
