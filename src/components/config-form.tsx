"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_PRESETS } from "@/lib/duration-presets";
import { GlobalConfig } from "@/lib/hooks/use-config";
import { useTraefikEntrypoints } from "@/lib/hooks/use-traefik-entrypoints";

interface ConfigFormProps {
  config: GlobalConfig;
  onConfigChange: (config: GlobalConfig) => void;
  middlewareText: string;
  onMiddlewareTextChange: (text: string) => void;
}

export function ConfigForm({
  config,
  onConfigChange,
  middlewareText,
  onMiddlewareTextChange
}: ConfigFormProps) {
  const {
    entrypoints: availableEntrypoints,
    loading: loadingEntrypoints,
    configured: entrypointDiscoveryConfigured,
    error: entrypointDiscoveryError,
  } = useTraefikEntrypoints();
  const canValidateEntrypoints = !loadingEntrypoints && availableEntrypoints.length > 0;
  const unknownDefaultEntrypoint = canValidateEntrypoints && config.defaultEntrypoint
    && !availableEntrypoints.some((entrypoint) => entrypoint.name === config.defaultEntrypoint)
    ? config.defaultEntrypoint
    : null;
  const entrypointSelectPlaceholder = loadingEntrypoints
    ? "Loading entrypoints"
    : !entrypointDiscoveryConfigured
      ? "Discovery unavailable"
      : entrypointDiscoveryError
        ? "Discovery failed"
        : availableEntrypoints.length === 0
          ? "No entrypoints found"
          : "Use discovered entrypoint";

  return (
    <div className="space-y-6">
      {/* Domain & Certificate Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Domain & Certificate Settings</CardTitle>
          <CardDescription>
            Configure the base domain and certificate resolver for all services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <strong>Domain & Certificate Settings</strong> are now managed individually in the <a href="/domains" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline">Domains page</a>.
                Each domain can have its own certificate resolver and wildcard certificate settings.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultEntrypoint">Default Entrypoint</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="defaultEntrypoint"
                  placeholder="websecure (optional)"
                  value={config.defaultEntrypoint || ""}
                  onChange={(e) =>
                    onConfigChange({ ...config, defaultEntrypoint: e.target.value })
                  }
                />
                <Select
                  value=""
                  onValueChange={(value) => {
                    if (value) {
                      onConfigChange({ ...config, defaultEntrypoint: value });
                    }
                  }}
                  disabled={loadingEntrypoints || availableEntrypoints.length === 0}
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
              <p className="text-xs text-muted-foreground">
                Default Traefik entrypoint for all services (optional)
              </p>
              {unknownDefaultEntrypoint && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Entry point not found in currently discovered Traefik entrypoints: {unknownDefaultEntrypoint}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDuration">Default Service Duration</Label>
              <Select
                value={config.defaultEnableDurationMinutes?.toString() || "null"}
                onValueChange={(value) => {
                  const duration = value === "null" ? null : parseInt(value);
                  onConfigChange({ ...config, defaultEnableDurationMinutes: duration });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_PRESETS.map((preset) => (
                    <SelectItem key={preset.value?.toString() || "null"} value={preset.value?.toString() || "null"}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default duration for new services before auto-disable
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="adminPanelDomain">Traefik-Reachable Admin URL</Label>
              <Input
                id="adminPanelDomain"
                placeholder="http://tpa:3000 or https://admin.example.com"
                value={config.adminPanelDomain}
                onChange={(e) =>
                  onConfigChange({ ...config, adminPanelDomain: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Internal base URL Traefik uses for the HTTP provider and forwardAuth calls. This must be reachable from the Traefik process.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="adminPanelPublicUrl">Browser Public Admin URL</Label>
              <Input
                id="adminPanelPublicUrl"
                placeholder="https://admin.example.com"
                value={config.adminPanelPublicUrl || ""}
                onChange={(e) =>
                  onConfigChange({ ...config, adminPanelPublicUrl: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Public browser-facing URL for TPA auth redirects and OAuth callbacks. Leave blank only when the Traefik-reachable URL is also browser-accessible.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Middlewares */}
      <Card>
        <CardHeader>
          <CardTitle>Global Middlewares</CardTitle>
          <CardDescription>
            Middlewares that will be applied to all services (one per line)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="middlewares">Middleware Names</Label>
            <Textarea
              id="middlewares"
              placeholder={`compression\nsecurity-headers\nrate-limit`}
              value={middlewareText}
              onChange={(e) => onMiddlewareTextChange(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Enter middleware names, one per line. These will be applied before service-specific middlewares.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Preview</CardTitle>
          <CardDescription>
            Preview of how your configuration will be applied
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4">
            <pre className="text-sm">
{`Example service configuration:
Domain: myservice.[configured-domain]
Certificate: [per-domain cert resolver]${config.defaultEntrypoint ? `\nEntrypoint: ${config.defaultEntrypoint}` : ''}
Middlewares: [${middlewareText.split('\n').filter(m => m.trim()).join(', ')}] + auth + service-specific

Note: Domains and certificates are now configured individually in the Domains page.
Each domain can have its own certificate resolver and wildcard settings.`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}