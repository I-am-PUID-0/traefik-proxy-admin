import { NextResponse } from "next/server";
import { ServiceImportExportService } from "@/lib/services/service-import-export.service";

export async function GET() {
  try {
    const payload = await ServiceImportExportService.exportAllServices();
    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="traefik-proxy-admin-services-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Error exporting services:", error);
    return NextResponse.json({ error: "Failed to export services" }, { status: 500 });
  }
}
