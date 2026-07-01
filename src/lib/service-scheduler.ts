import "server-only";
import { db, services } from "@/lib/db";
import { eq } from "drizzle-orm";

class ServiceScheduler {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL = 10 * 1000; // Check every 10 seconds

  async start() {
    if (this.isRunning) {
      console.log("Service scheduler is already running");
      return;
    }

    console.log("Starting service auto-disable scheduler...");
    this.isRunning = true;

    // Run initial check
    await this.checkExpiredServices();

    // Set up recurring checks
    this.interval = setInterval(async () => {
      try {
        await this.checkExpiredServices();
      } catch (error) {
        console.error("Error in service scheduler:", error);
      }
    }, this.CHECK_INTERVAL);

    console.log(`Service scheduler started - checking every ${this.CHECK_INTERVAL / 1000} seconds`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log("Service scheduler stopped");
  }

  private async checkExpiredServices() {
    try {
      const disabledCount = await checkAndDisableExpiredServices();
      if (disabledCount > 0) {
        console.log(`Scheduler: Auto-disabled ${disabledCount} expired service(s)`);
      }
    } catch (error) {
      console.error("Error in scheduler checking expired services:", error);
    }
  }

  isActive() {
    return this.isRunning;
  }
}

/**
 * Standalone function to check and disable expired services
 * Can be called from API endpoints for immediate checking
 */
export async function checkAndDisableExpiredServices(): Promise<number> {
  try {
    const allEnabledServices = await db
      .select()
      .from(services)
      .where(eq(services.enabled, true));

    let disabledCount = 0;

    // Check each enabled service for expiration
    for (const service of allEnabledServices) {
      const expiryTime = getServiceAutoDisableAt(service.enabledAt, service.enableDurationMinutes);

      if (expiryTime && new Date() >= expiryTime) {
        console.log(`Auto-disabling expired service: ${service.name} (${service.subdomain})`);

        await db
          .update(services)
          .set({
            enabled: false,
            updatedAt: new Date()
          })
          .where(eq(services.id, service.id));

        disabledCount++;
      }
    }

    return disabledCount;
  } catch (error) {
    console.error("Error checking expired services:", error);
    return 0;
  }
}

export function getServiceAutoDisableAt(
  enabledAt: Date | string | null | undefined,
  durationMinutes: number | null | undefined,
): Date | null {
  if (!enabledAt || durationMinutes === null || durationMinutes === undefined) {
    return null;
  }

  return new Date(new Date(enabledAt).getTime() + (durationMinutes * 60 * 1000));
}

export const serviceScheduler = new ServiceScheduler();
