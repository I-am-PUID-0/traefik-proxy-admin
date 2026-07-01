import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { BackupRestoreService } from "@/lib/services/backup-restore.service";

export async function GET() {
  try {
    const payload = await BackupRestoreService.exportBackup();
    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="traefik-proxy-admin-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    logger.error("Error exporting backup:", error);
    return NextResponse.json({ error: "Failed to export backup" }, { status: 500 });
  }
}
