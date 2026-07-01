import "server-only";

export interface CrowdSecDecision {
  id?: number;
  origin?: string;
  scenario?: string;
  scope?: string;
  type?: string;
  value?: string;
  duration?: string;
}

export interface CrowdSecStatus {
  configured: boolean;
  reachable: boolean;
  apiUrl?: string;
  mode?: "stream";
  decisions: CrowdSecDecision[];
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 2500;

export function getCrowdSecConfig() {
  const apiUrl = process.env.CROWDSEC_LAPI_URL?.trim().replace(/\/+$/, "") || "";
  const apiKey = process.env.CROWDSEC_BOUNCER_API_KEY?.trim() || "";
  const timeoutMs = Number(process.env.CROWDSEC_LAPI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    apiUrl,
    apiKey,
    configured: Boolean(apiUrl && apiKey),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

export async function fetchCrowdSecDecisions(): Promise<CrowdSecStatus> {
  const config = getCrowdSecConfig();
  if (!config.configured) {
    return {
      configured: false,
      reachable: false,
      apiUrl: config.apiUrl || undefined,
      decisions: [],
      error: "CROWDSEC_LAPI_URL and CROWDSEC_BOUNCER_API_KEY are required",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.apiUrl}/v1/decisions/stream?startup=true`, {
      headers: {
        "Accept": "application/json",
        "X-Api-Key": config.apiKey,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        configured: true,
        reachable: false,
        apiUrl: config.apiUrl,
        decisions: [],
        error: response.status === 403
          ? "CrowdSec rejected the bouncer API key"
          : `CrowdSec LAPI returned HTTP ${response.status}`,
      };
    }

    return {
      configured: true,
      reachable: true,
      apiUrl: config.apiUrl,
      mode: "stream",
      decisions: normalizeStreamDecisions(payload),
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      apiUrl: config.apiUrl,
      decisions: [],
      error: error instanceof Error && error.name === "AbortError"
        ? "CrowdSec LAPI request timed out"
        : error instanceof Error
          ? error.message
          : "Failed to reach CrowdSec LAPI",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeStreamDecisions(payload: unknown): CrowdSecDecision[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const streamPayload = payload as { new?: unknown };
  return normalizeDecisions(streamPayload.new);
}

function normalizeDecisions(payload: unknown): CrowdSecDecision[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === "number" ? item.id : undefined,
      origin: stringField(item.origin),
      scenario: stringField(item.scenario),
      scope: stringField(item.scope),
      type: stringField(item.type),
      value: stringField(item.value),
      duration: stringField(item.duration),
    }));
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
