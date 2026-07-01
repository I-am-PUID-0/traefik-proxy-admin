import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { DomainService } from "@/lib/services/domain.service";
import type { CreateDomainRequest, CreateDomainData } from "@/lib/dto/domain.dto";
import { bodyErrorResponse, readJsonBody, RequestBodyError } from "@/lib/request-guards";

export async function GET() {
  try {
    const domains = await DomainService.getAllDomains();
    return NextResponse.json(domains);
  } catch (error) {
    logger.error("Error fetching domains:", error);
    return NextResponse.json(
      { error: "Failed to fetch domains" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<CreateDomainRequest>(request);

    const newDomainData: CreateDomainData = {
      name: body.name,
      domain: body.domain,
      description: body.description || null,
      useWildcardCert: body.useWildcardCert ?? true,
      certResolver: typeof body.certResolver === "string" ? body.certResolver.trim() : "",
      certificateConfigs: body.certificateConfigs ? JSON.stringify(body.certificateConfigs) : null,
      isDefault: body.isDefault ?? false,
    };

    const domain = await DomainService.createDomain(newDomainData);
    return NextResponse.json(domain);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return bodyErrorResponse(error);
    }

    logger.error("Error creating domain:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create domain" },
      { status: 500 }
    );
  }
}
