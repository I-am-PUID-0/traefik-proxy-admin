"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Plus,
  Power,
  PowerOff,
  Edit,
  Trash2,
  Shield,
  ExternalLink,
  Clock,
  Copy,
  Link,
  Users,
  Key,
  Download,
  Upload,
  Search,
  ArrowDownAZ,
  ArrowUpAZ,
  TimerReset,
} from "lucide-react";
import { ServiceCountdown } from "@/components/service-countdown";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatMiddlewareNames } from "@/lib/middleware-utils";

export interface Service {
  id: string;
  name: string;
  subdomain?: string | null; // Optional, only used when hostname_mode is 'subdomain'
  hostnameMode: 'subdomain' | 'apex' | 'custom';
  customHostnames?: string | null; // JSON array of hostnames when hostname_mode is 'custom'
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  isHttps: boolean;
  insecureSkipVerify: boolean;
  passHostHeader: boolean;
  enabled: boolean;
  enabledAt?: string | null;
  enableDurationMinutes?: number | null;
  middlewares?: string;
  requestHeaders?: string;
  managedMiddlewares?: string | null;
  advancedRouters?: string | null;
  createdAt: string;
  updatedAt: string;
  // Domain information
  domain?: {
    id: string;
    name: string;
    domain: string;
    useWildcardCert: boolean;
    certResolver: string;
    isDefault: boolean;
    description?: string | null;
    certificateConfigs?: string | null;
  };
  // Security configuration indicators
  hasSharedLink?: boolean;
  hasSso?: boolean;
  hasBasicAuth?: boolean;
  basicAuthCount?: number;
}

type StatusFilter = "all" | "enabled" | "disabled";
type SecurityFilter = "all" | "protected" | "sso" | "basic" | "shared" | "unprotected";
type SortOption = "status-name" | "name-asc" | "name-desc" | "domain-asc" | "target-asc" | "updated-desc" | "updated-asc";

const getMiddlewareText = (middlewares: Service["middlewares"]) =>
  formatMiddlewareNames(middlewares);

const parseJsonArray = (value: string | null | undefined): string[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
};

const getServiceHostnames = (service: Service): string[] => {
  const domain = service.domain?.domain;

  if (service.hostnameMode === "custom") {
    return parseJsonArray(service.customHostnames);
  }

  if (service.hostnameMode === "apex") {
    return domain ? [domain] : [];
  }

  if (service.subdomain && domain) {
    return [`${service.subdomain}.${domain}`];
  }

  return [];
};

const getPrimaryHostname = (service: Service) => getServiceHostnames(service)[0] || "No hostname";

const serviceHasSecurity = (service: Service) => Boolean(service.hasSharedLink || service.hasSso || service.hasBasicAuth);

const formatDurationForButton = (durationMinutes: number | null | undefined): string => {
  if (!durationMinutes) return "∞";

  if (durationMinutes < 60) {
    return `${durationMinutes}min`;
  } else if (durationMinutes < 1440) {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    return mins > 0 ? `${hours}h${mins}min` : `${hours}h`;
  } else {
    const days = Math.floor(durationMinutes / 1440);
    const hours = Math.floor((durationMinutes % 1440) / 60);
    const mins = durationMinutes % 60;

    let result = `${days}d`;
    if (hours > 0) result += `${hours}h`;
    if (mins > 0) result += `${mins}min`;

    return result;
  }
};

interface ServiceTableProps {
  services: Service[];
  loading: boolean;
  onAddNew?: () => void;
  onEdit?: (service: Service) => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onManageSecurity?: (service: Service) => void;
  onGenerateShareLink?: (serviceId: string) => Promise<void>;
  onRefresh: () => void;
  useRouterNavigation?: boolean;
}

export function ServiceTable({
  services,
  loading,
  onAddNew,
  onEdit,
  onDelete,
  onToggle,
  onManageSecurity,
  onGenerateShareLink,
  onRefresh,
  useRouterNavigation = false,
}: ServiceTableProps) {
  const [deletingService, setDeletingService] = useState<string | null>(null);
  const [togglingService, setTogglingService] = useState<string | null>(null);
  const [importingServices, setImportingServices] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [securityFilter, setSecurityFilter] = useState<SecurityFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("status-name");

  const serviceStats = useMemo(() => {
    const active = services.filter((service) => service.enabled).length;
    const protectedCount = services.filter(serviceHasSecurity).length;

    return {
      total: services.length,
      active,
      inactive: services.length - active,
      protectedCount,
      unprotected: services.length - protectedCount,
    };
  }, [services]);

  const filteredServices = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...services]
      .filter((service) => {
        if (statusFilter === "enabled" && !service.enabled) return false;
        if (statusFilter === "disabled" && service.enabled) return false;

        if (securityFilter === "protected" && !serviceHasSecurity(service)) return false;
        if (securityFilter === "unprotected" && serviceHasSecurity(service)) return false;
        if (securityFilter === "sso" && !service.hasSso) return false;
        if (securityFilter === "basic" && !service.hasBasicAuth) return false;
        if (securityFilter === "shared" && !service.hasSharedLink) return false;

        if (!normalizedQuery) return true;

        const searchable = [
          service.name,
          service.subdomain,
          service.domain?.name,
          service.domain?.domain,
          service.targetIp,
          String(service.targetPort),
          service.entrypoint,
          getMiddlewareText(service.middlewares),
          ...getServiceHostnames(service),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);

        switch (sortOption) {
          case "name-asc":
            return nameCompare;
          case "name-desc":
            return b.name.localeCompare(a.name);
          case "domain-asc": {
            const hostCompare = getPrimaryHostname(a).localeCompare(getPrimaryHostname(b));
            return hostCompare || nameCompare;
          }
          case "target-asc": {
            const targetCompare = `${a.targetIp}:${a.targetPort}`.localeCompare(`${b.targetIp}:${b.targetPort}`);
            return targetCompare || nameCompare;
          }
          case "updated-desc":
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || nameCompare;
          case "updated-asc":
            return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() || nameCompare;
          case "status-name":
          default:
            if (a.enabled && !b.enabled) return -1;
            if (!a.enabled && b.enabled) return 1;
            return nameCompare;
        }
      });
  }, [services, searchQuery, statusFilter, securityFilter, sortOption]);

  const hasActiveViewControls = Boolean(searchQuery.trim()) || statusFilter !== "all" || securityFilter !== "all" || sortOption !== "status-name";

  const resetViewControls = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSecurityFilter("all");
    setSortOption("status-name");
  };

  const handleStatusFilterChange = (value: string) => {
    if (!value) return;
    setStatusFilter(value as StatusFilter);
  };

  const handleSecurityFilterChange = (value: string) => {
    if (!value) return;
    setSecurityFilter(value as SecurityFilter);
  };

  const handleSortOptionChange = (value: string) => {
    if (!value) return;
    setSortOption(value as SortOption);
  };

  const handleDelete = async (id: string) => {
    setDeletingService(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingService(null);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingService(id);
    try {
      await onToggle(id);
    } finally {
      setTogglingService(null);
    }
  };

  const downloadJson = async (url: string, fallbackFilename: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleExportAll = async () => {
    try {
      await downloadJson("/api/services/export", "traefik-proxy-admin-services.json");
    } catch (error) {
      console.error("Failed to export services:", error);
      alert("Failed to export services.");
    }
  };

  const handleExportService = async (service: Service) => {
    try {
      await downloadJson(`/api/services/${service.id}/export`, `traefik-proxy-admin-${service.name}.json`);
    } catch (error) {
      console.error("Failed to export service:", error);
      alert(`Failed to export ${service.name}.`);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingServices(true);
    try {
      const payload = JSON.parse(await file.text());
      const renameConflicts = window.confirm(
        "Rename imported services when a name or subdomain already exists? Choose Cancel to skip conflicting services.",
      );
      const response = await fetch("/api/services/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          conflictStrategy: renameConflicts ? "rename" : "skip",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Import failed");
      }

      await onRefresh();
      alert(`Imported ${result.imported} service(s). Skipped ${result.skipped} service(s).`);
    } catch (error) {
      console.error("Failed to import services:", error);
      alert(error instanceof Error ? error.message : "Failed to import services.");
    } finally {
      setImportingServices(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Services
          </CardTitle>
          <CardDescription>Loading services...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Service inventory
            </CardTitle>
            <CardDescription>
              Routes, targets, and protection status
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={handleExportAll} disabled={services.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export All
            </Button>
            <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importingServices}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button onClick={useRouterNavigation ? () => router.push('/services/add') : onAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
        {services.length === 0 ? (
          <div className="text-center py-10">
            <Settings className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No services found</h3>
            <p className="text-muted-foreground mb-4">
              Add the first route Traefik should publish.
            </p>
            <Button onClick={useRouterNavigation ? () => router.push('/services/add') : onAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold">{serviceStats.total}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-semibold text-green-600">{serviceStats.active}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Inactive</p>
                <p className="text-2xl font-semibold text-muted-foreground">{serviceStats.inactive}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Protected</p>
                <p className="text-2xl font-semibold">{serviceStats.protectedCount}</p>
              </div>
              <div className="rounded-md border p-3 sm:col-span-2 lg:col-span-1">
                <p className="text-xs text-muted-foreground">Unprotected</p>
                <p className="text-2xl font-semibold">{serviceStats.unprotected}</p>
              </div>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_180px_190px_auto] lg:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search services, hosts, targets, middleware"
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="enabled">Active only</SelectItem>
                    <SelectItem value="disabled">Inactive only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={securityFilter} onValueChange={handleSecurityFilterChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Security" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All security</SelectItem>
                    <SelectItem value="protected">Protected</SelectItem>
                    <SelectItem value="unprotected">Unprotected</SelectItem>
                    <SelectItem value="sso">SSO</SelectItem>
                    <SelectItem value="basic">Basic auth</SelectItem>
                    <SelectItem value="shared">Shared link</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOption} onValueChange={handleSortOptionChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status-name">Active, then name</SelectItem>
                    <SelectItem value="name-asc">Name A-Z</SelectItem>
                    <SelectItem value="name-desc">Name Z-A</SelectItem>
                    <SelectItem value="domain-asc">Hostname A-Z</SelectItem>
                    <SelectItem value="target-asc">Target A-Z</SelectItem>
                    <SelectItem value="updated-desc">Recently updated</SelectItem>
                    <SelectItem value="updated-asc">Oldest updated</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={resetViewControls}
                  disabled={!hasActiveViewControls}
                  className="justify-center"
                >
                  <TimerReset className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {filteredServices.length} of {services.length} services
                </span>
                {sortOption === "name-asc" && <ArrowDownAZ className="h-4 w-4" />}
                {sortOption === "name-desc" && <ArrowUpAZ className="h-4 w-4" />}
              </div>
            </div>

            {filteredServices.length === 0 ? (
              <div className="rounded-md border border-dashed py-10 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No matching services</p>
                <p className="text-sm text-muted-foreground">Clear the search or filters to widen the list.</p>
              </div>
            ) : (
              filteredServices.map((service) => {
                const hostnames = getServiceHostnames(service);
                const primaryHostname = hostnames[0];
                const visibleHostnames = hostnames.slice(0, 2);
                const extraHostnameCount = Math.max(hostnames.length - visibleHostnames.length, 0);
                const middlewareText = getMiddlewareText(service.middlewares);

                return (
                  <div
                    key={service.id}
                    className={`rounded-md border p-4 transition-colors ${
                      service.enabled ? "bg-background hover:bg-muted/30" : "bg-muted/30 opacity-75"
                    }`}
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-base font-semibold">{service.name}</h3>
                          <Badge variant={service.enabled ? "default" : "secondary"}>
                            {service.enabled ? "Active" : "Inactive"}
                          </Badge>
                          {service.isHttps && <Badge variant="outline" className="text-green-600">HTTPS</Badge>}
                          {service.hostnameMode !== "subdomain" && (
                            <Badge variant="outline" className="capitalize">{service.hostnameMode}</Badge>
                          )}
                          {service.hasSharedLink && (
                            <Badge variant="outline" className="text-blue-600" title="Shared Link Authentication">
                              <Link className="mr-1 h-3 w-3" />
                              Shared
                            </Badge>
                          )}
                          {service.hasSso && (
                            <Badge variant="outline" className="text-purple-600" title="Single Sign-On Authentication">
                              <Users className="mr-1 h-3 w-3" />
                              SSO
                            </Badge>
                          )}
                          {service.hasBasicAuth && (
                            <Badge
                              variant="outline"
                              className="text-orange-600"
                              title={`Basic Authentication${service.basicAuthCount && service.basicAuthCount > 1 ? ` (${service.basicAuthCount} configs)` : ""}`}
                            >
                              <Key className="mr-1 h-3 w-3" />
                              Basic{service.basicAuthCount && service.basicAuthCount > 1 ? ` ${service.basicAuthCount}` : ""}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          {visibleHostnames.length > 0 ? (
                            visibleHostnames.map((hostname) => (
                              <code key={hostname} className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                                {hostname}
                              </code>
                            ))
                          ) : (
                            <span>No hostname configured</span>
                          )}
                          {extraHostnameCount > 0 && <Badge variant="secondary">+{extraHostnameCount} more</Badge>}
                          {primaryHostname && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              title="Open service"
                              onClick={() => window.open(`https://${primaryHostname}`, "_blank", "noopener,noreferrer")}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {service.hasSharedLink && onGenerateShareLink && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onGenerateShareLink(service.id)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copy Link
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => onManageSecurity?.(service)}>
                          <Shield className="h-4 w-4 mr-1" />
                          Security
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExportService(service)}>
                          <Download className="h-4 w-4 mr-1" />
                          Export
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={useRouterNavigation ? () => router.push(`/services/${service.id}/edit`) : () => onEdit?.(service)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(service.id)}
                          disabled={togglingService === service.id}
                          className={service.enabled ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                        >
                          {service.enabled ? <PowerOff className="h-4 w-4 mr-1" /> : <Power className="h-4 w-4 mr-1" />}
                          {service.enabled ? "Disable" : "Enable"}
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deletingService === service.id}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          }
                          title="Delete Service"
                          description={`Are you sure you want to delete "${service.name}"? This action cannot be undone.`}
                          confirmText="Delete"
                          onConfirm={() => handleDelete(service.id)}
                          variant="destructive"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Target</p>
                        <p className="font-mono">{service.targetIp}:{service.targetPort}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Entrypoint</p>
                        <p className="font-mono">{service.entrypoint || "default"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Auto Duration</p>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{formatDurationForButton(service.enableDurationMinutes)}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        {service.enabled && service.enabledAt && service.enableDurationMinutes ? (
                          <ServiceCountdown
                            enabledAt={service.enabledAt}
                            durationMinutes={service.enableDurationMinutes}
                            enabled={service.enabled}
                            onExpired={onRefresh}
                          />
                        ) : service.enabled ? (
                          <p className="text-green-600">Running</p>
                        ) : (
                          <p className="text-muted-foreground">Stopped</p>
                        )}
                      </div>
                    </div>

                    {middlewareText && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs text-muted-foreground">Middlewares</p>
                        <p className="break-words font-mono text-xs text-muted-foreground">{middlewareText}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}