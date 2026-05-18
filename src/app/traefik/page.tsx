"use client";

import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Router, Server, Shield, PlugZap, GitCompare } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TraefikApiStatusCard } from "@/components/traefik-api-status-card";

type ResourceType = "routers" | "services" | "middlewares" | "entrypoints";

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

const resourceConfig: Record<ResourceType, { label: string; icon: React.ReactNode; endpoint: string; key: string }> = {
  routers: { label: "Routers", icon: <Router className="h-4 w-4" />, endpoint: "/api/traefik/routers", key: "routers" },
  services: { label: "Services", icon: <Server className="h-4 w-4" />, endpoint: "/api/traefik/services", key: "services" },
  middlewares: { label: "Middlewares", icon: <Shield className="h-4 w-4" />, endpoint: "/api/traefik/middlewares", key: "middlewares" },
  entrypoints: { label: "Entrypoints", icon: <PlugZap className="h-4 w-4" />, endpoint: "/api/traefik/entrypoints", key: "entrypoints" },
};

function firstHostFromRule(rule?: string): string {
  return rule?.match(/Host\(`([^`]+)`\)/)?.[1] || "";
}

function importHref(item: ResourceItem): string {
  const params = new URLSearchParams();
  params.set("name", item.name || "");
  const host = firstHostFromRule(item.rule);
  if (host) params.set("host", host);
  if (item.entryPoints?.[0]) params.set("entrypoint", item.entryPoints[0]);
  if (item.middlewares?.length) params.set("middlewares", item.middlewares.join(","));
  return "/services/add?" + params.toString();
}

function statusVariant(status?: string) {
  if (!status) return "secondary" as const;
  if (["enabled", "reachable"].includes(status)) return "default" as const;
  if (["missing", "unreachable", "disabled"].includes(status)) return "destructive" as const;
  return "secondary" as const;
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

  useEffect(() => {
    fetchResources();
    fetchHealth();
  }, [fetchResources, fetchHealth]);

  const activeResources = resources[activeType];
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
            <CardHeader className="pb-2"><CardTitle className="text-sm">Extra</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold text-blue-600">{drift?.summary?.extra ?? 0}</CardContent>
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GitCompare className="h-5 w-5" /> Config Drift</CardTitle>
            <CardDescription>Expected app-generated routers/services compared with live Traefik resources</CardDescription>
          </CardHeader>
          <CardContent>
            {drift?.error ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{drift.error}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead>Status</TableHead><TableHead>Issue</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {[...(drift?.routers || []).map((item) => ({ ...item, kind: "Router" })), ...(drift?.services || []).map((item) => ({ ...item, kind: "Service" }))]
                    .filter((item) => item.issue)
                    .map((item) => (
                      <TableRow key={`${item.kind}-${item.name}`}>
                        <TableCell className="font-mono text-xs">{item.name}</TableCell>
                        <TableCell>{item.kind}</TableCell>
                        <TableCell><Badge variant={statusVariant(item.status)}>{item.status || "unknown"}</Badge></TableCell>
                        <TableCell>{item.issue}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Resources</CardTitle>
            <CardDescription>Resources reported by the Traefik API</CardDescription>
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

            <Table>
              <TableHeader>
                <TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Provider/Type</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {activeResources.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-mono text-xs">{item.name}</TableCell>
                    <TableCell><Badge variant={statusVariant(item.status)}>{item.status || "unknown"}</Badge></TableCell>
                    <TableCell>{item.provider || item.type || item.address || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.rule || item.service || item.entryPoints?.join(", ") || item.address || "-"}</TableCell>
                    <TableCell className="text-right">
                      {activeType === "routers" && (
                        <Button asChild variant="outline" size="sm">
                          <NextLink href={importHref(item)}>Import</NextLink>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Target Health</CardTitle>
            <CardDescription>TCP reachability checks from the app container to configured service targets</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Service</TableHead><TableHead>Target</TableHead><TableHead>Status</TableHead><TableHead>Latency</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {healthChecks.map((check) => (
                  <TableRow key={check.serviceId}>
                    <TableCell>{check.name}</TableCell>
                    <TableCell className="font-mono text-xs">{check.target}</TableCell>
                    <TableCell><Badge variant={check.reachable ? "default" : "destructive"}>{check.reachable ? "Reachable" : "Failed"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{check.reachable ? `${check.durationMs}ms` : check.error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
