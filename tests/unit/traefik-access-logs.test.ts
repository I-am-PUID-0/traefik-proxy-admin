import { describe, expect, it } from "vitest";

import { parseTraefikAccessLogLine } from "@/lib/traefik/access-log-parser";

describe("parseTraefikAccessLogLine", () => {
  it("parses Traefik extended common access log lines", () => {
    const entry = parseTraefikAccessLogLine(
      `127.0.0.1,185.177.72.205 - - [26/May/2026:14:57:38 +0000] "GET /_phpinfo.php HTTP/1.1" 404 19 "-" "curl/8.7.1" 253486 "-" "-" 0ms`,
    );

    expect(entry.clientIp).toBe("127.0.0.1,185.177.72.205");
    expect(entry.timestamp).toBe("26/May/2026:14:57:38 +0000");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/_phpinfo.php");
    expect(entry.status).toBe(404);
    expect(entry.bytesWritten).toBe(19);
    expect(entry.userAgent).toBe("curl/8.7.1");
    expect(entry.routerName).toBeNull();
    expect(entry.serviceName).toBeNull();
    expect(entry.durationMs).toBe(0);
  });

  it("redacts sensitive query values in common access log lines", () => {
    const entry = parseTraefikAccessLogLine(
      `10.0.0.2 - - [26/May/2026:14:57:38 +0000] "GET /api?token=abc123&safe=yes HTTP/1.1" 200 19 "-" "curl/8.7.1" 1 "router@file" "service@file" 12ms`,
    );

    expect(entry.path).toBe("/api?token=REDACTED&safe=yes");
    expect(entry.bytesWritten).toBe(19);
    expect(entry.userAgent).toBe("curl/8.7.1");
    expect(entry.routerName).toBe("router@file");
    expect(entry.serviceName).toBe("service@file");
    expect(entry.durationMs).toBe(12);
  });

  it("parses useful JSON access log fields", () => {
    const entry = parseTraefikAccessLogLine(JSON.stringify({
      StartUTC: "2026-01-01T00:00:00Z",
      RequestMethod: "POST",
      RequestHost: "app.example.com",
      RequestPath: "/login?code=abc123",
      DownstreamStatus: 502,
      OriginStatus: 502,
      ClientHost: "203.0.113.10:49152",
      RequestUserAgent: "ExampleClient/1.0",
      RouterName: "app@http",
      ServiceName: "app@http",
      Duration: 37_000_000,
      DownstreamContentSize: 512,
    }));

    expect(entry.path).toBe("/login?code=REDACTED");
    expect(entry.clientIp).toBe("203.0.113.10");
    expect(entry.userAgent).toBe("ExampleClient/1.0");
    expect(entry.bytesWritten).toBe(512);
    expect(entry.durationMs).toBe(37);
  });
});
