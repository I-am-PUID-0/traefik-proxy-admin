import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { ServiceService } from "@/lib/services/service.service";
import { testTcpConnection } from "@/lib/target-test";

export async function GET() {
  try {
    const services = await ServiceService.getAllServices();
    const checks = await Promise.all(
      services.map(async (service) => ({
        serviceId: service.id,
        name: service.name,
        enabled: service.enabled,
        ...(await testTcpConnection(service.targetIp, service.targetPort, 2000)),
      })),
    );

    return NextResponse.json({ checks });
  } catch (error) {
    logger.error("Error checking service health:", error);
    return NextResponse.json(
      { error: "Failed to check service health", checks: [] },
      { status: 500 },
    );
  }
}
