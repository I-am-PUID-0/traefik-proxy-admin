import { NextRequest, NextResponse } from "next/server";
import { previewServiceConfig, type ServicePreviewRequest } from "@/lib/traefik/service-preview";
import { bodyErrorResponse, readJsonBody } from "@/lib/request-guards";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<ServicePreviewRequest>(request, 128 * 1024);
    const preview = await previewServiceConfig(body);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    console.error("Error previewing service Traefik config:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview service config" },
      { status: 400 },
    );
  }
}
