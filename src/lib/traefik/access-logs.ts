import "server-only";
import { open, stat } from "fs/promises";
import path from "path";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1000;
const MAX_TAIL_BYTES = 1024 * 1024;

const SENSITIVE_QUERY_KEYS = [
  "access_token",
  "apikey",
  "api_key",
  "auth",
  "code",
  "key",
  "password",
  "secret",
  "session",
  "token",
];

export interface TraefikLogEntry {
  id: string;
  timestamp?: string | null;
  level?: string | null;
  method?: string | null;
  host?: string | null;
  path?: string | null;
  status?: number | null;
  originStatus?: number | null;
  clientIp?: string | null;
  routerName?: string | null;
  serviceName?: string | null;
  durationMs?: number | null;
  raw: string;
}

export interface TraefikLogsResult {
  configured: boolean;
  path?: string;
  error?: string;
  entries: TraefikLogEntry[];
}

function configuredPath() {
  const value = process.env.TRAEFIK_ACCESS_LOG_PATH?.trim();
  if (!value) return null;
  return path.resolve(value);
}

function safeLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function redactSensitiveText(value: string) {
  let redacted = value;
  for (const key of SENSITIVE_QUERY_KEYS) {
    const pattern = new RegExp(`([?&;]${key}=)([^\\s&#;]+)`, "gi");
    redacted = redacted.replace(pattern, "$1REDACTED");
  }
  return redacted;
}

function redactPath(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value, "http://tpa.local");
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
        parsed.searchParams.set(key, "REDACTED");
      }
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return redactSensitiveText(value);
  }
}

function firstIp(value: unknown) {
  if (typeof value !== "string") return null;
  return value.split(":")[0] || value;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationMs(value: unknown) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return parsed > 1_000_000 ? Math.round(parsed / 1_000_000) : parsed;
}

function parseJsonLine(line: string, index: number): TraefikLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return {
      id: `${index}-${String(parsed.StartUTC || parsed.time || parsed.Time || "")}`,
      timestamp: String(parsed.StartUTC || parsed.time || parsed.Time || parsed.StartLocal || "") || null,
      level: typeof parsed.level === "string" ? parsed.level : null,
      method: typeof parsed.RequestMethod === "string" ? parsed.RequestMethod : null,
      host: typeof parsed.RequestHost === "string" ? parsed.RequestHost : null,
      path: redactPath(parsed.RequestPath || parsed.RequestURI),
      status: numberOrNull(parsed.DownstreamStatus || parsed.OriginStatus),
      originStatus: numberOrNull(parsed.OriginStatus),
      clientIp: firstIp(parsed.ClientHost || parsed.ClientAddr),
      routerName: typeof parsed.RouterName === "string" ? parsed.RouterName : null,
      serviceName: typeof parsed.ServiceName === "string" ? parsed.ServiceName : null,
      durationMs: durationMs(parsed.Duration || parsed.OriginDuration),
      raw: redactSensitiveText(line),
    };
  } catch {
    return null;
  }
}

function tokenizeCommonLine(line: string) {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|\[([^\]]*)\]|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line))) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }

  return tokens;
}

function parseDurationToken(value: string | undefined) {
  if (!value || value === "-") return null;
  const match = value.match(/^(\d+(?:\.\d+)?)(ns|µs|us|ms|s)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const unit = (match[2] || "ms").toLowerCase();
  if (unit === "s") return Math.round(amount * 1000);
  if (unit === "ns") return Math.round(amount / 1_000_000);
  if (unit === "µs" || unit === "us") return Math.round(amount / 1000);
  return Math.round(amount);
}

function parseRequestTarget(target: string | undefined) {
  const redacted = redactPath(target || null);
  if (!redacted) return { host: null, path: null };

  try {
    const parsed = new URL(redacted);
    return { host: parsed.host || null, path: parsed.pathname + parsed.search + parsed.hash };
  } catch {
    return { host: null, path: redacted };
  }
}

function parseCommonLine(line: string, index: number): TraefikLogEntry {
  const tokens = tokenizeCommonLine(line);
  const requestParts = (tokens[3] || "").split(/\s+/);
  const target = parseRequestTarget(requestParts[1]);

  return {
    id: index + "-" + line.length,
    timestamp: tokens[2] || null,
    method: requestParts[0] || null,
    host: target.host,
    path: target.path,
    status: numberOrNull(tokens[4]),
    originStatus: numberOrNull(tokens[4]),
    clientIp: tokens[0] || null,
    routerName: tokens[8] && tokens[8] !== "-" ? tokens[8] : null,
    serviceName: tokens[9] && tokens[9] !== "-" ? tokens[9] : null,
    durationMs: parseDurationToken(tokens[10]),
    raw: redactSensitiveText(line),
  };
}

function parseLine(line: string, index: number) {
  return parseJsonLine(line, index) || parseCommonLine(line, index);
}

async function tailLines(filePath: string, limit: number) {
  const fileStat = await stat(filePath);
  const size = fileStat.size;
  const readSize = Math.min(size, MAX_TAIL_BYTES);
  const start = Math.max(0, size - readSize);
  const file = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(readSize);
    await file.read(buffer, 0, readSize, start);
    return buffer
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-limit);
  } finally {
    await file.close();
  }
}

export async function readTraefikAccessLogs(limitValue: string | null): Promise<TraefikLogsResult> {
  const filePath = configuredPath();
  if (!filePath) return { configured: false, entries: [] };

  try {
    const limit = safeLimit(limitValue);
    const lines = await tailLines(filePath, limit);
    return {
      configured: true,
      path: filePath,
      entries: lines.map((line, index) => parseLine(line, index)).reverse(),
    };
  } catch (error) {
    return {
      configured: true,
      path: filePath,
      error: error instanceof Error ? error.message : "Failed to read Traefik access log",
      entries: [],
    };
  }
}
