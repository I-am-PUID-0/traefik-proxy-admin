import { NextRequest, NextResponse } from "next/server";
import { bodyErrorResponse, rateLimit, readJsonBody } from "@/lib/request-guards";
import { fetchTraefikApi } from "@/lib/traefik/api-client";
import { db, domains } from "@/lib/db";
import type { AdvancedRouterConfig } from "@/lib/traefik-config";
import type { Domain } from "@/lib/db";

type TraefikRouterDetail = {
  name?: string;
  provider?: string;
  rule?: string;
  service?: string;
  status?: string;
  entryPoints?: string[];
  middlewares?: string[];
  priority?: number;
  tls?: boolean | {
    certResolver?: string;
    [key: string]: unknown;
  };
};

type TraefikServiceDetail = {
  name?: string;
  provider?: string;
  status?: string;
  type?: string;
  loadBalancer?: {
    servers?: Array<{ url?: string }>;
    passHostHeader?: boolean;
    serversTransport?: string;
  };
  weighted?: unknown;
  mirroring?: unknown;
  failover?: unknown;
};

type TraefikMiddlewareDetail = {
  name?: string;
  provider?: string;
  type?: string;
  status?: string;
};

type ImportPreviewRequest = {
  routerName?: string;
};

type ImportPreviewResponse = {
  configured: boolean;
  router: TraefikRouterDetail;
  service: TraefikServiceDetail;
  draft: ImportPreviewDraft;
  warnings: string[];
  unsupported: boolean;
};

type ImportPreviewDraft = {
  name: string;
  hostnameMode: "subdomain" | "apex" | "custom";
  subdomain?: string;
  domainId?: string;
  customHostnames: string | null;
  targetIp: string;
  targetPort: number;
  entrypoint: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  passHostHeader: boolean;
  enabled: boolean;
  middlewares: string;
  advancedRouters: string;
};

function providerFromName(name?: string) {
  return name?.split("@")[1] || "unknown";
}

function baseName(name?: string) {
  return (name || "").split("@")[0];
}

function fullName(name?: string, provider?: string) {
  if (!name) return "";
  if (name.includes("@")) return name;
  return provider ? `${name}@${provider}` : name;
}

function findByName<T extends { name?: string; provider?: string }>(items: T[], name: string, fallbackProvider?: string) {
  const wanted = fullName(name, fallbackProvider);
  const wantedBase = baseName(name);
  const wantedProvider = providerFromName(wanted);

  return items.find((item) => item.name === wanted)
    || items.find((item) => fullName(item.name, item.provider) === wanted)
    || items.find((item) => baseName(item.name) === wantedBase && (item.provider || providerFromName(item.name)) === wantedProvider)
    || null;
}

function firstHostFromRule(rule?: string): string {
  return rule?.match(/Host\(`([^`]+)`\)/)?.[1] || "";
}

function hostnameDraft(host: string, configuredDomains: Domain[]): Pick<ImportPreviewDraft, "hostnameMode" | "subdomain" | "domainId" | "customHostnames"> {
  const normalizedHost = host.trim().toLowerCase();
  const matches = configuredDomains
    .map((domain) => ({ domain, normalizedDomain: domain.domain.trim().toLowerCase() }))
    .filter(({ normalizedDomain }) => normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`))
    .sort((a, b) => b.normalizedDomain.length - a.normalizedDomain.length);

  const match = matches[0];
  if (!match) {
    return {
      hostnameMode: "custom",
      customHostnames: JSON.stringify(host ? [host] : []),
    };
  }

  if (normalizedHost === match.normalizedDomain) {
    return {
      hostnameMode: "apex",
      domainId: match.domain.id,
      customHostnames: null,
    };
  }

  return {
    hostnameMode: "subdomain",
    subdomain: host.slice(0, -(match.normalizedDomain.length + 1)),
    domainId: match.domain.id,
    customHostnames: null,
  };
}

function safeServiceName(routerName: string, host: string) {
  const candidate = host || baseName(routerName);
  return candidate
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9- ]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || baseName(routerName)
    || "Imported Service";
}

function toMiddlewareNames(router: TraefikRouterDetail, routerProvider: string) {
  return (router.middlewares || [])
    .map((middleware) => fullName(middleware, routerProvider))
    .filter(Boolean);
}

function certResolver(router: TraefikRouterDetail) {
  if (router.tls && typeof router.tls === "object") {
    return router.tls.certResolver;
  }
  return undefined;
}

function isTlsEnabled(router: TraefikRouterDetail) {
  return Boolean(router.tls);
}

function toAdvancedRouter(router: TraefikRouterDetail, primaryMiddlewares: string[], fallbackProvider: string): AdvancedRouterConfig {
  const middlewares = toMiddlewareNames(router, fallbackProvider);
  return {
    name: baseName(router.name) || "imported-router",
    rule: router.rule || "",
    entryPoints: router.entryPoints || [],
    middlewares: JSON.stringify(middlewares) === JSON.stringify(primaryMiddlewares) ? undefined : middlewares,
    tls: isTlsEnabled(router),
    certResolver: certResolver(router),
    priority: router.priority,
    enabled: true,
  };
}

function parseTarget(serverUrl: string) {
  const url = new URL(serverUrl);
  const protocol = url.protocol.replace(":", "");
  const port = url.port ? Number(url.port) : protocol === "https" ? 443 : 80;

  return {
    targetIp: url.hostname,
    targetPort: port,
    isHttps: protocol === "https",
    path: url.pathname && url.pathname !== "/" ? url.pathname : "",
  };
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "traefik-import-preview", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await readJsonBody<ImportPreviewRequest>(request, 16 * 1024);
    const routerName = body.routerName?.trim();

    if (!routerName) {
      return NextResponse.json({ error: "Router name is required" }, { status: 400 });
    }

    const routerProvider = providerFromName(routerName);
    if (routerProvider === "internal") {
      return NextResponse.json({ error: "Traefik @internal routers cannot be imported" }, { status: 400 });
    }

    const [routersResult, servicesResult, middlewaresResult, configuredDomains] = await Promise.all([
      fetchTraefikApi<TraefikRouterDetail[]>("/api/http/routers"),
      fetchTraefikApi<TraefikServiceDetail[]>("/api/http/services"),
      fetchTraefikApi<TraefikMiddlewareDetail[]>("/api/http/middlewares"),
      db.select().from(domains),
    ]);

    if (!routersResult.state.configured) {
      return NextResponse.json({ configured: false, error: "TRAEFIK_API_URL is not configured" }, { status: 400 });
    }

    if (!Array.isArray(routersResult.data) || !Array.isArray(servicesResult.data)) {
      return NextResponse.json({ configured: true, error: "Failed to fetch live Traefik resources" }, { status: 502 });
    }

    const router = findByName(routersResult.data, routerName, routerProvider);
    if (!router?.name) {
      return NextResponse.json({ configured: true, error: `Router ${routerName} was not found` }, { status: 404 });
    }

    const provider = router.provider || providerFromName(router.name);
    if (provider === "internal") {
      return NextResponse.json({ configured: true, error: "Traefik @internal routers cannot be imported" }, { status: 400 });
    }

    const warnings: string[] = [];
    const host = firstHostFromRule(router.rule);
    if (!host) {
      warnings.push("Router rule does not contain a simple Host(`...`) matcher; review the custom hostname and advanced router rule before saving.");
    }

    const serviceRef = router.service || "";
    const service = findByName(servicesResult.data, serviceRef, provider);
    if (!service) {
      return NextResponse.json({ configured: true, error: `Referenced service ${serviceRef || "<missing>"} was not found` }, { status: 400 });
    }

    const serviceProvider = service.provider || providerFromName(service.name) || provider;
    if (serviceProvider === "internal") {
      return NextResponse.json({ configured: true, error: "Traefik @internal services cannot be imported" }, { status: 400 });
    }

    if (service.weighted || service.mirroring || service.failover || (service.type && service.type.toLowerCase() !== "loadbalancer")) {
      warnings.push(`Service ${fullName(service.name, service.provider)} is not a simple loadBalancer service; only simple loadBalancer targets can be converted automatically.`);
    }

    const servers = service.loadBalancer?.servers || [];
    if (servers.length !== 1) {
      warnings.push(`Service has ${servers.length} loadBalancer server(s); TPA service imports support one primary target. Review the target before saving.`);
    }

    const serverUrl = servers[0]?.url;
    if (!serverUrl) {
      return NextResponse.json({ configured: true, error: "Referenced service does not expose a loadBalancer server URL that TPA can import" }, { status: 400 });
    }

    let target: ReturnType<typeof parseTarget>;
    try {
      target = parseTarget(serverUrl);
    } catch {
      return NextResponse.json({ configured: true, error: `Unsupported service target URL: ${serverUrl}` }, { status: 400 });
    }

    if (target.path) {
      warnings.push(`Target URL includes path ${target.path}; TPA stores only scheme, host, and port, so path-based upstream behavior must be recreated manually.`);
    }

    const primaryMiddlewares = toMiddlewareNames(router, provider);
    const relatedRouters = routersResult.data
      .filter((candidate) => candidate.name && candidate.name !== router.name && candidate.service === router.service)
      .filter((candidate) => (candidate.provider || providerFromName(candidate.name)) !== "internal");

    const advancedRouters = relatedRouters.map((candidate) => toAdvancedRouter(candidate, primaryMiddlewares, provider));
    if (relatedRouters.length > 0) {
      warnings.push(`Found ${relatedRouters.length} additional router(s) using the same Traefik service; they were mapped to advanced routers for review.`);
    }

    const middlewareNames = new Set((middlewaresResult.data || []).map((middleware) => fullName(middleware.name, middleware.provider)));
    for (const middleware of primaryMiddlewares) {
      if (!middlewareNames.has(middleware)) {
        warnings.push(`Middleware ${middleware} was referenced by the router but not found in live middleware discovery.`);
      }
    }

    const hostDraft = hostnameDraft(host, configuredDomains);

    const draft: ImportPreviewDraft = {
      name: safeServiceName(router.name, host),
      ...hostDraft,
      targetIp: target.targetIp,
      targetPort: target.targetPort,
      entrypoint: router.entryPoints?.[0] || null,
      isHttps: target.isHttps,
      insecureSkipVerify: Boolean(service.loadBalancer?.serversTransport),
      passHostHeader: service.loadBalancer?.passHostHeader ?? true,
      enabled: true,
      middlewares: primaryMiddlewares.join(", "),
      advancedRouters: advancedRouters.length ? JSON.stringify(advancedRouters, null, 2) : "",
    };

    const response: ImportPreviewResponse = {
      configured: true,
      router,
      service,
      draft,
      warnings,
      unsupported: warnings.length > 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    console.error("Error previewing Traefik import:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview Traefik import" },
      { status: 400 },
    );
  }
}
