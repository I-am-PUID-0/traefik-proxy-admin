import { NextRequest, NextResponse } from "next/server";
import {
  ServiceImportExportService,
  type ServiceImportConflictStrategy,
} from "@/lib/services/service-import-export.service";
import { bodyErrorResponse, rateLimit, readJsonBody } from "@/lib/request-guards";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "services-import", limit: 20, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 1024 * 1024);
    const payload = body?.payload ?? body;
    const conflictStrategy: ServiceImportConflictStrategy = body?.conflictStrategy === "rename" ? "rename" : "skip";
    const result = await ServiceImportExportService.importServices(payload, conflictStrategy);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    console.error("Error importing services:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import services" },
      { status: 400 },
    );
  }
}
