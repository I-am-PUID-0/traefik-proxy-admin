import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfig, updateGlobalConfig, GlobalTraefikConfig } from "@/lib/app-config";
import { bodyErrorResponse, readJsonBody } from "@/lib/request-guards";

export async function GET() {
  try {
    const config = await getGlobalConfig();
    return NextResponse.json(config);
  } catch (error) {
    logger.error("Error fetching global config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await readJsonBody<GlobalTraefikConfig>(request, 64 * 1024);
    
    // Validate required fields
    if (!body.adminPanelDomain) {
      return NextResponse.json(
        { error: "Internal TPA URL for Traefik is required" },
        { status: 400 }
      );
    }

    // Ensure globalMiddlewares is an array
    if (!Array.isArray(body.globalMiddlewares)) {
      body.globalMiddlewares = [];
    }

    await updateGlobalConfig(body);
    
    // Return the updated configuration
    const updatedConfig = await getGlobalConfig();
    return NextResponse.json(updatedConfig);
  } catch (error) {
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    logger.error("Error updating global config:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}