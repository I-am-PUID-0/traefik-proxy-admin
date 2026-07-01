import "server-only";
import { db, services, serviceSecurityConfigs, domains, NewService } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkAndDisableExpiredServices } from "@/lib/service-scheduler";
import type { Service } from "@/components/service-table";
import type {
  CreateServiceData,
  UpdateServiceData,
  HostnameMode
} from "@/lib/dto/service.dto";
import { validateServiceRoutingInput } from "@/lib/validators/route-input.validator";
import { logger } from "@/lib/logger";

export interface ServiceWithDomainAndSecurity extends Service {
  hasSharedLink: boolean;
  hasSso: boolean;
  hasBasicAuth: boolean;
  basicAuthCount: number;
}

export class ServiceService {
  // Helper methods for parsing JSON fields
  private static parseMiddlewares(middlewares: string | null): string[] {
    if (!middlewares) return [];

    try {
      const parsed = JSON.parse(middlewares);
      return Array.isArray(parsed) ? parsed : [middlewares];
    } catch {
      // If JSON parsing fails, treat as a single middleware string
      const trimmed = middlewares.trim();
      return trimmed ? [trimmed] : [];
    }
  }

  private static parseRequestHeaders(requestHeaders: string | null): Record<string, string> {
    if (!requestHeaders) return {};

    try {
      const parsed = JSON.parse(requestHeaders);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (error) {
      logger.warn("Failed to parse request headers:", error);
      return {};
    }
  }

  static async getAllServices(): Promise<ServiceWithDomainAndSecurity[]> {
    // Check and disable any expired services before returning the list
    const disabledCount = await checkAndDisableExpiredServices();
    if (disabledCount > 0) {
      logger.info(`Service: Auto-disabled ${disabledCount} expired service(s)`);
    }

    // Get services with domain information
    const allServices = await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id));

    // Get security configuration counts for each service
    const servicesWithSecurity = await Promise.all(
      allServices.map(async (item) => {
        const service = item.service;
        const domain = item.domain;

        // Get security config counts
        const securityConfigs = await db
          .select({
            securityType: serviceSecurityConfigs.securityType
          })
          .from(serviceSecurityConfigs)
          .where(eq(serviceSecurityConfigs.serviceId, service.id));

        const hasSharedLink = securityConfigs.some(config => config.securityType === 'shared_link');
        const hasSso = securityConfigs.some(config => config.securityType === 'sso');
        const hasBasicAuth = securityConfigs.some(config => config.securityType === 'basic_auth');
        const basicAuthCount = securityConfigs.filter(config => config.securityType === 'basic_auth').length;

        return {
          ...service,
          hostnameMode: service.hostnameMode as HostnameMode,
          enabledAt: service.enabledAt?.toISOString() || undefined,
          enableDurationMinutes: service.enableDurationMinutes ?? null,
          middlewares: service.middlewares || undefined,
          requestHeaders: service.requestHeaders || undefined,
          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),
          domain: domain || undefined,
          hasSharedLink,
          hasSso,
          hasBasicAuth,
          basicAuthCount,
        };
      })
    );

    return servicesWithSecurity;
  }

  static async createService(serviceData: CreateServiceData) {
    // Validate the service data
    validateServiceRoutingInput(serviceData);

    const [service] = await db.insert(services).values(serviceData).returning();
    return service;
  }

  static async getServiceById(id: string) {
    const result = await db
      .select()
      .from(services)
      .where(eq(services.id, id));

    return result.length > 0 ? result[0] : null;
  }

  static async getServiceByIdWithDomain(id: string): Promise<ServiceWithDomainAndSecurity | null> {
    const result = await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id))
      .where(eq(services.id, id));

    if (result.length === 0) {
      return null;
    }

    const item = result[0];
    const service = item.service;
    const domain = item.domain;

    // Get security config counts
    const securityConfigs = await db
      .select({
        securityType: serviceSecurityConfigs.securityType
      })
      .from(serviceSecurityConfigs)
      .where(eq(serviceSecurityConfigs.serviceId, service.id));

    const hasSharedLink = securityConfigs.some(config => config.securityType === 'shared_link');
    const hasSso = securityConfigs.some(config => config.securityType === 'sso');
    const hasBasicAuth = securityConfigs.some(config => config.securityType === 'basic_auth');
    const basicAuthCount = securityConfigs.filter(config => config.securityType === 'basic_auth').length;

    return {
      ...service,
      hostnameMode: service.hostnameMode as HostnameMode,
      enabledAt: service.enabledAt?.toISOString() || undefined,
      enableDurationMinutes: service.enableDurationMinutes ?? null,
      middlewares: service.middlewares || undefined,
      requestHeaders: service.requestHeaders || undefined,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
      domain: domain || undefined,
      hasSharedLink,
      hasSso,
      hasBasicAuth,
      basicAuthCount,
    };
  }

  static async updateService(id: string, serviceData: UpdateServiceData) {
    // Validate the service data
    validateServiceRoutingInput(serviceData);

    const [service] = await db
      .update(services)
      .set({
        ...serviceData,
        updatedAt: new Date(),
      })
      .where(eq(services.id, id))
      .returning();

    return service;
  }

  static async deleteService(id: string) {
    await db.delete(services).where(eq(services.id, id));
  }

  static async toggleService(id: string, enabled?: boolean, durationMinutes?: number | null) {
    // Get current service state if enabled is not specified
    const currentService = await this.getServiceById(id);
    if (!currentService) {
      return null;
    }

    const newEnabledState = enabled !== undefined ? enabled : !currentService.enabled;
    const updateData: Partial<NewService> = {
      enabled: newEnabledState,
    };

    // If enabling the service, set enabledAt and duration
    if (newEnabledState) {
      updateData.enabledAt = new Date();

      // Use provided duration, or keep the service's existing duration (including null for infinite)
      if (durationMinutes !== undefined) {
        updateData.enableDurationMinutes = durationMinutes;
      }
      // Otherwise keep the existing service duration (null = infinite, number = finite)
    }

    const [service] = await db
      .update(services)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(services.id, id))
      .returning();

    return service;
  }
}
