"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextHelp, HelpLabel } from "@/components/context-help";
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
              <Label htmlFor="defaultEntrypoint">
                <HelpLabel
                  help={
                    <ContextHelp title="Default entrypoint" href="/docs/traefik#dynamic-config-provider">
                      <p>Used when a service does not set its own entrypoint. Match this to a Traefik entrypoint name, such as websecure.</p>
                      <p>Leave it blank if each service should choose its own entrypoint or your Traefik defaults already handle routing.</p>
                    </ContextHelp>
                  }
                >
                  Default Entrypoint
                </HelpLabel>
              </Label>
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
              <Label htmlFor="defaultDuration">
                <HelpLabel
                  help={
                    <ContextHelp title="Default service duration" href="/docs/services#service-basics">
                      <p>New services use this auto-disable window unless the service form overrides it.</p>
                      <p>Choose Forever for permanent services. Shorter windows are useful for temporary exposure.</p>
                    </ContextHelp>
                  }
                >
                  Default Service Duration
                </HelpLabel>
              </Label>
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
              <Label htmlFor="adminPanelDomain">
                <HelpLabel
                  help={
                    <ContextHelp title="Internal TPA URL for Traefik" href="/docs/traefik#forward-authentication">
                      <p>This is the base URL Traefik itself can reach. Generated forwardAuth middleware points Traefik here.</p>
                      <p>Use an internal container, LAN, or host address when Traefik cannot reach the browser-facing TPA URL.</p>
                    </ContextHelp>
                  }
                >
                  Internal TPA URL for Traefik
                </HelpLabel>
              </Label>
              <Input
                id="adminPanelDomain"
                placeholder="http://traefik-proxy-admin:3000"
                value={config.adminPanelDomain}
                onChange={(e) =>
                  onConfigChange({ ...config, adminPanelDomain: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Base URL Traefik can reach from its network. TPA uses this when generating the HTTP provider endpoint and forwardAuth address, for example http://traefik-proxy-admin:3000.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="adminPanelPublicUrl">
                <HelpLabel
                  help={
                    <ContextHelp title="Public TPA URL for Browser/OAuth" href="/docs/authentication#service-sso-and-forwardauth">
                      <p>This is the HTTPS URL users and OAuth providers can open in a browser.</p>
                      <p>Service SSO redirects and OAuth callbacks use this value, even when Traefik talks to TPA through an internal URL.</p>
                    </ContextHelp>
                  }
                >
                  Public TPA URL for Browser/OAuth
                </HelpLabel>
              </Label>
              <Input
                id="adminPanelPublicUrl"
                placeholder="https://tpa.example.com"
                value={config.adminPanelPublicUrl || ""}
                onChange={(e) =>
                  onConfigChange({ ...config, adminPanelPublicUrl: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Public HTTPS URL users can open in a browser. TPA uses this for admin SSO, service SSO redirects, and OAuth callbacks. It does not need to match protected service domains.
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
            <Label htmlFor="middlewares">
              <HelpLabel
                help={
                  <ContextHelp title="Global middlewares" href="/docs/services#middlewares">
                    <p>These middleware references are applied to every generated service route before service-specific middleware.</p>
                    <p>Use one Traefik middleware reference per line, such as secure-headers.</p>
                  </ContextHelp>
                }
              >
                Middleware Names
              </HelpLabel>
            </Label>
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