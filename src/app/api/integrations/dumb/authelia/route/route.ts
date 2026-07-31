import { NextRequest, NextResponse } from "next/server";
import { isDumbIntegrationAuthorized } from "@/lib/dumb-integration-auth";
import {
  bodyErrorResponse,
  rateLimit,
  readJsonBody,
  RequestBodyError,
} from "@/lib/request-guards";
import { DomainService } from "@/lib/services/domain.service";
import { ServiceService } from "@/lib/services/service.service";
import { getServiceHostnames } from "@/lib/service-hostnames";
import type { CreateServiceData, HostnameMode } from "@/lib/dto/service.dto";

export const runtime = "nodejs";

interface RouteRequest {
  domainId?: string;
  publicUrl?: string;
  targetHost?: string;
  targetPort?: number;
  application?: "authelia" | "dumb" | "tpa";
}

const ROUTE_APPLICATIONS = {
  authelia: { name: "Authelia", label: "Authelia" },
  dumb: { name: "DUMB", label: "DUMB" },
  tpa: { name: "Traefik Proxy Admin", label: "TPA" },
} as const;

function unauthorized() {
  return NextResponse.json(
    { error: "Invalid DUMB integration token" },
    { status: 401 },
  );
}

function cleanPublicUrl(value: unknown, label: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new RequestBodyError(
      `${label} public URL must be an HTTPS origin without a path, port, query, or fragment`,
    );
  }
}

function cleanTargetHost(value: unknown, application: keyof typeof ROUTE_APPLICATIONS) {
  const targetHost = typeof value === "string" ? value.trim() : "";
  if (!targetHost || targetHost === "127.0.0.1") return "127.0.0.1";
  if (application !== "dumb") {
    throw new RequestBodyError("Only the DUMB frontend route supports a custom target host");
  }
  if (
    targetHost.length > 253 ||
    !/^[a-zA-Z0-9](?:[a-zA-Z0-9._:-]*[a-zA-Z0-9])?$/.test(targetHost)
  ) {
    throw new RequestBodyError(
      "DUMB target host must be a hostname, container name, or IP address without a scheme or path",
    );
  }
  return targetHost;
}

function routeFields(hostname: string, rootDomain: string, label: string) {
  const host = hostname.toLowerCase();
  const domain = rootDomain.toLowerCase();
  if (host === domain) {
    return {
      hostnameMode: "apex" as HostnameMode,
      subdomain: null,
      customHostnames: null,
    };
  }
  if (!host.endsWith(`.${domain}`)) {
    throw new RequestBodyError(
      `${label} hostname must equal or be a subdomain of the selected TPA domain`,
    );
  }
  const prefix = host.slice(0, -(domain.length + 1));
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix)) {
    return {
      hostnameMode: "subdomain" as HostnameMode,
      subdomain: prefix,
      customHostnames: null,
    };
  }
  return {
    hostnameMode: "custom" as HostnameMode,
    subdomain: null,
    customHostnames: JSON.stringify([host]),
  };
}

function safeDomain(domain: Awaited<ReturnType<typeof DomainService.getAllDomains>>[number]) {
  return {
    id: domain.id,
    name: domain.name,
    domain: domain.domain,
    isDefault: domain.isDefault,
    useWildcardCert: domain.useWildcardCert,
    certResolver: domain.certResolver,
    serviceCount: domain.serviceCount || 0,
  };
}

function safePublicRoute(
  service: Awaited<ReturnType<typeof ServiceService.getAllServices>>[number],
) {
  if (!service.domain) return null;
  const publicUrls = getServiceHostnames(service, service.domain)
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean)
    .map((hostname) => `https://${hostname}`);
  if (publicUrls.length === 0) return null;

  const target = service.targetIp.trim().toLowerCase();
  return {
    name: service.name,
    enabled: service.enabled,
    targetPort: service.targetPort,
    targetLoopback: target === "127.0.0.1" || target === "localhost" || target === "::1",
    publicUrls,
  };
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "dumb-authelia-route-domains",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;
  if (!isDumbIntegrationAuthorized(request)) return unauthorized();

  try {
    const [domains, services] = await Promise.all([
      DomainService.getAllDomains(),
      ServiceService.getAllServices(),
    ]);
    return NextResponse.json({
      domains: domains.map(safeDomain),
      routeApplications: Object.keys(ROUTE_APPLICATIONS),
      publicRoutes: services.map(safePublicRoute).filter((route) => route !== null),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to discover TPA domains" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "dumb-authelia-route-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;
  if (!isDumbIntegrationAuthorized(request)) return unauthorized();

  try {
    const body = await readJsonBody<RouteRequest>(request, 16 * 1024);
    const domainId = body.domainId?.trim() || "";
    const application = body.application || "authelia";
    const routeApplication = ROUTE_APPLICATIONS[application];
    if (!routeApplication) {
      throw new RequestBodyError("Unsupported DUMB-managed route application");
    }
    const publicUrl = cleanPublicUrl(body.publicUrl, routeApplication.label);
    const targetHost = cleanTargetHost(body.targetHost, application);
    const targetPort = body.targetPort;
    if (!domainId) throw new RequestBodyError("TPA domain is required");
    if (
      typeof targetPort !== "number" ||
      !Number.isInteger(targetPort) ||
      targetPort < 1 ||
      targetPort > 65535
    ) {
      throw new RequestBodyError(
        `${routeApplication.label} target port must be from 1 to 65535`,
      );
    }

    const domain = await DomainService.getDomainById(domainId);
    if (!domain) throw new RequestBodyError("Selected TPA domain was not found");
    const fields = routeFields(
      publicUrl.hostname,
      domain.domain,
      routeApplication.label,
    );
    const services = await ServiceService.getAllServices();
    const conflict = services.find((service) =>
      getServiceHostnames(service, service.domain || domain)
        .some((hostname) => hostname.toLowerCase() === publicUrl.hostname.toLowerCase()),
    );

    if (conflict) {
      const reusable =
        conflict.name === routeApplication.name &&
        conflict.targetIp === targetHost &&
        conflict.targetPort === targetPort &&
        conflict.isHttps === false &&
        conflict.passHostHeader === true &&
        conflict.enabled === true &&
        !conflict.middlewares &&
        !conflict.managedMiddlewares &&
        !conflict.hasSharedLink &&
        !conflict.hasSso &&
        !conflict.hasBasicAuth;
      if (!reusable) {
        return NextResponse.json(
          {
            error: `The ${routeApplication.label} hostname is already assigned to another or incompatible TPA service`,
            conflictServiceId: conflict.id,
            conflictServiceName: conflict.name,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({
        application,
        configured: true,
        created: false,
        reused: true,
        serviceId: conflict.id,
        hostname: publicUrl.hostname,
        domain: safeDomain(domain),
        targetHost,
        targetPort,
        targetHttps: false,
        authentication: "none",
      });
    }

    const serviceData: CreateServiceData = {
      name: routeApplication.name,
      serviceGroup: "DUMB",
      ...fields,
      domainId: domain.id,
      targetIp: targetHost,
      targetPort,
      entrypoint: null,
      isHttps: false,
      insecureSkipVerify: false,
      passHostHeader: true,
      enabled: true,
      enableDurationMinutes: null,
      middlewares: null,
      requestHeaders: null,
      managedMiddlewares: null,
      advancedRouters: null,
    };
    const service = await ServiceService.createService(serviceData);
    return NextResponse.json({
      application,
      configured: true,
      created: true,
      reused: false,
      serviceId: service.id,
      hostname: publicUrl.hostname,
      domain: safeDomain(domain),
      targetHost,
      targetPort,
      targetHttps: false,
      authentication: "none",
    });
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error);
    return NextResponse.json(
      { error: "Unable to configure the DUMB-managed route in TPA" },
      { status: 500 },
    );
  }
}
