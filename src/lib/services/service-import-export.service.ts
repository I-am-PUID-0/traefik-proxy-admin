import "server-only";
import { and, eq } from "drizzle-orm";
import { db, domains, services } from "@/lib/db";
import { DomainService } from "@/lib/services/domain.service";
import { ServiceService } from "@/lib/services/service.service";
import { parseMiddlewareNames } from "@/lib/middleware-utils";
import type { CreateServiceData, HostnameMode } from "@/lib/dto/service.dto";

const EXPORT_FORMAT = "traefik-proxy-admin.services";
const EXPORT_VERSION = 1;

type JsonRecord = Record<string, unknown>;

export type ServiceImportConflictStrategy = "skip" | "rename";

export interface ExportedDomainData {
  name: string;
  domain: string;
  description?: string | null;
  useWildcardCert: boolean;
  certResolver: string;
  certificateConfigs?: unknown[] | string | null;
  isDefault?: boolean;
}

export interface ExportedServiceData {
  name: string;
  subdomain?: string | null;
  hostnameMode: HostnameMode;
  customHostnames?: string[];
  domain: ExportedDomainData;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  passHostHeader: boolean;
  enabled: boolean;
  enableDurationMinutes?: number | null;
  middlewares?: string[];
  requestHeaders?: JsonRecord | string | null;
  managedMiddlewares?: JsonRecord | string | null;
  advancedRouters?: unknown[] | string | null;
}

export interface ServicesExportPayload {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  services: ExportedServiceData[];
}

export interface ServiceImportResultItem {
  name: string;
  action: "created" | "skipped";
  serviceId?: string;
  reason?: string;
}

export interface ServiceImportResult {
  imported: number;
  skipped: number;
  services: ServiceImportResultItem[];
}

function parseJsonField(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyJsonField(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return value.trim() ? value : null;
  return JSON.stringify(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return parseMiddlewareNames(value);
  }
  return [];
}

function exportedServiceFromDb(
  service: NonNullable<Awaited<ReturnType<typeof ServiceService.getServiceByIdWithDomain>>>,
): ExportedServiceData {
  if (!service.domain) {
    throw new Error("Service has no domain and cannot be exported");
  }

  return {
    name: service.name,
    subdomain: service.subdomain || null,
    hostnameMode: service.hostnameMode,
    customHostnames: Array.isArray(parseJsonField(service.customHostnames))
      ? (parseJsonField(service.customHostnames) as string[])
      : [],
    domain: {
      name: service.domain.name,
      domain: service.domain.domain,
      description: service.domain.description,
      useWildcardCert: service.domain.useWildcardCert,
      certResolver: service.domain.certResolver,
      certificateConfigs: parseJsonField(service.domain.certificateConfigs) as unknown[] | string | null,
      isDefault: service.domain.isDefault,
    },
    targetIp: service.targetIp,
    targetPort: service.targetPort,
    entrypoint: service.entrypoint || null,
    isHttps: service.isHttps,
    insecureSkipVerify: service.insecureSkipVerify,
    passHostHeader: service.passHostHeader,
    enabled: service.enabled,
    enableDurationMinutes: service.enableDurationMinutes ?? null,
    middlewares: parseStringArray(parseJsonField(service.middlewares)),
    requestHeaders: parseJsonField(service.requestHeaders) as JsonRecord | string | null,
    managedMiddlewares: parseJsonField(service.managedMiddlewares) as JsonRecord | string | null,
    advancedRouters: parseJsonField(service.advancedRouters) as unknown[] | string | null,
  };
}

function assertExportPayload(payload: unknown): ServicesExportPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Import payload must be a JSON object");
  }

  const candidate = payload as Partial<ServicesExportPayload>;
  if (candidate.format !== EXPORT_FORMAT || candidate.version !== EXPORT_VERSION) {
    throw new Error("Unsupported service export format");
  }

  if (!Array.isArray(candidate.services)) {
    throw new Error("Import payload must include a services array");
  }

  return candidate as ServicesExportPayload;
}

async function findDomainByName(domainName: string) {
  const result = await db.select().from(domains).where(eq(domains.domain, domainName)).limit(1);
  return result[0] || null;
}

async function ensureDomainForImport(domainData: ExportedDomainData) {
  const domainName = normalizeString(domainData.domain);
  if (!domainName) throw new Error("Imported service is missing domain.domain");

  const existing = await findDomainByName(domainName);
  if (existing) return existing;

  return DomainService.createDomain({
    name: normalizeString(domainData.name) || domainName,
    domain: domainName,
    description: typeof domainData.description === "string" ? domainData.description : null,
    useWildcardCert: normalizeBoolean(domainData.useWildcardCert, true),
    certResolver: normalizeString(domainData.certResolver),
    certificateConfigs: stringifyJsonField(domainData.certificateConfigs),
    isDefault: false,
  });
}

async function serviceConflict(data: CreateServiceData) {
  const byName = await db.select({ id: services.id }).from(services).where(eq(services.name, data.name)).limit(1);
  if (byName.length > 0) return "name";

  if (data.hostnameMode === "subdomain" && data.subdomain) {
    const bySubdomain = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.domainId, data.domainId), eq(services.subdomain, data.subdomain)))
      .limit(1);
    if (bySubdomain.length > 0) return "subdomain";
  }

  return null;
}

async function uniqueImportedName(baseName: string): Promise<string> {
  let candidate = `${baseName} imported`;
  for (let index = 2; index < 100; index += 1) {
    const existing = await db.select({ id: services.id }).from(services).where(eq(services.name, candidate)).limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${baseName} imported ${index}`;
  }
  throw new Error("Could not find an available imported service name");
}

async function uniqueImportedSubdomain(baseSubdomain: string, domainId: string): Promise<string> {
  let candidate = `${baseSubdomain}-imported`;
  for (let index = 2; index < 100; index += 1) {
    const existing = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.domainId, domainId), eq(services.subdomain, candidate)))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${baseSubdomain}-imported-${index}`;
  }
  throw new Error("Could not find an available imported subdomain");
}

function normalizeImportedService(service: ExportedServiceData, domainId: string): CreateServiceData {
  const hostnameMode = ["subdomain", "apex", "custom"].includes(service.hostnameMode)
    ? service.hostnameMode
    : "subdomain";
  const targetPort = normalizeNumber(service.targetPort);
  const middlewares = parseStringArray(service.middlewares);

  if (!normalizeString(service.name)) throw new Error("Imported service is missing name");
  if (!normalizeString(service.targetIp)) throw new Error(`Imported service ${service.name} is missing targetIp`);
  if (!targetPort) throw new Error(`Imported service ${service.name} is missing targetPort`);

  return {
    name: normalizeString(service.name),
    subdomain: normalizeString(service.subdomain) || null,
    hostnameMode,
    customHostnames: Array.isArray(service.customHostnames) && service.customHostnames.length > 0
      ? JSON.stringify(service.customHostnames.map((hostname) => normalizeString(hostname)).filter(Boolean))
      : null,
    domainId,
    targetIp: normalizeString(service.targetIp),
    targetPort,
    entrypoint: normalizeString(service.entrypoint) || null,
    isHttps: normalizeBoolean(service.isHttps, false),
    insecureSkipVerify: normalizeBoolean(service.insecureSkipVerify, false),
    passHostHeader: normalizeBoolean(service.passHostHeader, true),
    enabled: normalizeBoolean(service.enabled, true),
    enableDurationMinutes: normalizeNumber(service.enableDurationMinutes),
    middlewares: middlewares.length > 0 ? JSON.stringify(middlewares) : null,
    requestHeaders: stringifyJsonField(service.requestHeaders),
    managedMiddlewares: stringifyJsonField(service.managedMiddlewares),
    advancedRouters: stringifyJsonField(service.advancedRouters),
  };
}

export class ServiceImportExportService {
  static async exportService(serviceId: string): Promise<ServicesExportPayload> {
    const service = await ServiceService.getServiceByIdWithDomain(serviceId);
    if (!service) throw new Error("Service not found");

    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      services: [exportedServiceFromDb(service)],
    };
  }

  static async exportAllServices(): Promise<ServicesExportPayload> {
    const allServices = await ServiceService.getAllServices();

    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      services: allServices.map((service) => exportedServiceFromDb(service)),
    };
  }

  static async importServices(
    payload: unknown,
    conflictStrategy: ServiceImportConflictStrategy = "skip",
  ): Promise<ServiceImportResult> {
    const exportPayload = assertExportPayload(payload);
    const result: ServiceImportResult = { imported: 0, skipped: 0, services: [] };

    for (const exportedService of exportPayload.services) {
      try {
        const domain = await ensureDomainForImport(exportedService.domain);
        let serviceData = normalizeImportedService(exportedService, domain.id);
        const conflict = await serviceConflict(serviceData);

        if (conflict) {
          if (conflictStrategy === "skip") {
            result.skipped += 1;
            result.services.push({ name: serviceData.name, action: "skipped", reason: `Conflicting ${conflict}` });
            continue;
          }

          serviceData = {
            ...serviceData,
            name: await uniqueImportedName(serviceData.name),
            subdomain: serviceData.hostnameMode === "subdomain" && serviceData.subdomain
              ? await uniqueImportedSubdomain(serviceData.subdomain, serviceData.domainId)
              : serviceData.subdomain,
          };
        }

        const created = await ServiceService.createService(serviceData);
        result.imported += 1;
        result.services.push({ name: serviceData.name, action: "created", serviceId: created.id });
      } catch (error) {
        result.skipped += 1;
        result.services.push({
          name: normalizeString(exportedService?.name) || "Unknown service",
          action: "skipped",
          reason: error instanceof Error ? error.message : "Import failed",
        });
      }
    }

    return result;
  }
}
