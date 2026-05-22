"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ExternalLink,
  RefreshCw,
  Search,
  TimerReset,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CountdownTimer } from "@/components/countdown-timer";

export interface SessionInfo {
  id: string;
  serviceId: string;
  sessionToken: string;
  userIdentifier?: string | null;
  expiresAt: string;
  lastAccessedAt: string;
  createdAt: string;
  serviceName?: string | null;
  subdomain?: string | null;
  hostnameMode?: "subdomain" | "apex" | "custom" | null;
  customHostnames?: string | null;
  domain?: string | null;
}

interface SessionsTableProps {
  sessions: SessionInfo[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (sessionId: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  onExpired: (sessionId: string) => void;
}

type StatusFilter = "all" | "active" | "expired";
type SortOption = "last-desc" | "last-asc" | "created-desc" | "created-asc" | "expires-asc" | "service-asc" | "user-asc";
type PageSize = "25" | "50" | "100" | "all";

const OPAQUE_ID_PATTERN = /^[a-zA-Z0-9_-]{18,}$/;

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function isExpired(session: SessionInfo) {
  return new Date(session.expiresAt) <= new Date();
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function getServiceHost(session: SessionInfo) {
  if (session.hostnameMode === "custom") return parseJsonArray(session.customHostnames)[0] || "";
  if (session.hostnameMode === "apex") return session.domain || "";
  if (session.subdomain && session.domain) return `${session.subdomain}.${session.domain}`;
  return session.subdomain || "";
}

function getUserLabel(session: SessionInfo) {
  const value = session.userIdentifier?.trim();
  if (!value) return "Unknown user";
  if (value.includes("@")) return value;
  if (OPAQUE_ID_PATTERN.test(value)) return `Provider subject ${value.slice(0, 6)}...${value.slice(-4)}`;
  return value;
}

function getUserHint(session: SessionInfo) {
  const value = session.userIdentifier?.trim();
  if (!value) return "No user identifier was stored for this session.";
  if (value.includes("@")) return "Email from SSO provider";
  if (OPAQUE_ID_PATTERN.test(value)) return `Provider subject ID: ${value}`;
  return "User identifier";
}

export function SessionsTable({
  sessions,
  loading,
  onRefresh,
  onDelete,
  onDeleteAll,
  onExpired,
}: SessionsTableProps) {
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("last-desc");
  const [pageSize, setPageSize] = useState<PageSize>("50");

  const sessionStats = useMemo(() => {
    const active = sessions.filter((session) => !isExpired(session)).length;
    const serviceCount = new Set(sessions.map((session) => session.serviceId)).size;
    const userCount = new Set(sessions.map((session) => session.userIdentifier || "unknown")).size;

    return {
      total: sessions.length,
      active,
      expired: sessions.length - active,
      serviceCount,
      userCount,
    };
  }, [sessions]);

  const serviceOptions = useMemo(() => {
    return Array.from(new Map(sessions.map((session) => [session.serviceId, session.serviceName || "Unknown Service"])))
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...sessions]
      .filter((session) => {
        const expired = isExpired(session);
        if (statusFilter === "active" && expired) return false;
        if (statusFilter === "expired" && !expired) return false;
        if (serviceFilter !== "all" && session.serviceId !== serviceFilter) return false;

        if (!normalizedQuery) return true;

        const searchable = [
          session.serviceName,
          getServiceHost(session),
          session.subdomain,
          session.domain,
          session.userIdentifier,
          session.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const serviceCompare = (a.serviceName || "").localeCompare(b.serviceName || "");
        const userCompare = getUserLabel(a).localeCompare(getUserLabel(b));

        switch (sortOption) {
          case "last-asc":
            return new Date(a.lastAccessedAt).getTime() - new Date(b.lastAccessedAt).getTime();
          case "created-desc":
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case "created-asc":
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case "expires-asc":
            return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
          case "service-asc":
            return serviceCompare || userCompare || new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
          case "user-asc":
            return userCompare || serviceCompare || new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
          case "last-desc":
          default:
            return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
        }
      });
  }, [sessions, searchQuery, serviceFilter, sortOption, statusFilter]);

  const visibleSessions = pageSize === "all" ? filteredSessions : filteredSessions.slice(0, Number(pageSize));
  const hiddenByPageSize = filteredSessions.length - visibleSessions.length;
  const hasActiveViewControls = Boolean(searchQuery.trim()) || statusFilter !== "all" || serviceFilter !== "all" || sortOption !== "last-desc" || pageSize !== "50";

  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSession(sessionId);
    try {
      await onDelete(sessionId);
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await onDeleteAll();
    } finally {
      setDeletingAll(false);
    }
  };

  const resetViewControls = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setServiceFilter("all");
    setSortOption("last-desc");
    setPageSize("50");
  };

  const handleStatusFilterChange = (value: string) => {
    if (!value) return;
    setStatusFilter(value as StatusFilter);
  };

  const handleServiceFilterChange = (value: string) => {
    if (!value) return;
    setServiceFilter(value);
  };

  const handleSortOptionChange = (value: string) => {
    if (!value) return;
    setSortOption(value as SortOption);
  };

  const handlePageSizeChange = (value: string) => {
    if (!value) return;
    setPageSize(value as PageSize);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Sessions
          </CardTitle>
          <CardDescription>Loading sessions...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-semibold text-green-600">{sessionStats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Expired</p>
            <p className="text-2xl font-semibold text-red-600">{sessionStats.expired}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{sessionStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Services</p>
            <p className="text-2xl font-semibold">{sessionStats.serviceCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Users</p>
            <p className="text-2xl font-semibold">{sessionStats.userCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Session Inventory
              </CardTitle>
              <CardDescription>
                Review service sessions, users, and expiry windows
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {sessions.length > 0 && (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" disabled={deletingAll} className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete All
                    </Button>
                  }
                  title="Delete All Sessions"
                  description="Are you sure you want to delete all sessions? This will log out all users from all services."
                  confirmText="Delete All"
                  onConfirm={handleDeleteAll}
                  variant="destructive"
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No sessions</h3>
              <p className="text-muted-foreground">No service sessions have been created yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_150px_190px_190px_130px_auto] xl:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search service, user, host, or session ID"
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active only</SelectItem>
                      <SelectItem value="expired">Expired only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={serviceFilter} onValueChange={handleServiceFilterChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All services</SelectItem>
                      {serviceOptions.map(([serviceId, serviceName]) => (
                        <SelectItem key={serviceId} value={serviceId}>{serviceName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortOption} onValueChange={handleSortOptionChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last-desc">Last access newest</SelectItem>
                      <SelectItem value="last-asc">Last access oldest</SelectItem>
                      <SelectItem value="created-desc">Created newest</SelectItem>
                      <SelectItem value="created-asc">Created oldest</SelectItem>
                      <SelectItem value="expires-asc">Expires soonest</SelectItem>
                      <SelectItem value="service-asc">Service A-Z</SelectItem>
                      <SelectItem value="user-asc">User A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={pageSize} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Show" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">Show 25</SelectItem>
                      <SelectItem value="50">Show 50</SelectItem>
                      <SelectItem value="100">Show 100</SelectItem>
                      <SelectItem value="all">Show all</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={resetViewControls} disabled={!hasActiveViewControls} className="justify-center">
                    <TimerReset className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Showing {visibleSessions.length} of {filteredSessions.length} matching sessions</span>
                  {hiddenByPageSize > 0 && <Badge variant="secondary">{hiddenByPageSize} hidden by page size</Badge>}
                  {sortOption === "service-asc" && <ArrowDownAZ className="h-4 w-4" />}
                  {sortOption === "user-asc" && <ArrowUpAZ className="h-4 w-4" />}
                </div>
              </div>

              {visibleSessions.length === 0 ? (
                <div className="rounded-md border border-dashed py-10 text-center">
                  <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No matching sessions</p>
                  <p className="text-sm text-muted-foreground">Clear the search or filters to widen the list.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleSessions.map((session) => {
                    const expired = isExpired(session);
                    const serviceHost = getServiceHost(session);
                    const userLabel = getUserLabel(session);
                    const userHint = getUserHint(session);

                    return (
                      <div
                        key={session.id}
                        className={`rounded-md border p-4 transition-colors ${expired ? "bg-muted/30 opacity-75" : "bg-background hover:bg-muted/30"}`}
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words text-base font-semibold">{session.serviceName || "Unknown Service"}</h3>
                              <Badge variant={expired ? "secondary" : "default"}>{expired ? "Expired" : "Active"}</Badge>
                              <Badge variant="outline" title={userHint}>
                                <User className="mr-1 h-3 w-3" />
                                <span className="max-w-[260px] truncate">{userLabel}</span>
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              {serviceHost ? (
                                <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">{serviceHost}</code>
                              ) : (
                                <span>No service hostname</span>
                              )}
                              <span className="font-mono text-xs">{session.id}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            {serviceHost && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Open service"
                                onClick={() => window.open(`https://${serviceHost}`, "_blank", "noopener,noreferrer")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <ConfirmDialog
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={deletingSession === session.id}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              }
                              title="Delete Session"
                              description="Are you sure you want to delete this session? The user will be logged out."
                              confirmText="Delete"
                              onConfirm={() => handleDeleteSession(session.id)}
                              variant="destructive"
                            />
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Created</p>
                            <p>{formatDate(session.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Last Access</p>
                            <p>{formatDate(session.lastAccessedAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{expired ? "Expired" : "Expires"}</p>
                            {expired ? (
                              <p className="text-red-600">{formatDate(session.expiresAt)}</p>
                            ) : (
                              <CountdownTimer expiresAt={session.expiresAt} onExpired={() => onExpired(session.id)} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
