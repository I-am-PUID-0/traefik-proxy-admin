import { NextRequest, NextResponse } from "next/server";
import net from "node:net";

interface TargetTestRequest {
  targetIp?: string;
  targetPort?: number;
}

function testTcpConnection(host: string, port: number, timeoutMs = 3000): Promise<{ reachable: boolean; durationMs: number; error?: string }> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (reachable: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ reachable, durationMs: Date.now() - startedAt, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false, `Connection timed out after ${timeoutMs}ms`));
    socket.once("error", (error) => settle(false, error.message));
    socket.connect(port, host);
  });
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

    const result = await testTcpConnection(targetIp, targetPort);

    return NextResponse.json({
      target: `${targetIp}:${targetPort}`,
      ...result,
    });
  } catch (error) {
    console.error("Error testing service target:", error);
    return NextResponse.json(
      { reachable: false, error: "Failed to test service target" },
      { status: 500 },
    );
  }
}
