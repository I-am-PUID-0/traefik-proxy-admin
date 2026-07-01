import { NextResponse } from "next/server";

import { fetchCrowdSecDecisions } from "@/lib/crowdsec";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const status = await fetchCrowdSecDecisions();
    return NextResponse.json(status, { status: status.configured && !status.reachable ? 502 : 200 });
  } catch (error) {
    logger.error("Error fetching CrowdSec status", error);
    return NextResponse.json({ configured: true, reachable: false, decisions: [], error: "Failed to fetch CrowdSec status" }, { status: 500 });
  }
}
