import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { ServiceImportExportService } from "@/lib/services/service-import-export.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await ServiceImportExportService.exportService(id);
    const serviceName = payload.services[0]?.name || "service";
    const safeName = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";

    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="traefik-proxy-admin-${safeName}.json"`,
      },
    });
  } catch (error) {
    logger.error("Error exporting service:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export service" },
      { status: error instanceof Error && error.message === "Service not found" ? 404 : 500 },
    );
  }
}
