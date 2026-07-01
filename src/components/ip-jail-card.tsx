"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface IpJailDecision {
  id: string;
  subject: string;
  reason: string | null;
  source: string;
  evidence: string | null;
  isEnabled: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DURATION_OPTIONS = [
  { value: "60", label: "1 hour" },
  { value: "1440", label: "24 hours" },
  { value: "10080", label: "7 days" },
  { value: "43200", label: "30 days" },
  { value: "forever", label: "Forever" },
];

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function status(decision: IpJailDecision) {
  if (decision.isActive) return { label: "Active", variant: "destructive" as const };
  if (!decision.isEnabled) return { label: "Released", variant: "secondary" as const };
  return { label: "Expired", variant: "outline" as const };
}

function isLoopbackSubject(value: string) {
  const address = value.trim().toLowerCase().split("/")[0];
  return address.startsWith("127.") || address === "::1" || address === "0:0:0:0:0:0:0:1";
}

export function IpJailCard() {
  const [decisions, setDecisions] = useState<IpJailDecision[]>([]);
  const [enforcementEnabled, setEnforcementEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState("1440");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/ip-jail");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setDecisions(Array.isArray(data?.decisions) ? data.decisions : []);
      setEnforcementEnabled(data?.enforcementEnabled !== false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load IP jail decisions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  useEffect(() => {
    const refresh = () => fetchDecisions();
    window.addEventListener("tpa-ip-jail-updated", refresh);
    return () => window.removeEventListener("tpa-ip-jail-updated", refresh);
  }, [fetchDecisions]);

  const stats = useMemo(() => {
    const active = decisions.filter((decision) => decision.isActive).length;
    const expired = decisions.filter((decision) => !decision.isActive && decision.isEnabled).length;
    return { active, expired, total: decisions.length };
  }, [decisions]);

  const createDecision = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const confirmLocalhost = isLoopbackSubject(subject);
      if (confirmLocalhost) {
        const confirmed = window.confirm(
          "This is a localhost/loopback address. Blocking it can block every request that Traefik sees as local proxy traffic. Continue?",
        );
        if (!confirmed) return;
      }

      const expiresInMinutes = duration === "forever" ? 0 : Number(duration);
      const response = await fetch("/api/security/ip-jail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          reason: reason || "Manual IP jail entry",
          source: "manual",
          expiresInMinutes,
          confirmLocalhost,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setSubject("");
      setReason("");
      setMessage("IP jail entry added. Traefik will enforce it after the provider config refreshes.");
      await fetchDecisions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add IP jail entry");
    } finally {
      setSaving(false);
    }
  };

  const releaseDecision = async (id: string) => {
    setReleasingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/security/ip-jail/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setMessage("IP jail entry released. Traefik will stop enforcing it after the provider config refreshes.");
      await fetchDecisions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to release IP jail entry");
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Native IP Jail
            </CardTitle>
            <CardDescription>
              DB-backed temporary or permanent client blocks enforced through generated Traefik routers.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDecisions} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/10 px-3 py-2">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-semibold">{stats.active}</p>
          </div>
          <div className="rounded-md border bg-muted/10 px-3 py-2">
            <p className="text-xs text-muted-foreground">Expired</p>
            <p className="text-2xl font-semibold">{stats.expired}</p>
          </div>
          <div className="rounded-md border bg-muted/10 px-3 py-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </div>
        </div>

        {!enforcementEnabled && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            IP jail decisions are saved, but enforcement is paused by <code>TPA_IP_JAIL_ENFORCEMENT=false</code>.
          </div>
        )}

        <div className="rounded-md border bg-muted/10 p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(12rem,1fr)_10rem]">
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="IP or CIDR, e.g. 203.0.113.10 or 2001:db8::/64"
            />
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isLoopbackSubject(subject) && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Loopback addresses can represent the proxy itself. Blocking one requires confirmation and can affect many users.
            </p>
          )}
          <Textarea
            className="mt-2 min-h-20"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason or operator note"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Blocks apply to TPA-managed service hostnames after Traefik reloads the HTTP provider config.
            </p>
            <Button onClick={createDecision} disabled={saving || !subject.trim()}>
              <Ban className="mr-2 h-4 w-4" />
              {saving ? "Adding..." : "Add block"}
            </Button>
          </div>
        </div>

        {message && (
          <div className="rounded-md border bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            {message}
          </div>
        )}

        <div className="max-h-96 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map((decision) => {
                const currentStatus = status(decision);
                return (
                  <TableRow key={decision.id}>
                    <TableCell className="font-mono text-xs">{decision.subject}</TableCell>
                    <TableCell><Badge variant={currentStatus.variant}>{currentStatus.label}</Badge></TableCell>
                    <TableCell className="max-w-sm wrap-break-word text-xs text-muted-foreground">
                      {decision.reason || "-"}
                      {decision.evidence && <span className="mt-1 block font-mono">{decision.evidence}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(decision.expiresAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{decision.source}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => releaseDecision(decision.id)}
                        disabled={releasingId === decision.id}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Release
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {decisions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No IP jail decisions yet.
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
