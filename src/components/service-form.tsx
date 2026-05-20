"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { DurationSelect } from "@/components/duration-select";
import { X, Save, AlertCircle, PlugZap, FileText } from "lucide-react";
import { useServiceForm, type ServiceFormData } from "@/hooks/use-service-form";
import { useServiceHeaders } from "@/hooks/use-service-headers";
import { useDomains } from "@/lib/hooks/use-domains";
import { useTraefikEntrypoints } from "@/lib/hooks/use-traefik-entrypoints";
import { useTraefikMiddlewares } from "@/lib/hooks/use-traefik-middlewares";
import { getUnknownMiddlewareNames, parseMiddlewareNames } from "@/lib/middleware-utils";
import type { Service } from "./service-table";

interface ServiceFormProps {
  service: Service | null;
  defaultDuration?: number;
  onSubmit: (data: ServiceFormData) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  initialData?: Partial<ServiceFormData>;
}

export function ServiceForm({
  service,
  defaultDuration,
  onSubmit,
  onCancel,
  submitting = false,
  initialData,
}: ServiceFormProps) {

  // Use custom hooks for form management
  const { formData, updateFormData, hasUnsavedChanges } = useServiceForm({
    service,
    defaultDuration,
    initialData,
  });

  const { middlewareText, setMiddlewareText, hostHeader, setHostHeader } = useServiceHeaders({
    formData,
    updateFormData,
  });
  const [targetTest, setTargetTest] = useState<{
    reachable: boolean;
    durationMs?: number;
    error?: string;
    target?: string;
  } | null>(null);
  const [testingTarget, setTestingTarget] = useState(false);
  const [configPreview, setConfigPreview] = useState<{
    current: unknown;
    proposed: unknown;
    diff: string[];
    changes?: {
      added: string[];
      changed: string[];
      removed: string[];
    };
    error?: string;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { domains, fetchDomains } = useDomains();
  const {
    middlewares: availableMiddlewares,
    loading: loadingMiddlewares,
    configured: middlewareDiscoveryConfigured,
    error: middlewareDiscoveryError,
  } = useTraefikMiddlewares();
  const {
    entrypoints: availableEntrypoints,
    loading: loadingEntrypoints,
    configured: entrypointDiscoveryConfigured,
    error: entrypointDiscoveryError,
  } = useTraefikEntrypoints();

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Set default domain if no domain is selected and we have domains
  useEffect(() => {
    if (!formData.domainId && domains.length > 0 && !service) {
      const defaultDomain = domains.find(d => d.isDefault) || domains[0];
      if (defaultDomain) {
        updateFormData({ domainId: defaultDomain.id });
      }
    }
  }, [domains, formData.domainId, service, updateFormData]);

  // Get the currently selected domain for display
  const selectedDomain = domains.find(d => d.id === formData.domainId);
  const canValidateMiddlewares = !loadingMiddlewares && availableMiddlewares.length > 0;
  const middlewareSelectPlaceholder = loadingMiddlewares
    ? "Loading middlewares"
    : !middlewareDiscoveryConfigured
      ? "Discovery unavailable"
      : middlewareDiscoveryError
        ? "Discovery failed"
        : availableMiddlewares.length === 0
          ? "No middlewares found"
          : "Add middleware";
  const entrypointSelectPlaceholder = loadingEntrypoints
    ? "Loading entrypoints"
    : !entrypointDiscoveryConfigured
      ? "Discovery unavailable"
      : entrypointDiscoveryError
        ? "Discovery failed"
        : availableEntrypoints.length === 0
          ? "No entrypoints found"
          : "Use discovered entrypoint";
  const canValidateEntrypoints = !loadingEntrypoints && availableEntrypoints.length > 0;
  const unknownEntrypoint = canValidateEntrypoints && formData.entrypoint
    && !availableEntrypoints.some((entrypoint) => entrypoint.name === formData.entrypoint)
    ? formData.entrypoint
    : null;
  const unknownMiddlewares = canValidateMiddlewares
    ? getUnknownMiddlewareNames(
        middlewareText,
        availableMiddlewares.map((middleware) => middleware.name),
      )
    : [];


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const testTarget = async () => {
    setTestingTarget(true);
    setTargetTest(null);

    try {
      const response = await fetch("/api/services/test-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIp: formData.targetIp,
          targetPort: formData.targetPort,
        }),
      });
      const data = await response.json().catch(() => ({ reachable: false, error: "Invalid response" }));
      setTargetTest(data);
    } catch (error) {
      console.error("Error testing target:", error);
      setTargetTest({ reachable: false, error: "Failed to test target" });
    } finally {
      setTestingTarget(false);
    }
  };

  const loadConfigPreview = async () => {
    setLoadingPreview(true);
    setConfigPreview(null);

    try {
      const response = await fetch("/api/traefik/service-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          serviceId: service?.id,
        }),
      });
      const data = await response.json().catch(() => ({ error: "Invalid response" }));
      setConfigPreview(response.ok ? data : { current: null, proposed: null, diff: [], error: data.error });
    } catch (error) {
      console.error("Error loading config preview:", error);
      setConfigPreview({ current: null, proposed: null, diff: [], error: "Failed to load config preview" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const addMiddleware = (middlewareName: string) => {
    const middlewareNames = parseMiddlewareNames(middlewareText);
    if (!middlewareNames.includes(middlewareName)) {
      setMiddlewareText([...middlewareNames, middlewareName].join(", "));
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Are you sure you want to cancel?");
      if (!confirmed) return;
    }
    onCancel();
  };

  return (
    <UnsavedChangesGuard
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {service ? "Edit Service" : "Add New Service"}
              </CardTitle>
              <CardDescription>
                {service
                  ? "Update service configuration"
                  : "Configure a new proxy service"
                }
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Service Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  placeholder="My Service"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Select
                  value={formData.domainId || ""}
                  onValueChange={(value) => {
                    // Ignore empty string changes - spurious event from Select component
                    if (value === "") {
                      return;
                    }
                    updateFormData({ domainId: value });
                  }}
                  disabled={submitting || domains.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.name} ({domain.domain})
                        {domain.isDefault && " - Default"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hostnameMode">Hostname Mode</Label>
                <Select
                  value={formData.hostnameMode || "subdomain"}
                  onValueChange={(value: "subdomain" | "apex" | "custom") => {
                    updateFormData({
                      hostnameMode: value,
                      // Clear subdomain when switching to apex or custom mode
                      ...(value !== "subdomain" && { subdomain: undefined }),
                      // Clear custom hostnames when switching away from custom mode
                      ...(value !== "custom" && { customHostnames: undefined }),
                    });
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hostname mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subdomain">Subdomain</SelectItem>
                    <SelectItem value="apex">Apex Domain</SelectItem>
                    <SelectItem value="custom">Custom Hostnames</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {formData.hostnameMode === "subdomain" && "Service will be accessible at [subdomain]." + (selectedDomain?.domain || "domain.com")}
                  {formData.hostnameMode === "apex" && "Service will be accessible at " + (selectedDomain?.domain || "domain.com")}
                  {formData.hostnameMode === "custom" && "Service will be accessible at custom hostnames you specify"}
                </p>
              </div>

              {formData.hostnameMode === "subdomain" && (
                <div className="space-y-2">
                  <Label htmlFor="subdomain">Subdomain</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="subdomain"
                      value={formData.subdomain || ""}
                      onChange={(e) => updateFormData({ subdomain: e.target.value })}
                      placeholder="myservice"
                      required
                      disabled={submitting}
                    />
                    <span className="text-sm text-gray-500">
                      .{selectedDomain?.domain || "domain.com"}
                    </span>
                  </div>
                </div>
              )}

              {formData.hostnameMode === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="customHostnames">Custom Hostnames</Label>
                  <Textarea
                    id="customHostnames"
                    value={(() => {
                      try {
                        return formData.customHostnames
                          ? JSON.parse(formData.customHostnames).join('\n')
                          : "";
                      } catch (error) {
                        console.warn("Failed to parse custom hostnames:", error);
                        return formData.customHostnames || "";
                      }
                    })()}
                    onChange={(e) => {
                      const hostnames = e.target.value
                        .split('\n')
                        .map(h => h.trim())
                        .filter(h => h.length > 0);
                      updateFormData({
                        customHostnames: hostnames.length > 0 ? JSON.stringify(hostnames) : null
                      });
                    }}
                    placeholder="app.example.com&#10;api.example.com&#10;www.example.com"
                    rows={4}
                    disabled={submitting}
                  />
                  <p className="text-xs text-gray-500">
                    Enter one hostname per line. These hostnames will be used as-is for routing.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="targetIp">Target IP</Label>
                <Input
                  id="targetIp"
                  value={formData.targetIp}
                  onChange={(e) => {
                    updateFormData({ targetIp: e.target.value });
                    setTargetTest(null);
                  }}
                  placeholder="192.168.1.100"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetPort">Target Port</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="targetPort"
                    type="number"
                    value={formData.targetPort}
                    onChange={(e) => {
                      updateFormData({ targetPort: parseInt(e.target.value) || 80 });
                      setTargetTest(null);
                    }}
                    placeholder="80"
                    required
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testTarget}
                    disabled={submitting || testingTarget || !formData.targetIp || !formData.targetPort}
                    className="shrink-0"
                  >
                    <PlugZap className="mr-2 h-4 w-4" />
                    {testingTarget ? "Testing" : "Test"}
                  </Button>
                </div>
                {targetTest && (
                  <p className={targetTest.reachable ? "text-xs text-green-600" : "text-xs text-amber-700 dark:text-amber-300"}>
                    {targetTest.reachable
                      ? `Reachable in ${targetTest.durationMs ?? 0}ms`
                      : targetTest.error || "Target is unreachable"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="entrypoint">Entrypoint (optional)</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="entrypoint"
                    value={formData.entrypoint || ""}
                    onChange={(e) => updateFormData({ entrypoint: e.target.value || null })}
                    placeholder="websecure"
                    disabled={submitting}
                  />
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value) {
                        updateFormData({ entrypoint: value });
                      }
                    }}
                    disabled={submitting || loadingEntrypoints || availableEntrypoints.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder={entrypointSelectPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEntrypoints.map((entrypoint) => (
                        <SelectItem key={entrypoint.name} value={entrypoint.name}>
                          {entrypoint.name}
                          {entrypoint.address && ` (${entrypoint.address})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-500">
                  Override the default entrypoint for this service
                </p>
                {unknownEntrypoint && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Entry point not found in currently discovered Traefik entrypoints: {unknownEntrypoint}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isHttps"
                  checked={formData.isHttps}
                  onCheckedChange={(checked) => updateFormData({ isHttps: checked })}
                  disabled={submitting}
                />
                <Label htmlFor="isHttps">Target uses HTTPS</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="passHostHeader"
                  checked={formData.passHostHeader ?? true}
                  onCheckedChange={(checked) => updateFormData({ passHostHeader: checked })}
                  disabled={submitting}
                />
                <div className="space-y-1">
                  <Label htmlFor="passHostHeader">Pass Host header to target</Label>
                  <p className="text-xs text-gray-500">
                    Controls Traefik loadBalancer.passHostHeader for this service
                  </p>
                </div>
              </div>

              {formData.isHttps && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="insecureSkipVerify"
                    checked={formData.insecureSkipVerify}
                    onCheckedChange={(checked) => updateFormData({ insecureSkipVerify: checked })}
                    disabled={submitting}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="insecureSkipVerify">Skip TLS Certificate Validation</Label>
                    <p className="text-xs text-gray-500">
                      Enable for services with self-signed or invalid certificates
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => updateFormData({ enabled: checked })}
                  disabled={submitting}
                />
                <Label htmlFor="enabled">Enable service</Label>
              </div>

              <DurationSelect
                value={formData.enableDurationMinutes}
                onValueChange={(duration) => updateFormData({ enableDurationMinutes: duration })}
                disabled={submitting}
              />

              <div className="space-y-2">
                <Label htmlFor="middlewares">Middlewares (comma-separated)</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="middlewares"
                    value={middlewareText}
                    onChange={(e) => setMiddlewareText(e.target.value)}
                    placeholder="auth@file, ratelimit@file"
                    disabled={submitting}
                  />
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value) {
                        addMiddleware(value);
                      }
                    }}
                    disabled={submitting || loadingMiddlewares || availableMiddlewares.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder={middlewareSelectPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMiddlewares.map((middleware) => (
                        <SelectItem key={middleware.name} value={middleware.name}>
                          {middleware.name}
                          {middleware.type && ` (${middleware.type})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-500">
                  Optional Traefik middlewares to apply to this service
                </p>
                {!loadingMiddlewares && !middlewareDiscoveryConfigured && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Set TRAEFIK_API_URL to enable middleware discovery. Manual values are still allowed.
                  </p>
                )}
                {unknownMiddlewares.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Not found in the currently discovered Traefik middlewares:</p>
                      <p className="mt-1 font-mono text-xs">{unknownMiddlewares.join(", ")}</p>
                      <p className="mt-1 text-xs">You can still save manual provider values.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="hostHeader">Host Header Override</Label>
                <Input
                  id="hostHeader"
                  value={hostHeader}
                  onChange={(e) => setHostHeader(e.target.value)}
                  placeholder="internal-service.local"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Override the Host header sent to the target service
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="managedMiddlewares">Managed Middlewares JSON</Label>
                <Textarea
                  id="managedMiddlewares"
                  value={formData.managedMiddlewares || ""}
                  onChange={(e) => updateFormData({ managedMiddlewares: e.target.value })}
                  placeholder={'{\n  "redirect-to-admin": {\n    "redirectRegex": {\n      "regex": "^https?://pihole.example.com/$",\n      "replacement": "https://pihole.example.com/admin",\n      "permanent": true\n    }\n  }\n}'}
                  rows={7}
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Optional Traefik middleware definitions generated by the app. Reference these names in the middleware list above.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="advancedRouters">Additional Routers JSON</Label>
                <Textarea
                  id="advancedRouters"
                  value={formData.advancedRouters || ""}
                  onChange={(e) => updateFormData({ advancedRouters: e.target.value })}
                  placeholder={'[\n  {\n    "name": "api-bypass",\n    "rule": "Host(`tautulli.example.com`) && (Header(`X-Api-Key`,`REDACTED`) || Query(`apikey`,`REDACTED`))",\n    "entrypoint": "https",\n    "middlewares": [],\n    "certResolver": "cloudflare"\n  }\n]'}
                  rows={8}
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Optional extra routers targeting this same backend service. Omit middlewares to inherit this service route, use [] for a bypass router.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium">Generated Config Preview</h3>
                  <p className="text-sm text-muted-foreground">
                    Preview the router, service, middleware, and transport slice for this form.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadConfigPreview}
                  disabled={submitting || loadingPreview || !formData.domainId || !formData.targetIp || !formData.targetPort}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {loadingPreview ? "Loading" : "Preview"}
                </Button>
              </div>

              {configPreview?.error && (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{configPreview.error}</p>
              )}

              {configPreview && !configPreview.error && (
                <div className="mt-4 space-y-4">
                  {configPreview.changes && (
                    <div className="grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-md border p-3">
                        <p className="font-medium">Added</p>
                        <p className="mt-1 text-muted-foreground">{configPreview.changes.added.join(", ") || "None"}</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="font-medium">Changed</p>
                        <p className="mt-1 text-muted-foreground">{configPreview.changes.changed.join(", ") || "None"}</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="font-medium">Removed</p>
                        <p className="mt-1 text-muted-foreground">{configPreview.changes.removed.join(", ") || "None"}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Proposed</p>
                    <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(configPreview.proposed, null, 2)}
                    </pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Diff</p>
                    <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                      {configPreview.diff.length > 0 ? configPreview.diff.join("\n") : "No generated config changes"}
                    </pre>
                  </div>
                  </div>
                </div>
              )}
            </div>

            {hasUnsavedChanges && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  You have unsaved changes
                </span>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                <Save className="mr-2 h-4 w-4" />
                {submitting ? "Saving..." : service ? "Update Service" : "Create Service"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </UnsavedChangesGuard>
  );
}