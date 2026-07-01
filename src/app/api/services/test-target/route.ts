import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { testTcpConnection } from "@/lib/target-test";
import { rateLimit, readJsonBody, RequestBodyError } from "@/lib/request-guards";

interface TargetTestRequest {
  targetIp?: string;
  targetPort?: number;
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { key: "target-test", limit: 60, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    const body = await readJsonBody<TargetTestRequest>(request, 16 * 1024);
    const targetIp = body.targetIp?.trim();
    const targetPort = Number(body.targetPort);

    if (!targetIp || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      return NextResponse.json(
        { reachable: false, error: "A valid target IP/host and port are required" },
        { status: 400 },
      );
    }

    return NextResponse.json(await testTcpConnection(targetIp, targetPort));
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ reachable: false, error: error.message }, { status: error.status });
    }

    logger.error("Error testing service target:", error);
    return NextResponse.json(
      { reachable: false, error: "Failed to test service target" },
      { status: 500 },
    );
  }
}
