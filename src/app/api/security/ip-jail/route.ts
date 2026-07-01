import { NextRequest, NextResponse } from "next/server";

import {
  createIpJailDecision,
  ipJailEnforcementEnabled,
  listIpJailDecisions,
} from "@/lib/ip-jail";
import { bodyErrorResponse, readJsonBody, RequestBodyError } from "@/lib/request-guards";
import { logger } from "@/lib/logger";

interface CreateIpJailDecisionBody {
  subject?: unknown;
  reason?: unknown;
  source?: unknown;
  evidence?: unknown;
  expiresAt?: unknown;
  expiresInMinutes?: unknown;
  confirmLocalhost?: unknown;
}

export async function GET() {
  try {
    const decisions = await listIpJailDecisions();
    return NextResponse.json({ decisions, enforcementEnabled: ipJailEnforcementEnabled() });
  } catch (error) {
    logger.error("Error listing IP jail decisions", error);
    return NextResponse.json({ error: "Failed to list IP jail decisions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<CreateIpJailDecisionBody>(request, 16 * 1024);
    if (typeof body.subject !== "string") {
      return NextResponse.json({ error: "IP address or CIDR range is required" }, { status: 400 });
    }

    const expiresAt = parseExpiry(body);
    const decision = await createIpJailDecision({
      subject: body.subject,
      reason: typeof body.reason === "string" ? body.reason : null,
      source: typeof body.source === "string" ? body.source : null,
      evidence: typeof body.evidence === "string" ? body.evidence : null,
      expiresAt,
      allowLocalhost: body.confirmLocalhost === true,
    });

    return NextResponse.json({ decision }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("IP")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Use ")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("CIDR ")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Loopback ")) {
      return NextResponse.json({ error: error.message, requiresLocalhostConfirmation: true }, { status: 400 });
    }

    if (error instanceof RequestBodyError) {
      return bodyErrorResponse(error);
    }

    logger.error("Error creating IP jail decision", error);
    return NextResponse.json({ error: "Failed to create IP jail decision" }, { status: 500 });
  }
}

function parseExpiry(body: CreateIpJailDecisionBody) {
  if (typeof body.expiresAt === "string" && body.expiresAt.trim()) {
    const parsed = new Date(body.expiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (typeof body.expiresInMinutes === "number" && Number.isFinite(body.expiresInMinutes)) {
    if (body.expiresInMinutes <= 0) return null;
    return new Date(Date.now() + Math.round(body.expiresInMinutes) * 60_000);
  }

  return null;
}
