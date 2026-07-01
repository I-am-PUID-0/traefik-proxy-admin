"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileJson, RefreshCw, Upload } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContextHelp, HelpLabel } from "@/components/context-help";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RestoreSummary {
  mode: "dry-run" | "replace";
  counts: Record<string, number>;
  warnings: string[];
  restored?: boolean;
}

function formatCounts(counts: Record<string, number>) {
  const labels: Record<string, string> = {
    appConfig: "config",
    domains: "domains",
    services: "services",
    serviceSecurityConfigs: "service auth rules",
    sharedLinks: "shared links",
    basicAuthConfigs: "basic auth configs",
    basicAuthUsers: "basic auth users",
    ssoConfigs: "SSO providers",
    ipJailDecisions: "IP jail decisions",
  };

  return Object.entries(counts).map(([key, value]) => ({ label: labels[key] || key, value }));
}

export function BackupRestoreCard() {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [backupPayload, setBackupPayload] = useState<unknown>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const counts = useMemo(() => formatCounts(summary?.counts || {}), [summary]);

  async function exportBackup() {
    setError("");
    setIsExporting(true);
    try {
      const response = await fetch("/api/backup/export");
      if (!response.ok) throw new Error("Backup export failed");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `traefik-proxy-admin-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Backup export failed");
    } finally {
      setIsExporting(false);
    }
  }

  async function inspectBackup(payload: unknown) {
    setIsInspecting(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: payload, dryRun: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Backup inspection failed");
      setSummary(result);
      return true;
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : "Backup inspection failed");
      return false;
    } finally {
      setIsInspecting(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setSummary(null);
    setBackupPayload(null);
    setSelectedFileName(file?.name || "");

    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const valid = await inspectBackup(payload);
      if (valid) setBackupPayload(payload);
    } catch {
      setError("Selected file must be a valid TPA backup JSON file");
    }
  }

  async function restoreBackup() {
    if (!backupPayload) return;

    setIsRestoring(true);
    setError("");
    try {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: backupPayload, confirmReplace: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Backup restore failed");
      setSummary(result);
      setConfirmOpen(false);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Backup restore failed");
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup & Restore</CardTitle>
        <CardDescription>
          Export or replace TPA configuration, services, domains, and service authentication state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <p className="font-medium text-amber-200">Backup files contain sensitive auth data.</p>
              <p className="text-muted-foreground">
                They include SSO client secrets, password hashes, shared-link tokens, IP jail decisions, and admin auth config. Store exported backups like credentials.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border bg-background/40 p-4">
            <div className="flex h-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:items-stretch xl:flex-row xl:items-start">
              <div className="space-y-2">
                <Label>
                  <HelpLabel
                    help={
                      <ContextHelp title="Full backup export" href="/docs/deployment#backups-restores">
                        <p>Exports portable app-level configuration for migration or recovery.</p>
                        <p>The file includes secrets and password hashes, so store it like a credential.</p>
                      </ContextHelp>
                    }
                  >
                    Export full backup
                  </HelpLabel>
                </Label>
                <p className="text-sm text-muted-foreground">
                  Download a portable JSON backup of TPA configuration, services, domains, service auth settings, and IP jail decisions.
                </p>
                <p className="text-xs text-muted-foreground">
                  Active sessions and one-time auth tickets are excluded.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setExportConfirmOpen(true)} disabled={isExporting} className="shrink-0">
                {isExporting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export Backup
              </Button>
            </div>
          </section>

          <section className="rounded-md border bg-background/40 p-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="backup-file">
                  <HelpLabel
                    help={
                      <ContextHelp title="Restore from backup" href="/docs/deployment#backups-restores">
                        <p>Restore runs in replace mode. TPA validates the file first and shows a dry-run summary before the destructive action is enabled.</p>
                        <p>Active sessions are not restored; users will sign in again.</p>
                      </ContextHelp>
                    }
                  >
                    Restore from backup
                  </HelpLabel>
                </Label>
                <Input id="backup-file" ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} />
                {selectedFileName && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileJson className="h-4 w-4" />
                    {selectedFileName}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant={backupPayload && summary ? "destructive" : "outline"}
                disabled={!backupPayload || !summary || isInspecting}
                onClick={() => setConfirmOpen(true)}
                className="w-full sm:w-auto"
              >
                <Upload className="mr-2 h-4 w-4" />
                Restore Backup
              </Button>
            </div>
          </section>
        </div>

        {isInspecting && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Inspecting backup...
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {summary && (
          <div className="space-y-3 rounded-md border bg-background/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={summary.restored ? "default" : "secondary"}>{summary.restored ? "Restored" : "Dry run"}</Badge>
              {counts.map((item) => (
                <Badge key={item.label} variant="outline">
                  {item.value} {item.label}
                </Badge>
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {summary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <AlertDialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export sensitive backup data?</AlertDialogTitle>
            <AlertDialogDescription>
              The exported JSON includes OAuth client secrets, password hashes, shared-link tokens, and admin auth configuration. Store it like a credential and avoid sharing it in logs, tickets, or public repos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={exportBackup} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export Backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this TPA configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              Restore deletes existing domains, services, reusable auth providers, service auth rules, shared links, IP jail decisions, and app config before importing the selected backup. Active sessions are not restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={restoreBackup} disabled={isRestoring} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isRestoring ? "Restoring..." : "Replace and Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
