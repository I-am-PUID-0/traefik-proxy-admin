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
  const requestParts = (tokens[4] || "").split(/\s+/);
  const target = parseRequestTarget(requestParts[1]);

  return {
    id: `${index}-${line.length}`,
    timestamp: tokens[3] || null,
    method: requestParts[0] || null,
    host: target.host,
    path: target.path,
    status: numberOrNull(tokens[5]),
    originStatus: numberOrNull(tokens[5]),
    clientIp: tokens[0] || null,
    routerName: tokens[10] && tokens[10] !== "-" ? tokens[10] : null,
    serviceName: tokens[11] && tokens[11] !== "-" ? tokens[11] : null,
    durationMs: parseDurationToken(tokens[12]),
    raw: redactSensitiveText(line),
  };
}

export function parseTraefikAccessLogLine(line: string, index = 0) {
  return parseJsonLine(line, index) || parseCommonLine(line, index);
}
