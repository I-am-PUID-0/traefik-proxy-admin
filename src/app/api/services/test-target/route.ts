import { NextRequest, NextResponse } from "next/server";
import { testTcpConnection } from "@/lib/target-test";

interface TargetTestRequest {
  targetIp?: string;
  targetPort?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: TargetTestRequest = await request.json();
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
    console.error("Error testing service target:", error);
    return NextResponse.json(
      { reachable: false, error: "Failed to test service target" },
      { status: 500 },
    );
  }
}
