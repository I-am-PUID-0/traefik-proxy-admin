import "server-only";
import net from "node:net";

export interface TargetTestResult {
  target: string;
  reachable: boolean;
  durationMs: number;
  error?: string;
}

export function testTcpConnection(host: string, port: number, timeoutMs = 3000): Promise<TargetTestResult> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (reachable: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        target: `${host}:${port}`,
        reachable,
        durationMs: Date.now() - startedAt,
        error,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false, `Connection timed out after ${timeoutMs}ms`));
    socket.once("error", (error) => settle(false, error.message));
    socket.connect(port, host);
  });
}
