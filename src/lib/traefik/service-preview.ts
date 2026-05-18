import "server-only";
import { DomainService } from "@/lib/services/domain.service";
import { ServiceService } from "@/lib/services/service.service";
import { getGlobalConfig } from "@/lib/app-config";
import { parseMiddlewareNames } from "@/lib/middleware-utils";
import type { Domain } from "@/lib/db/schema";
import type { HostnameMode } from "@/lib/dto/service.dto";
import type { TraefikMiddleware, TraefikRouter, TraefikService } from "@/lib/traefik-config";

export interface ServicePreviewRequest {
  serviceId?: string;
  name?: string;
  subdomain?: string | null;
  hostnameMode?: HostnameMode;
  customHostnames?: string[] | string | null;
  domainId?: string;
  targetIp?: string;
  targetPort?: number;
  entrypoint?: string | null;
  isHttps?: boolean;
  insecureSkipVerify?: boolean;
  enabled?: boolean;
  middlewares?: unknown;
  requestHeaders?: Record<string, string> | string | null;
}

export interface ServiceConfigSlice {
  routerName: string;
  serviceName: string;
  middlewares: Record<string, TraefikMiddleware>;
  router: TraefikRouter;
  service: TraefikService;
  serversTransports?: Record<string, { insecureSkipVerify?: boolean }>;
}

function parseCustomHostnames(value: ServicePreviewRequest["customHostnames"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((hostname) => hostname.trim()).filter(Boolean);

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((hostname) => String(hostname).trim()).filter(Boolean) : [];
  } catch {
    return value.split("\n").map((hostname) => hostname.trim()).filter(Boolean);
  }
}

function parseRequestHeaders(value: ServicePreviewRequest["requestHeaders"]): Record<string, string> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serviceIdentifier(input: ServicePreviewRequest, domain: Domain): string {
  if (input.hostnameMode === "apex") return domain.domain.replace(/\./g, "-");
  if (input.hostnameMode === "custom") {
    return (parseCustomHostnames(input.customHostnames)[0] || input.serviceId || input.name || "preview")
      .replace(/\./g, "-");
  }

  return input.subdomain || input.serviceId || input.name || "preview";
}

function hostnamesFor(input: ServicePreviewRequest, domain: Domain): string[] {
  if (input.hostnameMode === "apex") return [domain.domain];
  if (input.hostnameMode === "custom") return parseCustomHostnames(input.customHostnames);
  return input.subdomain ? [`${input.subdomain}.${domain.domain}`] : [];
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function diffLines(previous: unknown, next: unknown): string[] {
  const previousLines = JSON.stringify(previous ?? {}, null, 2).split("\n");
  const nextLines = JSON.stringify(next ?? {}, null, 2).split("\n");
  const previousSet = new Set(previousLines);
  const nextSet = new Set(nextLines);

  return [
    ...previousLines.filter((line) => !nextSet.has(line)).map((line) => `- ${line}`),
    ...nextLines.filter((line) => !previousSet.has(line)).map((line) => `+ ${line}`),
  ];
}

function summarizeChanges(previous: ServiceConfigSlice | null, next: ServiceConfigSlice) {
  if (!previous) {
    return {
      added: ["router", "service", ...Object.keys(next.middlewares).map((name) => `middleware:${name}`), ...(next.serversTransports ? Object.keys(next.serversTransports).map((name) => `transport:${name}`) : [])],
      changed: [],
      removed: [],
    };
  }

  const checks = [
    ["router", previous.router, next.router],
    ["service", previous.service, next.service],
    ["middlewares", previous.middlewares, next.middlewares],
    ["serversTransports", previous.serversTransports, next.serversTransports],
  ] as const;

  return {
    added: [] as string[],
    changed: checks.filter(([, before, after]) => stableJson(before) !== stableJson(after)).map(([name]) => name),
    removed: [] as string[],
  };
}

async function buildSlice(input: ServicePreviewRequest): Promise<ServiceConfigSlice> {
  const domainId = input.domainId;
  if (!domainId) throw new Error("A domain is required before previewing Traefik config");

  const domain = await DomainService.getDomainById(domainId);
  if (!domain) throw new Error("Selected domain was not found");

  const globalConfig = await getGlobalConfig();
  const identifier = serviceIdentifier(input, domain);
  const serviceName = `service-${identifier}`;
  const routerName = `router-${identifier}`;
  const protocol = input.isHttps ? "https" : "http";
  const hosts = hostnamesFor(input, domain);
  if (hosts.length === 0) throw new Error("At least one hostname is required before previewing Traefik config");

  const service: TraefikService = {
    loadBalancer: {
      servers: [{ url: `${protocol}://${input.targetIp}:${input.targetPort}` }],
    },
  };
  const middlewares: Record<string, TraefikMiddleware> = {};
  const middlewareNames = [...globalConfig.globalMiddlewares, ...parseMiddlewareNames(input.middlewares)];
  const requestHeaders = parseRequestHeaders(input.requestHeaders);

  if (Object.keys(requestHeaders).length > 0) {
    const headersMiddlewareName = `headers-${identifier}`;
    middlewares[headersMiddlewareName] = {
      headers: { customRequestHeaders: requestHeaders },
    };
    middlewareNames.push(headersMiddlewareName);
  }

  const serversTransports: Record<string, { insecureSkipVerify?: boolean }> = {};
  if (input.isHttps && input.insecureSkipVerify) {
    const transportName = `insecure-transport-${identifier}`;
    service.loadBalancer.serversTransport = transportName;
    serversTransports[transportName] = { insecureSkipVerify: true };
  }

  const entrypoint = input.entrypoint || globalConfig.defaultEntrypoint;
  const router: TraefikRouter = {
    rule: hosts.map((hostname) => `Host(\`${hostname}\`)`).join(" || "),
    service: serviceName,
    ...(middlewareNames.length > 0 && { middlewares: middlewareNames }),
    ...(entrypoint && { entryPoints: [entrypoint] }),
    tls: { certResolver: domain.certResolver },
  };

  return {
    routerName,
    serviceName,
    middlewares,
    router,
    service,
    ...(Object.keys(serversTransports).length > 0 && { serversTransports }),
  };
}

export async function previewServiceConfig(input: ServicePreviewRequest) {
  const proposed = await buildSlice(input);
  let current: ServiceConfigSlice | null = null;

  if (input.serviceId) {
    const existing = await ServiceService.getServiceById(input.serviceId);
    if (existing) {
      current = await buildSlice({
        ...existing,
        serviceId: existing.id,
        hostnameMode: existing.hostnameMode as HostnameMode,
        customHostnames: existing.customHostnames,
        requestHeaders: existing.requestHeaders,
      });
    }
  }

  return {
    current,
    proposed,
    diff: diffLines(current, proposed),
    changes: summarizeChanges(current, proposed),
  };
}
