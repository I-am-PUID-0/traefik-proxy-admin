#!/usr/bin/env node
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

const HMR_PATH = "/_next/webpack-hmr?id=dev-hmr-check";

function printHelp() {
  console.log(`Usage: pnpm dev:check-hmr -- [options]

Checks whether the Next dev HMR websocket can upgrade through the direct dev
server, the devcontainer Traefik route, and the public/proxied route.

Options:
  --host <hostname>         Proxied dev hostname to use for Traefik/public checks.
  --next-url <url>          Direct Next dev URL. Default: http://127.0.0.1:3000
  --traefik-url <url>       Local Traefik entrypoint URL. Default: https://127.0.0.1:8081
  --public-url <url>        Public/proxied URL. Default: https://<host>
  --help                    Show this help.

Environment:
  TPA_DEV_HOST              Same as --host; used only by this diagnostic.
  TPA_NEXT_DEV_URL          Same as --next-url.
  TPA_DEV_TRAEFIK_URL       Same as --traefik-url.
  TPA_DEV_PUBLIC_URL        Same as --public-url.
  NEXT_ALLOWED_DEV_ORIGINS  Fallback host source when --host/TPA_DEV_HOST are unset.

Note: TPA_DEV_HOST does not configure Next.js. Keep NEXT_ALLOWED_DEV_ORIGINS set
for proxied dev hosts that need to load Next dev resources.`);
}

function argValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return "";
}

function firstAllowedDevOrigin() {
  return (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)[0] || "";
}

function normalizeUrl(value) {
  if (!value) return null;
  return new URL(value.includes("://") ? value : `https://${value}`);
}

function websocketHandshake({ label, url, hostHeader, originHost }) {
  return new Promise((resolve) => {
    const secure = url.protocol === "https:" || url.protocol === "wss:";
    const port = Number(url.port || (secure ? 443 : 80));
    const host = url.hostname;
    const connect = secure ? tls.connect : net.createConnection;
    const socket = connect(
      secure
        ? { host, port, servername: hostHeader || host, rejectUnauthorized: false }
        : { host, port },
      () => {
        const key = crypto.randomBytes(16).toString("base64");
        const requestHost = hostHeader || url.host;
        const headers = {
          Host: requestHost,
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": key,
          "Sec-WebSocket-Version": "13",
        };
        if (originHost) {
          headers.Origin = `${secure ? "https" : "http"}://${originHost}`;
        }

        socket.write(
          `GET ${HMR_PATH} HTTP/1.1\r\n`
          + Object.entries(headers).map(([header, value]) => `${header}: ${value}`).join("\r\n")
          + "\r\n\r\n",
        );
      },
    );

    let response = "";
    socket.setTimeout(8_000);
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("\r\n\r\n")) socket.destroy();
    });
    socket.on("timeout", () => socket.destroy());
    socket.on("error", (error) => resolve({ label, ok: false, detail: error.message }));
    socket.on("close", () => {
      const statusLine = response.split("\r\n")[0] || "";
      resolve({
        label,
        ok: statusLine.includes("101 Switching Protocols"),
        detail: statusLine || "no response",
      });
    });
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const host = argValue("--host") || process.env.TPA_DEV_HOST || firstAllowedDevOrigin();
  const nextUrl = normalizeUrl(argValue("--next-url") || process.env.TPA_NEXT_DEV_URL || "http://127.0.0.1:3000");
  const traefikUrl = normalizeUrl(argValue("--traefik-url") || process.env.TPA_DEV_TRAEFIK_URL || "https://127.0.0.1:8081");
  const publicUrl = normalizeUrl(argValue("--public-url") || process.env.TPA_DEV_PUBLIC_URL || host);

  const checks = [
    websocketHandshake({ label: "direct Next dev", url: nextUrl, originHost: host }),
  ];

  if (host) {
    checks.push(websocketHandshake({
      label: "local Traefik dev route",
      url: traefikUrl,
      hostHeader: host,
      originHost: host,
    }));

    checks.push(websocketHandshake({
      label: "public dev route",
      url: publicUrl,
      hostHeader: publicUrl.host,
      originHost: publicUrl.host,
    }));
  } else {
    console.log("Skipping Traefik/public checks; set NEXT_ALLOWED_DEV_ORIGINS or pass --host <hostname>.");
  }

  const results = await Promise.all(checks);
  let failed = false;
  for (const result of results) {
    const status = result.ok ? "PASS" : "FAIL";
    console.log(`${status} ${result.label}: ${result.detail}`);
    failed = failed || !result.ok;
  }

  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
