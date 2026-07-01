"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Router, Server, Shield, PlugZap, GitCompare, Search, Download } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CrowdSecCard } from "@/components/crowdsec-card";
import { IpJailCard } from "@/components/ip-jail-card";
import { TraefikApiStatusCard } from "@/components/traefik-api-status-card";
import { TraefikLogsCard } from "@/components/traefik-logs-card";
import type { ServiceFormData } from "@/hooks/use-service-form";

type ResourceType = "routers" | "services" | "middlewares" | "entrypoints";
type SourceFilter = "all" | "tpa" | "external";
type StatusFilter = "all" | "healthy" | "problem";
type SortDirection = "asc" | "desc";
type ResourceSortKey = "name" | "status" | "source" | "details";
type DriftSortKey = "name" | "kind" | "status" | "issue";
type HealthSortKey = "name" | "target" | "status" | "latency";

type SortState<T extends string> = { key: T; direction: SortDirection };

type ResourceItem = {
  name: string;
  provider?: string;
  status?: string;
  type?: string;
  rule?: string;
  service?: string;
  address?: string;
  entryPoints?: string[];
  middlewares?: string[];
};

type DriftItem = {
  name: string;
  expected: boolean;
  live: boolean;
  status?: string;
  issue?: "missing" | "extra" | "unhealthy" | null;
};

type HealthCheck = {
  serviceId: string;
  name: string;
  enabled: boolean;
  target: string;
  reachable: boolean;
  durationMs: number;
  error?: string;
};

type ImportPreview = {
  configured?: boolean;
  error?: string;
  router?: ResourceItem;
  service?: { name?: string; provider?: string };
  draft?: Partial<ServiceFormData>;
  warnings?: string[];
  unsupported?: boolean;
};

const resourceConfig: Record<ResourceType, { label: string; icon: React.ReactNode; endpoint: string; key: string }> = {
  routers: { label: "Routers", icon: <Router className="h-4 w-4" />, endpoint: "/api/traefik/routers", key: "routers" },
  services: { label: "Services", icon: <Server className="h-4 w-4" />, endpoint: "/api/traefik/services", key: "services" },
  middlewares: { label: "Middlewares", icon: <Shield className="h-4 w-4" />, endpoint: "/api/traefik/middlewares", key: "middlewares" },
  entrypoints: { label: "Entrypoints", icon: <PlugZap className="h-4 w-4" />, endpoint: "/api/traefik/entrypoints", key: "entrypoints" },
};

function statusVariant(status?: string) {
  if (!status) return "secondary" as const;
  if (["enabled", "reachable", "up"].includes(status.toLowerCase())) return "default" as const;
  if (["missing", "unreachable", "disabled", "down"].includes(status.toLowerCase())) return "destructive" as const;
  return "secondary" as const;
}

function resourceBaseName(name: string): string {
  return name.split("@")[0] || name;
}

function resourceProvider(item: ResourceItem): string {
  return item.provider || item.name?.split("@")[1] || item.type || item.address || "unknown";
}

function isProblemStatus(status?: string): boolean {
  if (!status) return false;
  return ["missing", "unreachable", "disabled", "down"].includes(status.toLowerCase());
}

function searchableText(item: ResourceItem): string {
  return [
    item.name,
    item.provider,
    item.status,
    item.type,
    item.rule,
    item.service,
    item.address,
    item.entryPoints?.join(" "),
    item.middlewares?.join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function sourceLabel(type: ResourceType, item: ResourceItem, tpaNames: Set<string>) {
  const baseName = resourceBaseName(item.name);
  if ((type === "routers" || type === "services") && tpaNames.has(baseName)) {
    return "TPA";
  }
  return resourceProvider(item);
}

function draftHostnames(draft?: Partial<ServiceFormData>): string {
  if (!draft?.customHostnames) return "-";
  try {
    const parsed = JSON.parse(String(draft.customHostnames));
    return Array.isArray(parsed) && parsed.length ? parsed.join(", ") : "-";
  } catch {
    return String(draft.customHostnames);
  }
}

function resourceDetails(item: ResourceItem): string {
  return item.rule || item.service || item.entryPoints?.join(", ") || item.address || "-";
}

function compareText(a: string | undefined | null, b: string | undefined | null): number {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function applyDirection(value: number, direction: SortDirection): number {
  return direction === "asc" ? value : -value;
}

function toggleSort<T extends string>(current: SortState<T>, key: T): SortState<T> {
  return current.key === key
    ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
    : { key, direction: "asc" };
}

function SortIcon<T extends string>({ sort, sortKey }: { sort: SortState<T>; sortKey: T }) {
  if (sort.key !== sortKey) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
  return sort.direction === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
    : <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ipPortSortValue(target: string): number | null {
  const match = target.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?/);
  if (!match) return null;
  const ipValue = match[1].split(".").reduce((total, octet) => (total * 256) + Number(octet), 0);
  return (ipValue * 65536) + Number(match[2] || 0);
}

function compareTargets(a: string, b: string): number {
  const aNumeric = ipPortSortValue(a);
  const bNumeric = ipPortSortValue(b);
  if (aNumeric !== null && bNumeric !== null) return aNumeric - bNumeric;
  if (aNumeric !== null) return -1;
  if (bNumeric !== null) return 1;
  return compareText(a, b);
}

function SortHeader<T extends string>({ label, sort, sortKey, onSort, className }: { label: string; sort: SortState<T>; sortKey: T; onSort: (key: T) => void; className?: string }) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left font-medium hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <SortIcon sort={sort} sortKey={sortKey} />
      </button>
    </TableHead>
  );
}

export default function TraefikResourcesPage() {
  const [activeType, setActiveType] = useState<ResourceType>("routers");
  const [resources, setResources] = useState<Record<ResourceType, ResourceItem[]>>({
    routers: [],
    services: [],
    middlewares: [],
    entrypoints: [],
  });
  const [drift, setDrift] = useState<{ configured?: boolean; error?: string; routers: DriftItem[]; services: DriftItem[]; summary?: { expected: number; missing: number; extra: number; unhealthy: number } } | null>(null);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [resourceSort, setResourceSort] = useState<SortState<ResourceSortKey>>({ key: "name", direction: "asc" });
  const [driftSort, setDriftSort] = useState<SortState<DriftSortKey>>({ key: "name", direction: "asc" });
  const [healthSort, setHealthSort] = useState<SortState<HealthSortKey>>({ key: "name", direction: "asc" });
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importingRouter, setImportingRouter] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const entries = await Promise.all(
        (Object.keys(resourceConfig) as ResourceType[]).map(async (type) => {
          const config = resourceConfig[type];
          const response = await fetch(config.endpoint);
          const data = await response.json().catch(() => ({}));
          return [type, Array.isArray(data[config.key]) ? data[config.key] : []] as const;
        }),
      );

      setResources(Object.fromEntries(entries) as Record<ResourceType, ResourceItem[]>);

      const driftResponse = await fetch("/api/traefik/drift");
      const driftData = await driftResponse.json().catch(() => null);
      setDrift(driftData);
    } catch (error) {
      console.error("Error fetching Traefik resources:", error);
      setError("Failed to fetch Traefik resources");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const response = await fetch("/api/services/health");
      const data = await response.json().catch(() => ({}));
      setHealthChecks(Array.isArray(data.checks) ? data.checks : []);
    } catch (error) {
      console.error("Error fetching service health:", error);
      setHealthChecks([]);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const previewImport = useCallback(async (item: ResourceItem) => {
    setImportingRouter(item.name);
    try {
      const response = await fetch("/api/traefik/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routerName: item.name }),
      });
      const data = await response.json().catch(() => ({}));
      setImportPreview(response.ok ? data : { error: data.error || "Failed to preview Traefik import", router: item });
    } catch (error) {
      console.error("Error previewing Traefik import:", error);
      setImportPreview({ error: "Failed to preview Traefik import", router: item });
    } finally {
      setImportingRouter(null);
    }
  }, []);

  const useImportDraft = useCallback(() => {
    if (!importPreview?.draft) return;
    const draftJson = JSON.stringify(importPreview.draft);
    window.sessionStorage.setItem("tpa-traefik-import-draft", draftJson);
    window.localStorage.removeItem("tpa-traefik-import-draft");
    setImportPreview(null);
    window.location.assign(`/services/add?traefikImportDraft=1&draft=${encodeURIComponent(draftJson)}`);
  }, [importPreview]);

  useEffect(() => {
    fetchResources();
    fetchHealth();
  }, [fetchResources, fetchHealth]);

  useEffect(() => {
    setProviderFilter("all");
    setSourceFilter("all");
    setStatusFilter("all");
    setShowAll(false);
  }, [activeType]);

  const tpaNamesByType = useMemo(() => ({
    routers: new Set((drift?.routers || []).filter((item) => item.expected).map((item) => item.name)),
    services: new Set((drift?.services || []).filter((item) => item.expected).map((item) => item.name)),
  }), [drift]);

  const activeResources = resources[activeType];
  const activeTpaNames = useMemo(() => {
    if (activeType === "routers") return tpaNamesByType.routers;
    if (activeType === "services") return tpaNamesByType.services;
    return new Set<string>();
  }, [activeType, tpaNamesByType]);
  const query = search.trim().toLowerCase();

  const providerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of activeResources) {
      const provider = resourceProvider(item);
      counts.set(provider, (counts.get(provider) || 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [activeResources]);

  const resourceSourceSummary = useMemo(() => {
    const tpa = activeResources.filter((item) => activeTpaNames.has(resourceBaseName(item.name))).length;
    return { tpa, external: activeResources.length - tpa };
  }, [activeResources, activeTpaNames]);

  const filteredResources = useMemo(() => activeResources.filter((item) => {
    const provider = resourceProvider(item);
    const isTpa = activeTpaNames.has(resourceBaseName(item.name));

    if (query && !searchableText(item).includes(query)) return false;
    if (providerFilter !== "all" && provider !== providerFilter) return false;
    if (sourceFilter === "tpa" && !isTpa) return false;
    if (sourceFilter === "external" && isTpa) return false;
    if (statusFilter === "healthy" && isProblemStatus(item.status)) return false;
    if (statusFilter === "problem" && !isProblemStatus(item.status)) return false;

    return true;
  }), [activeResources, activeTpaNames, providerFilter, query, sourceFilter, statusFilter]);

  const sortedResources = useMemo(() => {
    return [...filteredResources].sort((a, b) => {
      let comparison = 0;
      if (resourceSort.key === "name") comparison = compareText(a.name, b.name);
      if (resourceSort.key === "status") comparison = compareText(a.status || "unknown", b.status || "unknown");
      if (resourceSort.key === "source") comparison = compareText(sourceLabel(activeType, a, activeTpaNames), sourceLabel(activeType, b, activeTpaNames));
      if (resourceSort.key === "details") comparison = compareText(resourceDetails(a), resourceDetails(b));
      return applyDirection(comparison, resourceSort.direction);
    });
  }, [activeTpaNames, activeType, filteredResources, resourceSort]);

  const visibleResources = showAll ? sortedResources : sortedResources.slice(0, 100);
  const hiddenResourceCount = sortedResources.length - visibleResources.length;

  const driftIssues = useMemo(() => [
    ...(drift?.routers || []).map((item) => ({ ...item, kind: "Router" })),
    ...(drift?.services || []).map((item) => ({ ...item, kind: "Service" })),
  ].filter((item) => item.issue), [drift]);

  const sortedDriftIssues = useMemo(() => {
    return [...driftIssues].sort((a, b) => {
      let comparison = 0;
      if (driftSort.key === "name") comparison = compareText(a.name, b.name);
      if (driftSort.key === "kind") comparison = compareText(a.kind, b.kind);
      if (driftSort.key === "status") comparison = compareText(a.status || "unknown", b.status || "unknown");
      if (driftSort.key === "issue") comparison = compareText(a.issue || "", b.issue || "");
      return applyDirection(comparison, driftSort.direction);
    });
  }, [driftIssues, driftSort]);

  const sortedHealthChecks = useMemo(() => {
    return [...healthChecks].sort((a, b) => {
      let comparison = 0;
      if (healthSort.key === "name") comparison = compareText(a.name, b.name);
      if (healthSort.key === "target") comparison = compareTargets(a.target, b.target);
      if (healthSort.key === "status") comparison = compareText(a.reachable ? "reachable" : "failed", b.reachable ? "reachable" : "failed");
      if (healthSort.key === "latency") comparison = (a.reachable ? a.durationMs : Number.MAX_SAFE_INTEGER) - (b.reachable ? b.durationMs : Number.MAX_SAFE_INTEGER);
      return applyDirection(comparison, healthSort.direction);
    });
  }, [healthChecks, healthSort]);

  const healthSummary = useMemo(() => ({
    total: healthChecks.length,
    reachable: healthChecks.filter((check) => check.reachable).length,
    failed: healthChecks.filter((check) => !check.reachable).length,
  }), [healthChecks]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Traefik Live</h1>
            <p className="text-muted-foreground">Inspect live Traefik resources, config drift, and service target health</p>
          </div>
          <Button variant="outline" onClick={() => { fetchResources(); fetchHealth(); }} disabled={loading || healthLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading || healthLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <TraefikApiStatusCard />

        <TraefikLogsCard />

        <CrowdSecCard />

        <IpJailCard />

        {error && <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>}

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Expected</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{drift?.summary?.expected ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Missing</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold text-amber-600">{drift?.summary?.missing ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">External</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <span className="text-lg font-bold text-blue-600">{drift?.summary?.extra ?? 0}</span>
              <span className="text-muted-foreground"> unmanaged live resources</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Targets</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <span className="text-lg font-bold text-green-600">{healthSummary.reachable}</span>
              <span className="text-muted-foreground"> / {healthSummary.total} reachable</span>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><GitCompare className="h-5 w-5" /> Config Drift</CardTitle>
              <CardDescription>Expected TPA-generated routers/services compared with live Traefik resources</CardDescription>
            </div>
            <Badge variant={driftIssues.length ? "destructive" : "default"}>{driftIssues.length} issues</Badge>
          </CardHeader>
          <CardContent>
            {drift?.error ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{drift.error}</p>
            ) : driftIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No TPA-generated router or service drift detected.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <SortHeader label="Name" sort={driftSort} sortKey="name" onSort={(key) => setDriftSort((current) => toggleSort(current, key))} />
                      <SortHeader label="Kind" sort={driftSort} sortKey="kind" onSort={(key) => setDriftSort((current) => toggleSort(current, key))} />
                      <SortHeader label="Status" sort={driftSort} sortKey="status" onSort={(key) => setDriftSort((current) => toggleSort(current, key))} />
                      <SortHeader label="Issue" sort={driftSort} sortKey="issue" onSort={(key) => setDriftSort((current) => toggleSort(current, key))} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDriftIssues.map((item) => (
                      <TableRow key={`${item.kind}-${item.name}`}>
                        <TableCell className="font-mono text-xs">{item.name}</TableCell>
                        <TableCell>{item.kind}</TableCell>
                        <TableCell><Badge variant={statusVariant(item.status)}>{item.status || "unknown"}</Badge></TableCell>
                        <TableCell>{item.issue}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Resources</CardTitle>
            <CardDescription>Filter live Traefik resources by type, provider, source, status, or text</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(resourceConfig) as ResourceType[]).map((type) => (
                <Button key={type} variant={activeType === type ? "default" : "outline"} size="sm" onClick={() => setActiveType(type)}>
                  {resourceConfig[type].icon}
                  <span className="ml-2">{resourceConfig[type].label}</span>
                  <Badge variant="secondary" className="ml-2">{resources[type].length}</Badge>
                </Button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_12rem_12rem_12rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search name, host rule, service, middleware..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providerCounts.map(([provider, count]) => (
                    <SelectItem key={provider} value={provider}>{provider} ({count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)} disabled={activeType !== "routers" && activeType !== "services"}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="tpa">TPA managed</SelectItem>
                  <SelectItem value="external">External only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="healthy">Healthy/other</SelectItem>
                  <SelectItem value="problem">Problems only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredResources.length} of {activeResources.length} {resourceConfig[activeType].label.toLowerCase()}</span>
              {(activeType === "routers" || activeType === "services") && (
                <>
<button type="button" className="appearance-none border-0 bg-transparent p-0" onClick={() => { setSourceFilter(sourceFilter === "tpa" ? "all" : "tpa"); setShowAll(false); }}>
                    <Badge variant={sourceFilter === "tpa" ? "default" : "secondary"}>TPA {resourceSourceSummary.tpa}</Badge>
                  </button>
                  <button type="button" className="appearance-none border-0 bg-transparent p-0" onClick={() => { setSourceFilter(sourceFilter === "external" ? "all" : "external"); setShowAll(false); }}>
                    <Badge variant={sourceFilter === "external" ? "default" : "outline"}>External {resourceSourceSummary.external}</Badge>
                  </button>
                </>
              )}
              {providerCounts.slice(0, 6).map(([provider, count]) => (
                <button key={provider} type="button" className="appearance-none border-0 bg-transparent p-0" onClick={() => { setProviderFilter(providerFilter === provider ? "all" : provider); setShowAll(false); }}>
                  <Badge variant={providerFilter === provider ? "default" : "outline"}>{provider} {count}</Badge>
                </button>
              ))}
            </div>

            <div className="max-h-152 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <SortHeader label="Name" sort={resourceSort} sortKey="name" onSort={(key) => setResourceSort((current) => toggleSort(current, key))} />
                    <SortHeader label="Status" sort={resourceSort} sortKey="status" onSort={(key) => setResourceSort((current) => toggleSort(current, key))} />
                    <SortHeader label="Source" sort={resourceSort} sortKey="source" onSort={(key) => setResourceSort((current) => toggleSort(current, key))} />
                    <SortHeader label="Details" sort={resourceSort} sortKey="details" onSort={(key) => setResourceSort((current) => toggleSort(current, key))} />
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleResources.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="max-w-[24rem] break-all font-mono text-xs">{item.name}</TableCell>
                      <TableCell><Badge variant={statusVariant(item.status)}>{item.status || "unknown"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={sourceLabel(activeType, item, activeTpaNames) === "TPA" ? "default" : "outline"}>{sourceLabel(activeType, item, activeTpaNames)}</Badge>
                          {item.type && <Badge variant="secondary">{item.type}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-160 wrap-break-word text-xs text-muted-foreground">{resourceDetails(item)}</TableCell>
                      <TableCell className="text-right">
                        {activeType === "routers" && sourceLabel(activeType, item, activeTpaNames) !== "TPA" && resourceProvider(item) !== "internal" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => previewImport(item)}
                            disabled={importingRouter === item.name}
                          >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            {importingRouter === item.name ? "Previewing" : "Import"}
                          </Button>
                        )}
                        {activeType === "routers" && resourceProvider(item) === "internal" && (
                          <Badge variant="secondary">Not importable</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleResources.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No resources match the current filters.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {hiddenResourceCount > 0 && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setShowAll(true)}>Show all {filteredResources.length} resources</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Service Target Health</CardTitle>
              <CardDescription>TCP reachability checks from the app container to configured service targets</CardDescription>
            </div>
            <Badge variant={healthSummary.failed ? "destructive" : "default"}>{healthSummary.failed} failed</Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <SortHeader label="Service" sort={healthSort} sortKey="name" onSort={(key) => setHealthSort((current) => toggleSort(current, key))} />
                    <SortHeader label="Target" sort={healthSort} sortKey="target" onSort={(key) => setHealthSort((current) => toggleSort(current, key))} />
                    <SortHeader label="Status" sort={healthSort} sortKey="status" onSort={(key) => setHealthSort((current) => toggleSort(current, key))} />
                    <SortHeader label="Latency" sort={healthSort} sortKey="latency" onSort={(key) => setHealthSort((current) => toggleSort(current, key))} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHealthChecks.map((check) => (
                    <TableRow key={check.serviceId}>
                      <TableCell>{check.name}</TableCell>
                      <TableCell className="font-mono text-xs">{check.target}</TableCell>
                      <TableCell><Badge variant={check.reachable ? "default" : "destructive"}>{check.reachable ? "Reachable" : "Failed"}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{check.reachable ? `${check.durationMs}ms` : check.error}</TableCell>
                    </TableRow>
                  ))}
                  {healthChecks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No service target checks available.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(importPreview)} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Traefik Router</DialogTitle>
            <DialogDescription>Review the detected service draft before creating a TPA-managed service.</DialogDescription>
          </DialogHeader>

          {importPreview?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {importPreview.error}
            </div>
          ) : importPreview?.draft ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Service name</p>
                  <p className="font-medium">{importPreview.draft.name || "-"}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="font-mono text-sm">{importPreview.draft.isHttps ? "https" : "http"}://{importPreview.draft.targetIp}:{importPreview.draft.targetPort}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Hostnames</p>
                  <p className="font-mono text-sm">{draftHostnames(importPreview.draft)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Entrypoint</p>
                  <p className="font-mono text-sm">{importPreview.draft.entrypoint || "default"}</p>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Middleware references</p>
                <p className="font-mono text-sm">{importPreview.draft.middlewares || "none"}</p>
              </div>

              {importPreview.warnings && importPreview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="mb-2 font-medium text-amber-700 dark:text-amber-300">Review before saving</p>
                  <ul className="list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-200">
                    {importPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-2 text-xs text-muted-foreground">Draft payload</p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(importPreview.draft, null, 2)}</pre>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>Cancel</Button>
            <Button onClick={useImportDraft} disabled={!importPreview?.draft}>Use as draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
