"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CrowdSecDecision {
  id?: number;
  origin?: string;
  scenario?: string;
  scope?: string;
  type?: string;
  value?: string;
  duration?: string;
}

interface CrowdSecResponse {
  configured: boolean;
  reachable: boolean;
  apiUrl?: string;
  decisions: CrowdSecDecision[];
  error?: string;
}

function topValues(decisions: CrowdSecDecision[], getValue: (decision: CrowdSecDecision) => string | undefined) {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    const value = getValue(decision);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 4);
}

function statusVariant(reachable: boolean, configured: boolean) {
  if (!configured) return "secondary" as const;
  return reachable ? "default" as const : "destructive" as const;
}

export function CrowdSecCard() {
  const [payload, setPayload] = useState<CrowdSecResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/crowdsec");
      const data = await response.json().catch(() => null);
      if (!data || typeof data.configured !== "boolean" || !Array.isArray(data.decisions)) {
        setPayload({ configured: true, reachable: false, decisions: [], error: "Invalid CrowdSec API response" });
        return;
      }
      setPayload(data);
    } catch (error) {
      setPayload({
        configured: true,
        reachable: false,
        decisions: [],
        error: error instanceof Error ? error.message : "Failed to load CrowdSec status",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const decisions = useMemo(() => payload?.decisions || [], [payload?.decisions]);
  const stats = useMemo(() => ({
    total: decisions.length,
    bans: decisions.filter((decision) => decision.type === "ban").length,
    byOrigin: topValues(decisions, (decision) => decision.origin),
    byScenario: topValues(decisions, (decision) => decision.scenario),
  }), [decisions]);

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              CrowdSec
              {payload && (
                <Badge variant={statusVariant(payload.reachable, payload.configured)}>
                  {!payload.configured ? "Not configured" : payload.reachable ? "Connected" : "Unavailable"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Read-only visibility into active CrowdSec LAPI decisions using a bouncer API key.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {payload?.apiUrl && (
          <div className="text-xs text-muted-foreground">
            LAPI: <span className="font-mono">{payload.apiUrl}</span>
          </div>
        )}

        {payload?.error && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {payload.error}
          </div>
        )}

        {payload?.configured && payload.reachable && (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border bg-muted/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">Active decisions</p>
                <p className="text-2xl font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-md border bg-muted/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">Bans</p>
                <p className="text-2xl font-semibold">{stats.bans}</p>
              </div>
              <div className="rounded-md border bg-muted/10 px-3 py-2">
                <p className="mb-1 text-xs text-muted-foreground">Top origins</p>
                <SummaryItems items={stats.byOrigin} empty="No origins" />
              </div>
              <div className="rounded-md border bg-muted/10 px-3 py-2">
                <p className="mb-1 text-xs text-muted-foreground">Top scenarios</p>
                <SummaryItems items={stats.byScenario} empty="No scenarios" />
              </div>
            </div>

            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Decision</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Scenario</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decisions.map((decision, index) => (
                    <TableRow key={`${decision.id || index}-${decision.scope || ""}-${decision.value || ""}`}>
                      <TableCell>
                        <Badge variant={decision.type === "ban" ? "destructive" : "secondary"}>{decision.type || "decision"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {decision.scope || "-"}:{decision.value || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{decision.origin || "-"}</TableCell>
                      <TableCell className="max-w-md wrap-break-word text-xs text-muted-foreground">{decision.scenario || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{decision.duration || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {decisions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        CrowdSec is reachable and has no active decisions.
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

function SummaryItems({ empty, items }: { empty: string; items: Array<{ label: string; count: number }> }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="truncate font-mono" title={item.label}>{item.label}</span>
          <Badge variant="outline" className="shrink-0 font-normal">{item.count}</Badge>
        </div>
      ))}
    </div>
  );
}
