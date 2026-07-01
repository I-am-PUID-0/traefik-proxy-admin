import { NextRequest, NextResponse } from "next/server";
import { createSharedLink } from "@/lib/shared-links";
import { db, services, domains } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getPrimaryServiceHostname } from "@/lib/service-hostnames";
import { bodyErrorResponse, readJsonBody, RequestBodyError } from "@/lib/request-guards";

interface ShareLinkRequestBody {
  serviceId?: string;
  expiresInHours?: number;
  sessionDurationMinutes?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { serviceId, expiresInHours = 24, sessionDurationMinutes = 60 } =
      await readJsonBody<ShareLinkRequestBody>(request);

    if (!serviceId) {
      return NextResponse.json(
        { error: "Service ID is required" },
        { status: 400 }
      );
    }

    // Get service details with domain information
    const result = await db
      .select({
        service: services,
        domain: domains,
      })
      .from(services)
      .leftJoin(domains, eq(services.domainId, domains.id))
      .where(eq(services.id, serviceId));

    if (result.length === 0 || !result[0].service) {
      return NextResponse.json(
        { error: "Service not found" },
        { status: 404 }
      );
    }

    const { service, domain } = result[0];

    if (!domain) {
      return NextResponse.json(
        { error: "Service domain not found" },
        { status: 404 }
      );
    }

    const serviceHostname = getPrimaryServiceHostname(service, domain);
    if (!serviceHostname) {
      return NextResponse.json(
        { error: "Service has no routable hostname" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const sharedLink = await createSharedLink(
      serviceId,
      expiresAt,
      sessionDurationMinutes
    );

    // Create URL pointing to the actual service hostname with traefik-token
    const serviceUrl = new URL("/", `https://${serviceHostname}`);
    serviceUrl.searchParams.set("traefik-token", sharedLink.token);
    const shareUrl = serviceUrl.toString();

    return NextResponse.json({
      shareUrl,
      token: sharedLink.token,
      expiresAt: sharedLink.expiresAt,
      serviceUrl: serviceUrl.origin,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return bodyErrorResponse(error);
    }

    console.error("Error creating shared link:", error);
    return NextResponse.json(
      { error: "Failed to create shared link" },
      { status: 500 }
    );
  }
}
