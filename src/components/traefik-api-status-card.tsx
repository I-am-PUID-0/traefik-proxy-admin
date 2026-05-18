"use client";

import { RefreshCw, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTraefikStatus } from "@/lib/hooks/use-traefik-status";

export function TraefikApiStatusCard() {
  const { status, loading, fetchStatus } = useTraefikStatus();
  const configured = status?.configured ?? false;
  const reachable = status?.reachable ?? false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog className="h-4 w-4" />
            Traefik API
          </CardTitle>
          <CardDescription>
            Discovery status for live Traefik resources
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={configured ? "default" : "secondary"}>
            {configured ? "Configured" : "Not configured"}
          </Badge>
          <Badge variant={reachable ? "default" : "destructive"}>
            {reachable ? "Reachable" : "Unavailable"}
          </Badge>
          {status?.fallback && <Badge variant="secondary">Dev fallback</Badge>}
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="font-medium text-foreground">URL:</span>{" "}
            {status?.apiUrl || "Set TRAEFIK_API_URL"}
          </div>
          <div>
            <span className="font-medium text-foreground">Version:</span>{" "}
            {status?.version || "Unknown"}
          </div>
        </div>

        {status?.error && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {status.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
