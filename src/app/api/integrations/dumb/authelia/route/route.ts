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
  targetPort?: number;
}

function unauthorized() {
  return NextResponse.json(
    { error: "Invalid DUMB integration token" },
    { status: 401 },
  );
}

function cleanPublicUrl(value: unknown) {
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
      "Authelia public URL must be an HTTPS origin without a path, port, query, or fragment",
    );
  }
}

function routeFields(hostname: string, rootDomain: string) {
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
      "Authelia hostname must equal or be a subdomain of the selected TPA domain",
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

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, {
    key: "dumb-authelia-route-domains",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;
  if (!isDumbIntegrationAuthorized(request)) return unauthorized();

  try {
    const domains = await DomainService.getAllDomains();
    return NextResponse.json({ domains: domains.map(safeDomain) });
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
    const publicUrl = cleanPublicUrl(body.publicUrl);
    const targetPort = body.targetPort;
    if (!domainId) throw new RequestBodyError("TPA domain is required");
    if (
      typeof targetPort !== "number" ||
      !Number.isInteger(targetPort) ||
      targetPort < 1 ||
      targetPort > 65535
    ) {
      throw new RequestBodyError("Authelia target port must be from 1 to 65535");
    }

    const domain = await DomainService.getDomainById(domainId);
    if (!domain) throw new RequestBodyError("Selected TPA domain was not found");
    const fields = routeFields(publicUrl.hostname, domain.domain);
    const services = await ServiceService.getAllServices();
    const conflict = services.find((service) =>
      getServiceHostnames(service, service.domain || domain)
        .some((hostname) => hostname.toLowerCase() === publicUrl.hostname.toLowerCase()),
    );

    if (conflict) {
      const reusable =
        conflict.name === "Authelia" &&
        conflict.targetIp === "127.0.0.1" &&
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
            error: "The Authelia hostname is already assigned to another or incompatible TPA service",
            conflictServiceId: conflict.id,
            conflictServiceName: conflict.name,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({
        configured: true,
        created: false,
        reused: true,
        serviceId: conflict.id,
        hostname: publicUrl.hostname,
        domain: safeDomain(domain),
        targetHost: "127.0.0.1",
        targetPort,
        targetHttps: false,
        authentication: "none",
      });
    }

    const serviceData: CreateServiceData = {
      name: "Authelia",
      serviceGroup: "DUMB",
      ...fields,
      domainId: domain.id,
      targetIp: "127.0.0.1",
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
      configured: true,
      created: true,
      reused: false,
      serviceId: service.id,
      hostname: publicUrl.hostname,
      domain: safeDomain(domain),
      targetHost: "127.0.0.1",
      targetPort,
      targetHttps: false,
      authentication: "none",
    });
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error);
    return NextResponse.json(
      { error: "Unable to configure the Authelia route in TPA" },
      { status: 500 },
    );
  }
}
