import { NextRequest, NextResponse } from "next/server";
import {
  ServiceImportExportService,
  type ServiceImportConflictStrategy,
} from "@/lib/services/service-import-export.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = body?.payload ?? body;
    const conflictStrategy: ServiceImportConflictStrategy = body?.conflictStrategy === "rename" ? "rename" : "skip";
    const result = await ServiceImportExportService.importServices(payload, conflictStrategy);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error importing services:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import services" },
      { status: 400 },
    );
  }
}
