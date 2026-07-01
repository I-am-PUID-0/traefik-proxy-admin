import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { BackupRestoreService } from "@/lib/services/backup-restore.service";
import { bodyErrorResponse, readJsonBody } from "@/lib/request-guards";

interface RestoreRequestBody {
  backup?: unknown;
  dryRun?: boolean;
  confirmReplace?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<RestoreRequestBody>(request, 5 * 1024 * 1024);
    if (!body.backup) {
      return NextResponse.json({ error: "Backup payload is required" }, { status: 400 });
    }

    if (body.dryRun) {
      return NextResponse.json(BackupRestoreService.inspectBackup(body.backup));
    }

    if (!body.confirmReplace) {
      return NextResponse.json({ error: "Restore requires confirmReplace=true" }, { status: 400 });
    }

    const result = await BackupRestoreService.restoreBackup(body.backup);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "RequestBodyError") {
      return bodyErrorResponse(error);
    }

    logger.error("Error restoring backup:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore backup" },
      { status: 400 },
    );
  }
}
