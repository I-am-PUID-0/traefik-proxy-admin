"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, FileText, RefreshCw, RotateCcw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TraefikLogEntry {
  id: string;
  timestamp?: string | null;
  level?: string | null;
  method?: string | null;
  host?: string | null;
  path?: string | null;
  status?: number | null;
  originStatus?: number | null;
  clientIp?: string | null;
  userAgent?: string | null;
  routerName?: string | null;
  serviceName?: string | null;
  durationMs?: number | null;
  bytesWritten?: number | null;
  raw: string;
}

interface LogsResponse {
  configured: boolean;
  path?: string;
  error?: string;
  entries: TraefikLogEntry[];
}

interface GlobalConfigResponse {
  adminPanelDomain?: string;
  adminPanelPublicUrl?: string;
}

type StatusFilter = "all" | "2xx" | "3xx" | "4xx" | "5xx" | "errors";
type LatencyFilter = "all" | "slow";
type SortOption = "newest" | "oldest" | "slowest" | "status";
type QuickFilterKind = "agent" | "auth" | "client" | "path" | "probe" | "router" | "serverErrors" | "service" | "slow" | "status" | "unmatched404";

interface QuickFilter {
  kind: QuickFilterKind;
  label: string;
  value?: string;
}

const SLOW_REQUEST_MS = 1000;
const PROBE_PATH_PATTERN = /(?:\/\.env|\/\.git|wp-admin|wp-login|phpinfo|cgi-bin|vendor\/phpunit|actuator|server-status)/i;
const COMMON_LOG_MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

function statusVariant(status?: number | null) {
  if (!status) return "secondary" as const;
  if (status >= 500) return "destructive" as const;
  if (status >= 400) return "destructive" as const;
  if (status >= 300) return "secondary" as const;
  return "default" as const;
}

function statusMatches(status: number | null | undefined, filter: StatusFilter) {
  if (filter === "all") return true;
  if (!status) return false;
  if (filter === "errors") return status >= 400;
  const firstDigit = Math.floor(status / 100);
  return filter === `${firstDigit}xx`;
}

function normalizeTimestamp(value?: string | null) {
  if (!value) return "-";
  const common = value.match(/^(\d{1,2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  return common
    ? `${common[3]}-${COMMON_LOG_MONTHS[common[2]] || "01"}-${common[1].padStart(2, "0")}T${common[4]}${common[5]}:${common[6]}`
    : value;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const normalized = normalizeTimestamp(value);
  if (normalized === "-") return normalized;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function timestampValue(value?: string | null) {
  if (!value) return 0;
  const normalized = normalizeTimestamp(value);
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDuration(value?: number | null) {
  return value !== null && value !== undefined ? `${value}ms` : "-";
}

function formatBytes(value?: number | null) {
  if (value === null || value === undefined) return "-";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function percentile(values: number[], percent: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1);
  return sorted[index];
}

function searchable(entry: TraefikLogEntry) {
  return [
    entry.timestamp,
    entry.level,
    entry.method,
    entry.host,
    entry.path,
    entry.status,
    entry.originStatus,
    entry.clientIp,
    entry.userAgent,
    entry.routerName,
    entry.serviceName,
    entry.raw,
  ].filter(Boolean).join(" ").toLowerCase();
}

function clientForJail(value?: string | null) {
  const first = value?.split(",")[0]?.trim();
  return first && first !== "-" ? first : null;
}

function isLoopbackSubject(value: string) {
  const address = value.trim().toLowerCase().split("/")[0];
  return address.startsWith("127.") || address === "::1" || address === "0:0:0:0:0:0:0:1";
}

function hostnameFromUrlLike(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `http://${trimmed}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return trimmed.split("/")[0]?.split(":")[0]?.toLowerCase() || null;
  }
}

function entryHost(entry: TraefikLogEntry) {
  return hostnameFromUrlLike(entry.host);
}

function quickFilterMatches(entry: TraefikLogEntry, filter: QuickFilter | null) {
  if (!filter) return true;

  switch (filter.kind) {
    case "agent":
      return entry.userAgent === filter.value;
    case "auth":
      return entry.status === 401 || entry.status === 403;
    case "client":
      return entry.clientIp === filter.value;
    case "path":
      return entry.path === filter.value;
    case "probe":
      return Boolean(entry.path && PROBE_PATH_PATTERN.test(entry.path));
    case "router":
      return entry.routerName === filter.value;
    case "serverErrors":
      return typeof entry.status === "number" && entry.status >= 500;
    case "service":
      return entry.serviceName === filter.value;
    case "slow":
      return Boolean(entry.durationMs && entry.durationMs >= SLOW_REQUEST_MS);
    case "status":
      return entry.status === Number(filter.value);
    case "unmatched404":
      return entry.status === 404 && !entry.routerName;
    default:
      return true;
  }
}

function topValues(
  entries: TraefikLogEntry[],
  getValue: (entry: TraefikLogEntry) => string | number | null | undefined,
  limit = 3,
) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value = getValue(entry);
    if (value === null || value === undefined || value === "") continue;
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function summarizeEntries(entries: TraefikLogEntry[]) {
  const durations = entries
    .map((entry) => entry.durationMs)
    .filter((duration): duration is number => typeof duration === "number" && Number.isFinite(duration));
  const clientErrors = entries.filter((entry) => typeof entry.status === "number" && entry.status >= 400 && entry.status < 500).length;
  const serverErrors = entries.filter((entry) => typeof entry.status === "number" && entry.status >= 500).length;
  const bytes = entries.reduce((total, entry) => total + (entry.bytesWritten || 0), 0);

  return {
    total: entries.length,
    clientErrors,
    serverErrors,
    errors: clientErrors + serverErrors,
    slowRequests: durations.filter((duration) => duration >= SLOW_REQUEST_MS).length,
    p95Duration: percentile(durations, 95),
    maxDuration: durations.length ? Math.max(...durations) : null,
    bytes,
    topStatuses: topValues(entries, (entry) => entry.status, 4),
    topClients: topValues(entries, (entry) => entry.clientIp, 4),
    topRouters: topValues(entries, (entry) => entry.routerName, 4),
    topServices: topValues(entries, (entry) => entry.serviceName, 4),
    topAgents: topValues(entries, (entry) => entry.userAgent, 4),
    topErrorPaths: topValues(entries.filter((entry) => typeof entry.status === "number" && entry.status >= 400), (entry) => entry.path, 4),
    topServerErrorServices: topValues(entries.filter((entry) => typeof entry.status === "number" && entry.status >= 500), (entry) => entry.serviceName || entry.routerName, 2),
    authFailures: entries.filter((entry) => entry.status === 401 || entry.status === 403).length,
    notFound: entries.filter((entry) => entry.status === 404).length,
    unmatchedRequests: entries.filter((entry) => entry.status === 404 && !entry.routerName).length,
    probePaths: topValues(entries.filter((entry) => entry.path && PROBE_PATH_PATTERN.test(entry.path)), (entry) => entry.path, 3),
  };
}

function MetricTile({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="min-w-0 rounded-md bg-background/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-lg font-semibold">{value}</span>
      </div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function InsightBox({
  title,
  items,
  empty,
  onSelect,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  empty: string;
  onSelect: (item: { label: string; count: number }) => void;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background/30 px-3 py-2">
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelect(item)}
              title={`Show ${item.count} matching log entries for ${item.label}`}
            >
              <span className="truncate font-mono">{item.label}</span>
              <Badge variant="outline" className="shrink-0 font-normal">{item.count}</Badge>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Signals({ onSelect, stats }: { onSelect: (filter: QuickFilter) => void; stats: ReturnType<typeof summarizeEntries> }) {
  const signals: QuickFilter[] = [];

  if (stats.serverErrors > 0) {
    const target = stats.topServerErrorServices[0]?.label;
    signals.push({
      kind: "serverErrors",
      label: target ? `${stats.serverErrors} server errors around ${target}` : `${stats.serverErrors} server errors`,
    });
  }

  if (stats.authFailures > 0) {
    signals.push({ kind: "auth", label: `${stats.authFailures} auth denials` });
  }

  if (stats.unmatchedRequests > 0) {
    signals.push({ kind: "unmatched404", label: `${stats.unmatchedRequests} unmatched 404s` });
  } else if (stats.notFound > 0) {
    signals.push({ kind: "status", label: `${stats.notFound} routed 404s`, value: "404" });
  }

  if (stats.probePaths.length > 0) {
    signals.push({ kind: "probe", label: `probe-looking paths: ${stats.probePaths.map((item) => item.label).join(", ")}` });
  }

  if (stats.slowRequests > 0) {
    signals.push({ kind: "slow", label: `${stats.slowRequests} slow requests, max ${formatDuration(stats.maxDuration)}` });
  }

  if (signals.length === 0) {
    signals.push({ kind: "status", label: "No obvious error, probe, auth, or latency hotspots in the current view.", value: "" });
  }

  return (
    <div className="min-w-0 rounded-md border bg-background/30 px-3 py-2">
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Signals</div>
      <div className="space-y-1.5">
        {signals.map((signal) => (
          <button
            key={signal.label}
            type="button"
            className="block w-full min-w-0 rounded-sm bg-secondary px-2 py-1 text-left text-xs text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70"
            disabled={!signal.value && signal.kind === "status"}
            onClick={() => onSelect(signal)}
          >
            <span className="block truncate" title={signal.label}>{signal.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TraefikLogsCard() {
  const [payload, setPayload] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [routerFilter, setRouterFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [latencyFilter, setLatencyFilter] = useState<LatencyFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  const [limit, setLimit] = useState("250");
  const [jailingClient, setJailingClient] = useState<string | null>(null);
  const [jailMessage, setJailMessage] = useState<string | null>(null);
  const [adminHosts, setAdminHosts] = useState<Set<string>>(() => new Set());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/traefik/logs?limit=${encodeURIComponent(limit)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data.error === "string"
          ? data.error
          : `Log API returned HTTP ${response.status}`;
        setPayload({ configured: true, entries: [], error: message });
        return;
      }
      if (!data || typeof data.configured !== "boolean" || !Array.isArray(data.entries)) {
        setPayload({ configured: true, entries: [], error: "Invalid log API response" });
        return;
      }
      setPayload(data);
    } catch (error) {
      setPayload({ configured: true, entries: [], error: error instanceof Error ? error.message : "Failed to load logs" });
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const hosts = new Set<string>();
    const currentHost = hostnameFromUrlLike(window.location.host);
    if (currentHost) hosts.add(currentHost);

    let cancelled = false;
    fetch("/api/config")
      .then((response) => response.ok ? response.json() as Promise<GlobalConfigResponse> : null)
      .then((config) => {
        if (cancelled) return;
        const nextHosts = new Set(hosts);
        const internalHost = hostnameFromUrlLike(config?.adminPanelDomain);
        const publicHost = hostnameFromUrlLike(config?.adminPanelPublicUrl);
        if (internalHost) nextHosts.add(internalHost);
        if (publicHost) nextHosts.add(publicHost);
        setAdminHosts(nextHosts);
      })
      .catch(() => {
        if (!cancelled) setAdminHosts(hosts);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(fetchLogs, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  const entries = useMemo(() => payload?.entries || [], [payload]);

  const methods = useMemo(() => {
    const values = new Set(entries.map((entry) => entry.method).filter(Boolean) as string[]);
    return Array.from(values).sort();
  }, [entries]);

  const routers = useMemo(() => {
    const values = new Set(entries.map((entry) => entry.routerName).filter(Boolean) as string[]);
    return Array.from(values).sort();
  }, [entries]);

  const services = useMemo(() => {
    const values = new Set(entries.map((entry) => entry.serviceName).filter(Boolean) as string[]);
    return Array.from(values).sort();
  }, [entries]);

  const loadedStats = useMemo(() => summarizeEntries(entries), [entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (query && !searchable(entry).includes(query)) return false;
      if (!statusMatches(entry.status, statusFilter)) return false;
      if (methodFilter !== "all" && entry.method !== methodFilter) return false;
      if (routerFilter !== "all" && entry.routerName !== routerFilter) return false;
      if (serviceFilter !== "all" && entry.serviceName !== serviceFilter) return false;
      if (latencyFilter === "slow" && (!entry.durationMs || entry.durationMs < SLOW_REQUEST_MS)) return false;
      if (!quickFilterMatches(entry, quickFilter)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === "oldest") return timestampValue(a.timestamp) - timestampValue(b.timestamp);
      if (sortOption === "slowest") return (b.durationMs || -1) - (a.durationMs || -1);
      if (sortOption === "status") return (b.status || -1) - (a.status || -1);
      return timestampValue(b.timestamp) - timestampValue(a.timestamp);
    });
  }, [entries, latencyFilter, methodFilter, quickFilter, routerFilter, search, serviceFilter, sortOption, statusFilter]);

  const visibleStats = useMemo(() => summarizeEntries(filteredEntries), [filteredEntries]);

  const filtersActive = Boolean(
    search.trim()
    || statusFilter !== "all"
    || methodFilter !== "all"
    || routerFilter !== "all"
    || serviceFilter !== "all"
    || latencyFilter !== "all"
    || sortOption !== "newest"
    || quickFilter !== null,
  );

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setMethodFilter("all");
    setRouterFilter("all");
    setServiceFilter("all");
    setLatencyFilter("all");
    setSortOption("newest");
    setQuickFilter(null);
  };

  const focusQuickFilter = (filter: QuickFilter) => {
    setSearch("");
    setStatusFilter("all");
    setMethodFilter("all");
    setRouterFilter("all");
    setServiceFilter("all");
    setLatencyFilter("all");
    setSortOption("newest");
    setQuickFilter(filter);
  };

  const jailClient = async (entry: TraefikLogEntry) => {
    const client = clientForJail(entry.clientIp);
    if (!client) return;
    if (isLoopbackSubject(client)) {
      setJailMessage("Loopback clients cannot be jailed from log quick actions. Use Native IP Jail manual entry if you really need to block local proxy traffic.");
      return;
    }

    const host = entryHost(entry);
    if (host && adminHosts.has(host)) {
      const confirmed = window.confirm(
        `This log entry is for the TPA admin host (${host}). Jailing ${client} could block your current browser from proxied access if the admin-host exemption is removed or misconfigured. Continue?`,
      );
      if (!confirmed) return;
    }

    setJailingClient(client);
    setJailMessage(null);
    try {
      const response = await fetch("/api/security/ip-jail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: client,
          reason: "Blocked from Traefik access logs",
          source: "access_log",
          evidence: [
            entry.status ? `status ${entry.status}` : null,
            entry.method,
            entry.host,
            entry.path,
            entry.userAgent,
          ].filter(Boolean).join(" "),
          expiresInMinutes: 1440,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setJailMessage(`${client} jailed for 24 hours. Traefik will enforce it after the provider config refreshes.`);
      window.dispatchEvent(new Event("tpa-ip-jail-updated"));
    } catch (error) {
      setJailMessage(error instanceof Error ? error.message : "Failed to jail client");
    } finally {
      setJailingClient(null);
    }
  };

  const selectTriggerClassName = "w-full min-w-0";
  const selectControlClassName = "min-w-36 flex-[1_1_9rem] xl:flex-none";
  const logToolsAvailable = payload?.configured === true && !payload.error;

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Traefik Access Logs
            </CardTitle>
            <CardDescription>Read-only tail of the configured Traefik access log with sensitive query values redacted.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={autoRefresh ? "default" : "outline"} size="sm" onClick={() => setAutoRefresh((value) => !value)}>
              Live refresh
            </Button>
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {payload && !payload.configured && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Set <code>TRAEFIK_ACCESS_LOG_PATH</code> to enable the log viewer. Mount the Traefik access log file into the TPA container as read-only.</p>
            </div>
          </div>
        )}

        {logToolsAvailable && payload?.path && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{loadedStats.total} loaded</Badge>
            <Badge variant="outline">{filteredEntries.length} visible</Badge>
            <span className="break-all font-mono">{payload.path}</span>
          </div>
        )}

        {payload?.error && <p className="text-sm text-amber-700 dark:text-amber-300">{payload.error}</p>}
        {jailMessage && (
          <div className="rounded-md border bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            {jailMessage}
          </div>
        )}

        {logToolsAvailable && loadedStats.total > 0 && (
          <div className="rounded-md border bg-muted/10 p-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <MetricTile label="Visible" value={visibleStats.total} detail={`of ${loadedStats.total} loaded`} />
              <MetricTile label="Errors" value={visibleStats.errors} detail={`${visibleStats.serverErrors} server / ${visibleStats.clientErrors} client`} />
              <MetricTile label="Slow" value={visibleStats.slowRequests} detail={`at ${SLOW_REQUEST_MS}ms or more`} />
              <MetricTile label="Latency" value={formatDuration(visibleStats.p95Duration)} detail={`p95, max ${formatDuration(visibleStats.maxDuration)}`} />
              <MetricTile label="Size" value={formatBytes(visibleStats.bytes)} detail="visible responses" />
            </div>
            <div className="mt-3 grid gap-2 border-t pt-3 lg:grid-cols-2 2xl:grid-cols-3">
              <Signals stats={visibleStats} onSelect={focusQuickFilter} />
              <InsightBox title="Statuses" items={visibleStats.topStatuses} empty="No statuses in view." onSelect={(item) => focusQuickFilter({ kind: "status", label: `status ${item.label}`, value: item.label })} />
              <InsightBox title="Clients" items={visibleStats.topClients} empty="No client IPs in view." onSelect={(item) => focusQuickFilter({ kind: "client", label: `client ${item.label}`, value: item.label })} />
              <InsightBox title="Error Paths" items={visibleStats.topErrorPaths} empty="No error paths in view." onSelect={(item) => focusQuickFilter({ kind: "path", label: `path ${item.label}`, value: item.label })} />
              <InsightBox title="Routers" items={visibleStats.topRouters} empty="No routers in view." onSelect={(item) => focusQuickFilter({ kind: "router", label: `router ${item.label}`, value: item.label })} />
              <InsightBox title="Services" items={visibleStats.topServices} empty="No services in view." onSelect={(item) => focusQuickFilter({ kind: "service", label: `service ${item.label}`, value: item.label })} />
              <InsightBox title="Agents" items={visibleStats.topAgents} empty="No user agents in view." onSelect={(item) => focusQuickFilter({ kind: "agent", label: `agent ${item.label}`, value: item.label })} />
            </div>
          </div>
        )}

        {logToolsAvailable && (
          <>
            <div className="rounded-md border bg-muted/10 p-2">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search host, path, IP, router, service, agent, raw line..." value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="2xx">2xx</SelectItem>
                    <SelectItem value="3xx">3xx</SelectItem>
                    <SelectItem value="4xx">4xx</SelectItem>
                    <SelectItem value="5xx">5xx</SelectItem>
                    <SelectItem value="errors">Errors</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={methodFilter} onValueChange={setMethodFilter}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    {methods.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={limit} onValueChange={setLimit}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="100">Last 100</SelectItem>
                    <SelectItem value="250">Last 250</SelectItem>
                    <SelectItem value="500">Last 500</SelectItem>
                    <SelectItem value="1000">Last 1000</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={routerFilter} onValueChange={setRouterFilter}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="all">All routers</SelectItem>
                    {routers.map((router) => <SelectItem key={router} value={router}>{router}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="all">All services</SelectItem>
                    {services.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={latencyFilter} onValueChange={(value) => setLatencyFilter(value as LatencyFilter)}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="all">All latency</SelectItem>
                    <SelectItem value="slow">Slow only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                  <div className={selectControlClassName}>
                  <SelectTrigger className={selectTriggerClassName}><SelectValue /></SelectTrigger>
                  </div>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="slowest">Slowest first</SelectItem>
                    <SelectItem value="status">Highest status</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="min-w-32 flex-[1_1_8rem] xl:flex-none" variant="outline" size="sm" onClick={resetFilters} disabled={!filtersActive}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                </div>
                {quickFilter && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                    <span>Focused on</span>
                    <Badge variant="secondary" className="max-w-full font-normal">
                      <span className="truncate" title={quickFilter.label}>{quickFilter.label}</span>
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setQuickFilter(null)}>
                      Clear focus
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-128 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Agent</TableHead>
                    <TableHead>Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</TableCell>
                      <TableCell><Badge variant={statusVariant(entry.status)}>{entry.status || "-"}</Badge></TableCell>
                      <TableCell className="max-w-md wrap-break-word text-xs">
                        <span className="font-semibold">{entry.method || "-"}</span>{" "}
                        <span className="font-mono">{entry.host || ""}{entry.path || ""}</span>
                      </TableCell>
                      <TableCell className="max-w-xs break-all text-xs text-muted-foreground">
                        {entry.routerName || "-"}
                        {entry.serviceName && <span className="block">{entry.serviceName}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.clientIp || "-"}
                        {entry.bytesWritten !== null && entry.bytesWritten !== undefined && <span className="block text-muted-foreground">{formatBytes(entry.bytesWritten)}</span>}
                        {clientForJail(entry.clientIp) && !isLoopbackSubject(clientForJail(entry.clientIp) || "") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 px-2 text-xs"
                            onClick={() => jailClient(entry)}
                            disabled={jailingClient === clientForJail(entry.clientIp)}
                            title="Add this client to the native IP jail for 24 hours"
                          >
                            <Ban className="mr-1 h-3 w-3" />
                            Jail 24h
                          </Button>
                        )}
                        {clientForJail(entry.clientIp) && isLoopbackSubject(clientForJail(entry.clientIp) || "") && (
                          <Badge variant="outline" className="mt-2 block w-fit font-normal" title="Loopback clients require manual confirmation in Native IP Jail">
                            Loopback
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground 2xl:table-cell" title={entry.userAgent || undefined}>{entry.userAgent || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDuration(entry.durationMs)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        No log entries match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
