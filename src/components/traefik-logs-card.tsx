"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, RefreshCw, Search } from "lucide-react";

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
  routerName?: string | null;
  serviceName?: string | null;
  durationMs?: number | null;
  raw: string;
}

interface LogsResponse {
  configured: boolean;
  path?: string;
  error?: string;
  entries: TraefikLogEntry[];
}

type StatusFilter = "all" | "2xx" | "3xx" | "4xx" | "5xx" | "errors";

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

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
    entry.routerName,
    entry.serviceName,
    entry.raw,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function TraefikLogsCard() {
  const [payload, setPayload] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [limit, setLimit] = useState("250");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/traefik/logs?limit=${encodeURIComponent(limit)}`);
      const data = await response.json().catch(() => ({ configured: false, entries: [], error: "Invalid response" }));
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
    if (!autoRefresh) return;
    const timer = window.setInterval(fetchLogs, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  const methods = useMemo(() => {
    const values = new Set((payload?.entries || []).map((entry) => entry.method).filter(Boolean) as string[]);
    return Array.from(values).sort();
  }, [payload]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (payload?.entries || []).filter((entry) => {
      if (query && !searchable(entry).includes(query)) return false;
      if (!statusMatches(entry.status, statusFilter)) return false;
      if (methodFilter !== "all" && entry.method !== methodFilter) return false;
      return true;
    });
  }, [methodFilter, payload, search, statusFilter]);

  return (
    <Card>
      <CardHeader className="gap-3 xl:flex-row xl:items-center xl:justify-between">
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
      </CardHeader>
      <CardContent className="space-y-4">
        {!payload?.configured && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Set <code>TRAEFIK_ACCESS_LOG_PATH</code> to enable the log viewer. Mount the Traefik access log file into the TPA container as read-only.</p>
            </div>
          </div>
        )}

        {payload?.configured && payload.path && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{payload.entries.length} loaded</Badge>
            <span className="break-all font-mono">{payload.path}</span>
          </div>
        )}

        {payload?.error && <p className="text-sm text-amber-700 dark:text-amber-300">{payload.error}</p>}

        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_9rem_9rem_9rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search host, path, IP, router, service, raw line..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {methods.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="100">Last 100</SelectItem>
              <SelectItem value="250">Last 250</SelectItem>
              <SelectItem value="500">Last 500</SelectItem>
              <SelectItem value="1000">Last 1000</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[32rem] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</TableCell>
                  <TableCell><Badge variant={statusVariant(entry.status)}>{entry.status || "-"}</Badge></TableCell>
                  <TableCell className="max-w-[28rem] break-words text-xs">
                    <span className="font-semibold">{entry.method || "-"}</span>{" "}
                    <span className="font-mono">{entry.host || ""}{entry.path || ""}</span>
                  </TableCell>
                  <TableCell className="max-w-[20rem] break-all text-xs text-muted-foreground">
                    {entry.routerName || "-"}
                    {entry.serviceName && <span className="block">{entry.serviceName}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.clientIp || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.durationMs !== null && entry.durationMs !== undefined ? `${entry.durationMs}ms` : "-"}</TableCell>
                </TableRow>
              ))}
              {filteredEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {payload?.configured ? "No log entries match the current filters." : "Log viewer is not configured."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
