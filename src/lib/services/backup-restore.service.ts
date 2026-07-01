import "server-only";
import { db } from "@/lib/db";
import {
  appConfig,
  basicAuthConfigs,
  basicAuthUsers,
  domains,
  ipJailDecisions,
  serviceSecurityConfigs,
  services,
  sharedLinks,
  ssoConfigs,
  type AppConfig,
  type BasicAuthConfig,
  type BasicAuthUser,
  type Domain,
  type IpJailDecision,
  type Service,
  type ServiceSecurityConfig,
  type SharedLink,
  type SsoConfig,
} from "@/lib/db/schema";

const BACKUP_FORMAT = "traefik-proxy-admin.backup";
const BACKUP_VERSION = 1;

type BackupTableName =
  | "appConfig"
  | "domains"
  | "services"
  | "serviceSecurityConfigs"
  | "sharedLinks"
  | "basicAuthConfigs"
  | "basicAuthUsers"
  | "ssoConfigs"
  | "ipJailDecisions";

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion?: string;
  includesSecrets: true;
  excluded: string[];
  data: {
    appConfig: AppConfig[];
    domains: Domain[];
    services: Service[];
    serviceSecurityConfigs: ServiceSecurityConfig[];
    sharedLinks: SharedLink[];
    basicAuthConfigs: BasicAuthConfig[];
    basicAuthUsers: BasicAuthUser[];
    ssoConfigs: SsoConfig[];
    ipJailDecisions: IpJailDecision[];
  };
}

export interface BackupRestoreSummary {
  mode: "dry-run" | "replace";
  counts: Record<BackupTableName, number>;
  warnings: string[];
  restored?: boolean;
}

function reviveDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function withDates<T extends Record<string, unknown>>(row: T, fields: string[]) {
  const next = { ...row };
  for (const field of fields) {
    const date = reviveDate(next[field]);
    if (date) next[field as keyof T] = date as T[keyof T];
  }
  return next;
}

function normalizeRows<T extends Record<string, unknown>>(rows: unknown, dateFields: string[]): T[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is T => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => withDates(row, dateFields) as T);
}

function assertBackupPayload(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Backup must be a JSON object");
  }

  const candidate = payload as Partial<BackupPayload>;
  if (candidate.format !== BACKUP_FORMAT || candidate.version !== BACKUP_VERSION) {
    throw new Error("Unsupported backup format or version");
  }

  if (!candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) {
    throw new Error("Backup is missing data");
  }

  const data = candidate.data as Partial<BackupPayload["data"]>;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
    appVersion: typeof candidate.appVersion === "string" ? candidate.appVersion : undefined,
    includesSecrets: true,
    excluded: Array.isArray(candidate.excluded) ? candidate.excluded.map(String) : [],
    data: {
      appConfig: normalizeRows<AppConfig>(data.appConfig, ["createdAt", "updatedAt"]),
      domains: normalizeRows<Domain>(data.domains, ["createdAt", "updatedAt"]),
      services: normalizeRows<Service>(data.services, ["enabledAt", "createdAt", "updatedAt"]),
      serviceSecurityConfigs: normalizeRows<ServiceSecurityConfig>(data.serviceSecurityConfigs, ["createdAt", "updatedAt"]),
      sharedLinks: normalizeRows<SharedLink>(data.sharedLinks, ["expiresAt", "usedAt", "createdAt"]),
      basicAuthConfigs: normalizeRows<BasicAuthConfig>(data.basicAuthConfigs, ["createdAt", "updatedAt"]),
      basicAuthUsers: normalizeRows<BasicAuthUser>(data.basicAuthUsers, ["createdAt", "updatedAt"]),
      ssoConfigs: normalizeRows<SsoConfig>(data.ssoConfigs, ["createdAt", "updatedAt"]),
      ipJailDecisions: normalizeRows<IpJailDecision>(data.ipJailDecisions, ["expiresAt", "createdAt", "updatedAt"]),
    },
  };
}

function countsFor(payload: BackupPayload): Record<BackupTableName, number> {
  return {
    appConfig: payload.data.appConfig.length,
    domains: payload.data.domains.length,
    services: payload.data.services.length,
    serviceSecurityConfigs: payload.data.serviceSecurityConfigs.length,
    sharedLinks: payload.data.sharedLinks.length,
    basicAuthConfigs: payload.data.basicAuthConfigs.length,
    basicAuthUsers: payload.data.basicAuthUsers.length,
    ssoConfigs: payload.data.ssoConfigs.length,
    ipJailDecisions: payload.data.ipJailDecisions.length,
  };
}

function warningsFor(payload: BackupPayload) {
  const warnings = [
    "Restore replace mode deletes existing services, domains, security configs, shared links, reusable auth providers, and app config before importing this backup.",
    "Backups include sensitive data such as SSO client secrets, basic-auth password hashes, local admin password hashes, and admin auth configuration.",
    "Active sessions and one-time auth tickets are intentionally excluded.",
  ];

  if (payload.data.services.length === 0) warnings.push("Backup does not include any services.");
  if (payload.data.domains.length === 0) warnings.push("Backup does not include any domains.");
  return warnings;
}

export class BackupRestoreService {
  static async exportBackup(): Promise<BackupPayload> {
    const [
      allAppConfig,
      allDomains,
      allServices,
      allServiceSecurityConfigs,
      allSharedLinks,
      allBasicAuthConfigs,
      allBasicAuthUsers,
      allSsoConfigs,
      allIpJailDecisions,
    ] = await Promise.all([
      db.select().from(appConfig),
      db.select().from(domains),
      db.select().from(services),
      db.select().from(serviceSecurityConfigs),
      db.select().from(sharedLinks),
      db.select().from(basicAuthConfigs),
      db.select().from(basicAuthUsers),
      db.select().from(ssoConfigs),
      db.select().from(ipJailDecisions),
    ]);

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: process.env.npm_package_version,
      includesSecrets: true,
      excluded: ["sessions", "serviceAuthTickets"],
      data: {
        appConfig: allAppConfig,
        domains: allDomains,
        services: allServices,
        serviceSecurityConfigs: allServiceSecurityConfigs,
        sharedLinks: allSharedLinks,
        basicAuthConfigs: allBasicAuthConfigs,
        basicAuthUsers: allBasicAuthUsers,
        ssoConfigs: allSsoConfigs,
        ipJailDecisions: allIpJailDecisions,
      },
    };
  }

  static inspectBackup(payload: unknown): BackupRestoreSummary {
    const backup = assertBackupPayload(payload);
    return {
      mode: "dry-run",
      counts: countsFor(backup),
      warnings: warningsFor(backup),
    };
  }

  static async restoreBackup(payload: unknown): Promise<BackupRestoreSummary> {
    const backup = assertBackupPayload(payload);

    await db.transaction(async (tx) => {
      await tx.delete(ipJailDecisions);
      await tx.delete(serviceSecurityConfigs);
      await tx.delete(sharedLinks);
      await tx.delete(services);
      await tx.delete(domains);
      await tx.delete(basicAuthUsers);
      await tx.delete(basicAuthConfigs);
      await tx.delete(ssoConfigs);
      await tx.delete(appConfig);

      if (backup.data.domains.length > 0) await tx.insert(domains).values(backup.data.domains);
      if (backup.data.services.length > 0) await tx.insert(services).values(backup.data.services);
      if (backup.data.basicAuthConfigs.length > 0) await tx.insert(basicAuthConfigs).values(backup.data.basicAuthConfigs);
      if (backup.data.basicAuthUsers.length > 0) await tx.insert(basicAuthUsers).values(backup.data.basicAuthUsers);
      if (backup.data.ssoConfigs.length > 0) await tx.insert(ssoConfigs).values(backup.data.ssoConfigs);
      if (backup.data.serviceSecurityConfigs.length > 0) await tx.insert(serviceSecurityConfigs).values(backup.data.serviceSecurityConfigs);
      if (backup.data.sharedLinks.length > 0) await tx.insert(sharedLinks).values(backup.data.sharedLinks);
      if (backup.data.ipJailDecisions.length > 0) await tx.insert(ipJailDecisions).values(backup.data.ipJailDecisions);
      if (backup.data.appConfig.length > 0) await tx.insert(appConfig).values(backup.data.appConfig);
    });

    return {
      mode: "replace",
      counts: countsFor(backup),
      warnings: warningsFor(backup),
      restored: true,
    };
  }
}
