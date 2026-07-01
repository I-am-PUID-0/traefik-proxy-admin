import "server-only";
import { logger } from "@/lib/logger";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getGlobalConfig, type GlobalTraefikConfig } from "./app-config";
import { BasicAuthService } from "./services/basic-auth.service";
import { ServiceSecurityService } from "./services/service-security.service";
import { TRAEFIK_SESSION_COOKIE } from "./constants";
import { SERVICE_AUTH_TICKET_PATH } from "./service-auth-tickets";
import { ipJailEnforcementEnabled, listActiveIpJailSubjects } from "./ip-jail";
import type { Service, Domain } from "@/lib/db/schema";
import type { CertificateConfig } from "@/lib/dto/domain.dto";
import { getServiceHostnames } from "@/lib/service-hostnames";

export interface TraefikService {
  loadBalancer: {
    servers: Array<{
      url: string;
    }>;
    serversTransport?: string;
    passHostHeader?: boolean;
  };
}

export interface TraefikRouter {
  rule: string;
  service: string;
  middlewares?: string[];
  entryPoints?: string[];
  priority?: number;
  tls?: {
    certResolver?: string;
    domains?: Array<{
      main: string;
      sans?: string[];
    }>;
  };
}

export interface TraefikMiddleware {
  forwardAuth?: {
    address: string;
    trustForwardHeader?: boolean;
    authRequestHeaders?: string[];
    addAuthCookiesToResponse?: string[];
  };
  basicAuth?: {
    users: string[];
  };
  redirectScheme?: {
    scheme: string;
    permanent?: boolean;
  };
  redirectRegex?: {
    regex: string;
    replacement: string;
    permanent?: boolean;
  };
  replacePath?: {
    path: string;
  };
  headers?: {
    customRequestHeaders?: Record<string, string>;
    customResponseHeaders?: Record<string, string>;
  };
  [key: string]: unknown; // Allow for custom middleware configurations
}

export interface TraefikConfig {
  http: {
    services: Record<string, TraefikService>;
    routers: Record<string, TraefikRouter>;
    middlewares?: Record<string, TraefikMiddleware>;
    serversTransports?: Record<string, {
      insecureSkipVerify?: boolean;
    }>;
  };
}

function getAdminPanelBaseUrl(globalConfig: GlobalTraefikConfig) {
  const configuredUrl = globalConfig.adminPanelDomain.trim();
  const baseUrl = configuredUrl.startsWith("http://") || configuredUrl.startsWith("https://")
    ? configuredUrl
    : `http://${configuredUrl}`;

  return baseUrl.replace(/\/+$/, "");
}

function hostnameFromUrlLike(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `http://${trimmed}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function adminHostnames(globalConfig: GlobalTraefikConfig) {
  return new Set(
    [
      hostnameFromUrlLike(globalConfig.adminPanelDomain),
      hostnameFromUrlLike(globalConfig.adminPanelPublicUrl),
    ].filter((hostname): hostname is string => Boolean(hostname)),
  );
}

function ensureServiceAuthTicketService(config: TraefikConfig, globalConfig: GlobalTraefikConfig) {
  config.http.services["tpa-service-auth-ticket"] = {
    loadBalancer: {
      servers: [{ url: getAdminPanelBaseUrl(globalConfig) }],
      passHostHeader: true,
    },
  };
}

function ensureIpJailBlockService(config: TraefikConfig, globalConfig: GlobalTraefikConfig) {
  config.http.services["tpa-ip-jail-block"] = {
    loadBalancer: {
      servers: [{ url: getAdminPanelBaseUrl(globalConfig) }],
      passHostHeader: true,
    },
  };

  config.http.middlewares!["tpa-ip-jail-block-page"] = {
    replacePath: {
      path: "/api/static/blocked",
    },
  };
}

/**
 * Parse service-specific middlewares from string format
 */
function parseServiceMiddlewares(middlewares: string): string[] {
  try {
    // Try to parse as JSON first (for array format)
    const parsed = JSON.parse(middlewares);
    if (Array.isArray(parsed)) {
      return parsed;
    } else {
      // If it's not an array, treat it as a single middleware
      return [parsed];
    }
  } catch {
    // If JSON parsing fails, treat it as a plain string (single middleware)
    const trimmed = middlewares.trim();
    return trimmed ? [trimmed] : [];
  }
}

/**
 * Parse certificate configurations from JSON string
 */
function parseCertificateConfigs(certificateConfigs: string | null): CertificateConfig[] {
  if (!certificateConfigs) return [];
  try {
    const parsed = JSON.parse(certificateConfigs);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.warn("Failed to parse certificate configs:", error);
    return [];
  }
}

/**
 * Parse custom hostnames from JSON string
 */
function parseCustomHostnames(customHostnames: string | null): string[] {
  if (!customHostnames) return [];
  try {
    const parsed = JSON.parse(customHostnames);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.warn("Failed to parse custom hostnames:", error);
    return [];
  }
}

export interface AdvancedRouterConfig {
  name: string;
  rule: string;
  entrypoint?: string;
  entryPoints?: string[];
  middlewares?: string[] | string;
  tls?: boolean;
  certResolver?: string;
  priority?: number;
  enabled?: boolean;
}

interface BypassSecurityConfig {
  name?: string;
  rule?: string;
  mode?: "simple" | "observed";
  middlewares?: string[] | string;
  sessionDurationMinutes?: number;
}

function safeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "custom";
}

function parseManagedMiddlewares(value: string | null): Record<string, TraefikMiddleware> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const middlewares: Record<string, TraefikMiddleware> = {};
    for (const [name, config] of Object.entries(parsed)) {
      if (typeof name === "string" && name.trim() && config && typeof config === "object" && !Array.isArray(config)) {
        middlewares[safeName(name)] = config as TraefikMiddleware;
      }
    }
    return middlewares;
  } catch (error) {
    logger.warn("Failed to parse managed middlewares:", error);
    return {};
  }
}

function parseAdvancedRouters(value: string | null): AdvancedRouterConfig[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((router): router is AdvancedRouterConfig => {
      return Boolean(
        router &&
        typeof router === "object" &&
        typeof router.name === "string" &&
        router.name.trim() &&
        typeof router.rule === "string" &&
        router.rule.trim() &&
        router.enabled !== false,
      );
    });
  } catch (error) {
    logger.warn("Failed to parse advanced routers:", error);
    return [];
  }
}

function routerMiddlewares(value: AdvancedRouterConfig["middlewares"], fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (Array.isArray(value)) return value.map((middleware) => String(middleware).trim()).filter(Boolean);
  return parseServiceMiddlewares(value);
}

function bypassMiddlewares(value: BypassSecurityConfig["middlewares"]): string[] {
  if (Array.isArray(value)) return value.map((middleware) => String(middleware).trim()).filter(Boolean);
  if (typeof value === "string") return parseServiceMiddlewares(value);
  return [];
}

function bypassRule(hostRules: string, rule: string): string {
  const trimmed = rule.trim();
  return /\bHost(?:Regexp)?\s*\(/.test(trimmed) ? trimmed : `${hostRules} && (${trimmed})`;
}

function normalizeCertResolver(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return undefined;
  return trimmed;
}

function routerTlsConfig(
  certResolver: string | null | undefined,
  domains?: NonNullable<TraefikRouter["tls"]>["domains"],
): TraefikRouter["tls"] {
  const normalized = normalizeCertResolver(certResolver);
  if (!normalized) return {};
  return {
    certResolver: normalized,
    ...(domains && domains.length > 0 && { domains }),
  };
}

/**
 * Generate service identifier based on hostname mode
 */
function generateServiceIdentifier(service: Service, domain: Domain): string {
  switch (service.hostnameMode) {
    case 'subdomain':
      return service.subdomain || 'default';
    case 'apex':
      return domain.domain.replace(/\./g, '-');
    case 'custom':
      // Use first custom hostname or service ID as fallback
      const customHostnames = parseCustomHostnames(service.customHostnames);
      const firstHostname = customHostnames[0] || service.id.substring(0, 8);
      return firstHostname.replace(/\./g, '-');
    default:
      return service.subdomain || service.id.substring(0, 8);
  }
}

/**
 * Generate hostnames for a service based on hostname mode
 */
function generateServiceHostnames(service: Service, domain: Domain): string[] {
  const hostnames = getServiceHostnames(service, domain);
  if (hostnames.length === 0) {
    if (service.hostnameMode === "subdomain" && !service.subdomain) {
      logger.warn(`Service ${service.id} is in subdomain mode but has no subdomain`);
    } else if (service.hostnameMode === "custom") {
      logger.warn(`Service ${service.id} is in custom hostname mode but has no custom hostnames`);
    } else {
      logger.warn(`Unknown hostname mode: ${service.hostnameMode}`);
    }
  }
  return hostnames;
}

/**
 * Build middlewares array for a service with multiple security configurations
 */
async function buildServiceMiddlewares(
  service: Service,
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): Promise<string[]> {
  const middlewares: string[] = [];
  const serviceIdentifier = generateServiceIdentifier(service, domain);

  // Add global middlewares first
  if (globalConfig.globalMiddlewares.length > 0) {
    middlewares.push(...globalConfig.globalMiddlewares);
  }

  // Get all enabled security configurations for this service, ordered by priority
  const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(service.id);

  // Process each security configuration
  for (const securityConfig of securityConfigs) {
    const configData = JSON.parse(securityConfig.config);

    switch (securityConfig.securityType) {
      case "shared_link":
      case "sso":
        // Both shared_link and sso use forward auth
        const authMiddlewareName = `auth-${securityConfig.securityType}-${serviceIdentifier}`;
        config.http.middlewares![authMiddlewareName] = {
          forwardAuth: {
            address: `${getAdminPanelBaseUrl(globalConfig)}/api/auth/verify?serviceId=${service.id}&configId=${securityConfig.id}`,
            trustForwardHeader: true,
            addAuthCookiesToResponse: [TRAEFIK_SESSION_COOKIE],
            authRequestHeaders: ["Accept", "Cookie", "X-Forwarded-Proto", "X-Forwarded-Host", "X-Forwarded-Uri"],
          },
        };
        middlewares.push(authMiddlewareName);
        break;

      case "basic_auth":
        // Handle basic auth
        if (configData.basicAuthConfigId) {
          const authUsers = await BasicAuthService.getUsersWithHashesByConfigId(configData.basicAuthConfigId);

          if (authUsers.length > 0) {
            const basicAuthMiddlewareName = `basic-auth-${serviceIdentifier}-${securityConfig.id.substring(0, 8)}`;
            const userStrings = authUsers.map(user => `${user.username}:${user.passwordHash}`);

            config.http.middlewares![basicAuthMiddlewareName] = {
              basicAuth: {
                users: userStrings,
              },
            };
            middlewares.push(basicAuthMiddlewareName);
          }
        }
        break;

      case "bypass":
        // Bypass configs generate their own routers below instead of protecting the main route.
        break;

      default:
        logger.warn(`Unknown security type: ${securityConfig.securityType}`);
    }
  }

  // Add request headers middleware if service has custom headers
  if (service.requestHeaders) {
    try {
      let headers = JSON.parse(service.requestHeaders);

      // Handle double-stringified data (bug fix - can be removed after DB migration)
      if (typeof headers === 'string') {
        headers = JSON.parse(headers);
      }

      if (headers && typeof headers === 'object' && Object.keys(headers).length > 0) {
        const headersMiddlewareName = `headers-${serviceIdentifier}`;
        config.http.middlewares![headersMiddlewareName] = {
          headers: {
            customRequestHeaders: headers,
          },
        };
        middlewares.push(headersMiddlewareName);
      }
    } catch (error) {
      logger.warn(`Failed to parse request headers for service ${serviceIdentifier}:`, error);
    }
  }

  // Add service-specific middlewares (non-auth middlewares)
  if (service.middlewares) {
    const serviceMiddlewares = parseServiceMiddlewares(service.middlewares);
    middlewares.push(...serviceMiddlewares);
  }

  return middlewares;
}

/**
 * Create Traefik service configuration for a single service
 */
async function createTraefikService(
  service: Service,
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig,
  ipJailSubjects: string[] = [],
): Promise<void> {
  const serviceIdentifier = generateServiceIdentifier(service, domain);
  const serviceName = `service-${serviceIdentifier}`;
  const routerName = `router-${serviceIdentifier}`;
  const protocol = service.isHttps ? "https" : "http";

  // Get hostnames for this service
  const hostnames = generateServiceHostnames(service, domain);
  if (hostnames.length === 0) {
    logger.warn(`Service ${service.id} has no valid hostnames, skipping`);
    return;
  }

  // Service configuration
  const serviceConfig: TraefikService = {
    loadBalancer: {
      servers: [
        {
          url: `${protocol}://${service.targetIp}:${service.targetPort}`,
        },
      ],
      passHostHeader: service.passHostHeader,
    },
  };

  // Add serversTransport if insecureSkipVerify is enabled for HTTPS services
  if (service.isHttps && service.insecureSkipVerify) {
    const transportName = `insecure-transport-${serviceIdentifier}`;
    serviceConfig.loadBalancer.serversTransport = transportName;

    // Ensure serversTransports object exists
    if (!config.http.serversTransports) {
      config.http.serversTransports = {};
    }

    // Add the serversTransport configuration
    config.http.serversTransports[transportName] = {
      insecureSkipVerify: true,
    };
  }

  config.http.services[serviceName] = serviceConfig;

  // Add app-managed middleware definitions before routers reference them
  Object.assign(config.http.middlewares!, parseManagedMiddlewares(service.managedMiddlewares));

  // Build middlewares
  const middlewares = await buildServiceMiddlewares(service, domain, globalConfig, config);

  // Create router rule for multiple hostnames
  const hostRules = hostnames.map(hostname => `Host(\`${hostname}\`)`).join(" || ");

  // Determine certificate configuration
  const tlsConfig = determineTlsConfig(service, domain, hostnames);

  // Determine which entrypoint to use (service-specific or default)
  const entrypoint = service.entrypoint || globalConfig.defaultEntrypoint;

  // Router configuration
  const router: TraefikRouter = {
    rule: hostRules,
    service: serviceName,
    ...(middlewares.length > 0 && { middlewares }),
    ...(entrypoint && { entryPoints: [entrypoint] }),
    tls: tlsConfig,
  };
  config.http.routers[routerName] = router;

  const jailHostnames = hostnames.filter((hostname) => !adminHostnames(globalConfig).has(hostname.toLowerCase()));
  if (ipJailSubjects.length > 0 && jailHostnames.length > 0) {
    ensureIpJailBlockService(config, globalConfig);
    const jailHostRules = jailHostnames.map(hostname => `Host(\`${hostname}\`)`).join(" || ");
    for (const [index, subject] of ipJailSubjects.entries()) {
      config.http.routers[`${routerName}-ip-jail-${index + 1}`] = {
        rule: `(${jailHostRules}) && ClientIP(\`${subject}\`)`,
        service: "tpa-ip-jail-block",
        middlewares: ["tpa-ip-jail-block-page"],
        ...(entrypoint && { entryPoints: [entrypoint] }),
        priority: 1_000_000,
        tls: tlsConfig,
      };
    }
  }

  for (const advancedRouter of parseAdvancedRouters(service.advancedRouters)) {
    const advancedMiddlewares = routerMiddlewares(advancedRouter.middlewares, middlewares);
    const advancedEntryPoints = advancedRouter.entryPoints || (advancedRouter.entrypoint ? [advancedRouter.entrypoint] : entrypoint ? [entrypoint] : undefined);
    const advancedTls = advancedRouter.tls === false
      ? undefined
      : advancedRouter.certResolver
        ? routerTlsConfig(advancedRouter.certResolver)
        : tlsConfig;

    config.http.routers[`${routerName}-${safeName(advancedRouter.name)}`] = {
      rule: advancedRouter.rule,
      service: serviceName,
      ...(advancedMiddlewares.length > 0 && { middlewares: advancedMiddlewares }),
      ...(advancedEntryPoints && advancedEntryPoints.length > 0 && { entryPoints: advancedEntryPoints }),
      ...(typeof advancedRouter.priority === "number" && { priority: advancedRouter.priority }),
      ...(advancedTls && { tls: advancedTls }),
    };
  }

  const securityConfigs = await ServiceSecurityService.getEnabledSecurityConfigsForService(service.id);

  if (securityConfigs.some((item) => item.securityType === "sso")) {
    ensureServiceAuthTicketService(config, globalConfig);
    config.http.routers[`${routerName}-tpa-auth-ticket`] = {
      rule: hostRules + " && Path(`" + SERVICE_AUTH_TICKET_PATH + "`)",
      service: "tpa-service-auth-ticket",
      ...(entrypoint && { entryPoints: [entrypoint] }),
      priority: 10000,
      tls: tlsConfig,
    };
  }

  for (const securityConfig of securityConfigs.filter((item) => item.securityType === "bypass")) {
    const bypassConfig = JSON.parse(securityConfig.config) as BypassSecurityConfig;
    if (!bypassConfig.rule || !bypassConfig.name) continue;

    const configuredMiddlewares = bypassMiddlewares(bypassConfig.middlewares);
    const bypassMiddlewareNames = [...configuredMiddlewares];

    if (bypassConfig.mode === "observed") {
      const observerMiddlewareName = `observe-bypass-${serviceIdentifier}-${securityConfig.id.substring(0, 8)}`;
      config.http.middlewares![observerMiddlewareName] = {
        forwardAuth: {
          address: `${getAdminPanelBaseUrl(globalConfig)}/api/auth/observe?serviceId=${service.id}&configId=${securityConfig.id}`,
          trustForwardHeader: true,
          addAuthCookiesToResponse: [TRAEFIK_SESSION_COOKIE],
          authRequestHeaders: ["Accept", "Cookie", "X-Forwarded-Proto", "X-Forwarded-Host", "X-Forwarded-Uri"],
        },
      };
      bypassMiddlewareNames.unshift(observerMiddlewareName);
    }

    config.http.routers[`${routerName}-bypass-${safeName(bypassConfig.name)}`] = {
      rule: bypassRule(hostRules, bypassConfig.rule),
      service: serviceName,
      ...(bypassMiddlewareNames.length > 0 && { middlewares: bypassMiddlewareNames }),
      ...(entrypoint && { entryPoints: [entrypoint] }),
      priority: securityConfig.priority,
      tls: tlsConfig,
    };
  }
}

/**
 * Determine TLS configuration for a service based on hostname mode and certificate configs
 */
function determineTlsConfig(service: Service, domain: Domain, hostnames: string[]): TraefikRouter['tls'] {
  // A blank/none resolver keeps TLS enabled without asking Traefik ACME to issue certificates.
  if (domain.useWildcardCert && service.hostnameMode === 'subdomain') {
    return routerTlsConfig(domain.certResolver, [
      {
        main: domain.domain,
        sans: [`*.${domain.domain}`],
      },
    ]);
  }

  const certificateConfigs = parseCertificateConfigs(domain.certificateConfigs);

  for (const certConfig of certificateConfigs) {
    const certDomains = [certConfig.main, ...(certConfig.sans || [])];
    const hasMatchingDomain = hostnames.some(hostname => certDomains.includes(hostname));

    if (hasMatchingDomain) {
      return routerTlsConfig(certConfig.certResolver, [
        {
          main: certConfig.main,
          sans: certConfig.sans,
        },
      ]);
    }
  }

  return routerTlsConfig(domain.certResolver);
}

/**
 * Create wildcard certificate trigger configuration for a domain
 */
function createWildcardCertTrigger(
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): void {
  if (!normalizeCertResolver(domain.certResolver)) return;

  // Create unique names for this domain
  const domainSafe = domain.domain.replace(/\./g, '-');
  const wildcardServiceName = `wildcard-cert-trigger-${domainSafe}`;
  const wildcardRouterName = `wildcard-cert-router-${domainSafe}`;
  const replacePathMiddlewareName = `wildcard-replace-path-${domainSafe}`;

  // Create middleware to replace any path with the whitepage endpoint
  config.http.middlewares![replacePathMiddlewareName] = {
    replacePath: {
      path: "/api/static/whitepage",
    },
  };

  // Create a simple service that serves the admin panel
  config.http.services[wildcardServiceName] = {
    loadBalancer: {
      servers: [
        {
          url: getAdminPanelBaseUrl(globalConfig),
        },
      ],
    },
  };

  // Build middlewares for wildcard route
  const wildcardMiddlewares: string[] = [];

  // Add global middlewares first
  if (globalConfig.globalMiddlewares.length > 0) {
    wildcardMiddlewares.push(...globalConfig.globalMiddlewares);
  }

  // Add path replacement middleware
  wildcardMiddlewares.push(replacePathMiddlewareName);

  // Create router for the base domain to trigger wildcard cert generation
  const wildcardRouter: TraefikRouter = {
    rule: `Host(\`${domain.domain}\`)`,
    service: wildcardServiceName,
    ...(wildcardMiddlewares.length > 0 && { middlewares: wildcardMiddlewares }),
    ...(globalConfig.defaultEntrypoint && { entryPoints: [globalConfig.defaultEntrypoint] }),
    tls: routerTlsConfig(domain.certResolver, [
      {
        main: domain.domain,
        sans: [`*.${domain.domain}`],
      },
    ]),
  };
  config.http.routers[wildcardRouterName] = wildcardRouter;
}

/**
 * Create certificate triggers for specific certificate configurations
 */
function createCertificateConfigTriggers(
  domain: Domain,
  globalConfig: GlobalTraefikConfig,
  config: TraefikConfig
): void {
  const certificateConfigs = parseCertificateConfigs(domain.certificateConfigs);

  for (const certConfig of certificateConfigs) {
    if (!normalizeCertResolver(certConfig.certResolver)) continue;

    // Create unique names for this certificate config
    const certConfigSafe = `${certConfig.name.replace(/[^a-zA-Z0-9]/g, '-')}-${certConfig.main.replace(/\./g, '-')}`;
    const certServiceName = `cert-trigger-${certConfigSafe}`;
    const certRouterName = `cert-router-${certConfigSafe}`;
    const replacePathMiddlewareName = `cert-replace-path-${certConfigSafe}`;

    // Create middleware to replace any path with the whitepage endpoint
    config.http.middlewares![replacePathMiddlewareName] = {
      replacePath: {
        path: "/api/static/whitepage",
      },
    };

    // Create a simple service that serves the admin panel
    config.http.services[certServiceName] = {
      loadBalancer: {
        servers: [
          {
            url: getAdminPanelBaseUrl(globalConfig),
          },
        ],
      },
    };

    // Build middlewares for certificate route
    const certMiddlewares: string[] = [];

    // Add global middlewares first
    if (globalConfig.globalMiddlewares.length > 0) {
      certMiddlewares.push(...globalConfig.globalMiddlewares);
    }

    // Add path replacement middleware
    certMiddlewares.push(replacePathMiddlewareName);

    // Create host rules for all domains covered by this certificate
    const certDomains = [certConfig.main, ...(certConfig.sans || [])];
    const hostRules = certDomains.map(hostname => `Host(\`${hostname}\`)`).join(" || ");

    // Create router for the certificate domains to trigger cert generation
    const certRouter: TraefikRouter = {
      rule: hostRules,
      service: certServiceName,
      ...(certMiddlewares.length > 0 && { middlewares: certMiddlewares }),
      ...(globalConfig.defaultEntrypoint && { entryPoints: [globalConfig.defaultEntrypoint] }),
      tls: routerTlsConfig(certConfig.certResolver, [
        {
          main: certConfig.main,
          sans: certConfig.sans,
        },
      ]),
    };
    config.http.routers[certRouterName] = certRouter;
  }
}

/**
 * Generate complete Traefik configuration
 */
export async function generateTraefikConfig(): Promise<TraefikConfig> {
  // Get enabled services with their domain information
  const enabledServices = await db
    .select({
      service: services,
      domain: domains,
    })
    .from(services)
    .leftJoin(domains, eq(services.domainId, domains.id))
    .where(eq(services.enabled, true));

  // Get all domains to ensure wildcard certificates are created even when no services are enabled
  const allDomains = await db.select().from(domains);

  const globalConfig = await getGlobalConfig();
  const ipJailSubjects = ipJailEnforcementEnabled() ? await listActiveIpJailSubjects() : [];

  const config: TraefikConfig = {
    http: {
      services: {},
      routers: {},
      middlewares: {},
    },
  };

  // Track unique domains for wildcard certificate generation
  const uniqueDomains = new Map<string, Domain>();

  // Process each enabled service
  for (const item of enabledServices) {
    const service = item.service;
    const domain = item.domain;

    if (!domain) {
      logger.error(`Service ${service.name} has no associated domain, skipping`);
      continue;
    }

    await createTraefikService(service, domain, globalConfig, config, ipJailSubjects);

    // Track this domain for wildcard certificate generation
    uniqueDomains.set(domain.id, domain);
  }

  // Add ALL domains to ensure wildcard certificates are created even when no services are enabled
  for (const domain of allDomains) {
    uniqueDomains.set(domain.id, domain);
  }

  // Add certificate triggers for all domains
  for (const domain of uniqueDomains.values()) {
    // Add wildcard certificate triggers for domains that use wildcard certificates
    if (domain.useWildcardCert) {
      createWildcardCertTrigger(domain, globalConfig, config);
    }

    // Add specific certificate configuration triggers
    const certificateConfigs = parseCertificateConfigs(domain.certificateConfigs);
    if (certificateConfigs.length > 0) {
      createCertificateConfigTriggers(domain, globalConfig, config);
    }
  }

  // Remove middlewares block if it's empty
  if (config.http.middlewares && Object.keys(config.http.middlewares).length === 0) {
    delete config.http.middlewares;
  }

  return config;
}
