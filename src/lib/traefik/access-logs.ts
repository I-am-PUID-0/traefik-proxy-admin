import "server-only";
import { open, stat } from "fs/promises";
import path from "path";

import { parseTraefikAccessLogLine, type TraefikLogEntry } from "@/lib/traefik/access-log-parser";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1000;
const MAX_TAIL_BYTES = 1024 * 1024;

export type { TraefikLogEntry };

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
      entries: lines.map((line, index) => parseTraefikAccessLogLine(line, index)).reverse(),
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
