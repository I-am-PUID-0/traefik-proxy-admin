import { NextResponse } from "next/server";

import { deleteIpJailDecision } from "@/lib/ip-jail";
import { logger } from "@/lib/logger";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteIpJailDecision(id);
    return NextResponse.json({ message: "IP jail decision released" });
  } catch (error) {
    logger.error("Error deleting IP jail decision", error);
    return NextResponse.json({ error: "Failed to release IP jail decision" }, { status: 500 });
  }
}
