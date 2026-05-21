"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AdminRole } from "@/lib/admin-auth-shared";
import { SSO_PROVIDER_PRESETS, getSsoProviderPreset, type SsoProviderPresetId } from "@/lib/sso-provider-presets";

type AdminAuthProvider = "local" | "sso";

type RoleRule = {
  users: string[];
  groups: string[];
};

type LocalAdminUser = {
  username: string;
  role: AdminRole;
  disabled: boolean;
};

type AdminAuthConfigResponse = {
  enabled: boolean;
  provider: AdminAuthProvider;
  allowLocalFallback: boolean;
  sessionDurationHours: number;
  roles: Record<AdminRole, RoleRule>;
  localUsers: LocalAdminUser[];
};

type GlobalSsoConfigResponse = {
  enabled: boolean;
  idpUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  hasClientSecret: boolean;
};

type GlobalSsoForm = Omit<GlobalSsoConfigResponse, "scopes" | "hasClientSecret"> & {
  scopes: string;
  hasClientSecret: boolean;
};

type SsoCheckResult = {
  ok: boolean;
  errors: string[];
  probes?: Array<{ label: string; url: string; reachable: boolean; status?: number; error?: string }>;
};

const ROLES: AdminRole[] = ["viewer", "editor", "admin"];

export function AdminAuthPanel() {
  const [config, setConfig] = useState<AdminAuthConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", confirmPassword: "", role: "viewer" as AdminRole });
  const [userEdits, setUserEdits] = useState<Record<string, { password: string; confirmPassword: string; role: AdminRole; disabled: boolean }>>({});
  const [globalSso, setGlobalSso] = useState<GlobalSsoForm | null>(null);
  const [savingGlobalSso, setSavingGlobalSso] = useState(false);
  const [showGlobalSsoSecret, setShowGlobalSsoSecret] = useState(false);
  const [revealingGlobalSsoSecret, setRevealingGlobalSsoSecret] = useState(false);
  const [checkingGlobalSso, setCheckingGlobalSso] = useState(false);
  const [startingGlobalSsoTest, setStartingGlobalSsoTest] = useState(false);
  const [globalSsoCheckResult, setGlobalSsoCheckResult] = useState<SsoCheckResult | null>(null);
  const [globalSsoPreset, setGlobalSsoPreset] = useState<SsoProviderPresetId>("custom");

  useEffect(() => {
    fetchConfig();
  }, []);

  const localUsers = config?.localUsers || [];
  const roleHelp = useMemo(
    () => ({
      viewer: "Can inspect services and config without making changes.",
      editor: "Can create and update services, imports, and other non-admin resources.",
      admin: "Can manage security, sessions, global config, users, and auth settings.",
    }),
    [],
  );

  async function fetchConfig() {
    setLoading(true);
    setError(null);
    try {
      const [response, ssoResponse] = await Promise.all([
        fetch("/api/auth/admin/config"),
        fetch("/api/auth/admin/sso-config"),
      ]);
      const payload = await response.json();
      const ssoPayload = await ssoResponse.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load admin auth config");
      if (!ssoResponse.ok) throw new Error(ssoPayload.error || "Unable to load admin SSO config");
      setConfig(normalizeConfig(payload));
      setGlobalSso(normalizeGlobalSso(ssoPayload));
      setShowGlobalSsoSecret(false);
      setGlobalSsoPreset("custom");
      setGlobalSsoCheckResult(null);
      setUserEdits(
        Object.fromEntries(
          (payload.localUsers || []).map((user: LocalAdminUser) => [
            user.username,
            { password: "", confirmPassword: "", role: user.role, disabled: user.disabled },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin auth config");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          allowLocalFallback: config.allowLocalFallback,
          sessionDurationHours: config.sessionDurationHours,
          roles: config.roles,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save admin auth config");
      setConfig(normalizeConfig(payload));
      setMessage("Admin authentication settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save admin auth config");
    } finally {
      setSaving(false);
    }
  }

  function applyGlobalSsoPreset(presetId: SsoProviderPresetId) {
    if (!globalSso) return;
    setGlobalSsoPreset(presetId);
    const preset = getSsoProviderPreset(presetId);
    if (presetId === "custom") return;
    setGlobalSso({
      ...globalSso,
      idpUrl: preset.values.idpUrl ?? globalSso.idpUrl,
      authorizationUrl: preset.values.authorizationUrl ?? globalSso.authorizationUrl,
      tokenUrl: preset.values.tokenUrl ?? globalSso.tokenUrl,
      userinfoUrl: preset.values.userinfoUrl ?? globalSso.userinfoUrl,
      scopes: preset.values.scopes ?? globalSso.scopes,
    });
    setGlobalSsoCheckResult(null);
    setError(null);
  }

  async function revealGlobalSsoSecret() {
    setRevealingGlobalSsoSecret(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/admin/sso-config?includeSecret=true");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to reveal admin SSO secret");
      if (!payload.clientSecret) throw new Error("No stored client secret is available.");
      setGlobalSso(normalizeGlobalSso(payload));
      setShowGlobalSsoSecret(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reveal admin SSO secret");
    } finally {
      setRevealingGlobalSsoSecret(false);
    }
  }

  function globalSsoPayload() {
    if (!globalSso) return null;
    return {
      ...globalSso,
      scopes: splitSpaceList(globalSso.scopes),
    };
  }

  async function checkGlobalSsoConfig() {
    const payload = globalSsoPayload();
    if (!payload) return;
    setCheckingGlobalSso(true);
    setError(null);
    setMessage(null);
    setGlobalSsoCheckResult(null);
    try {
      const response = await fetch("/api/auth/sso/test/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to check SSO provider");
      setGlobalSsoCheckResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to check SSO provider");
    } finally {
      setCheckingGlobalSso(false);
    }
  }

  async function startGlobalSsoTest() {
    const payload = globalSsoPayload();
    if (!payload) return;
    setStartingGlobalSsoTest(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/sso/test/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload, roleConfig: { roles: config?.roles } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details?.join(", ") || result.error || "Unable to start SSO login test");
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start SSO login test");
    } finally {
      setStartingGlobalSsoTest(false);
    }
  }

  async function saveGlobalSsoConfig() {
    if (!globalSso) return;
    setSavingGlobalSso(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/admin/sso-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...globalSso,
          scopes: splitSpaceList(globalSso.scopes),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details?.join(", ") || payload.error || "Unable to save admin SSO provider");
      setGlobalSso(normalizeGlobalSso(payload));
      setMessage("Global admin SSO provider saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save admin SSO provider");
    } finally {
      setSavingGlobalSso(false);
    }
  }

  async function addUser() {
    setError(null);
    setMessage(null);
    if (newUser.password !== newUser.confirmPassword) {
      setError("New user passwords do not match.");
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUser.username, password: newUser.password, role: newUser.role }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to add local admin user");
      setNewUser({ username: "", password: "", confirmPassword: "", role: "viewer" });
      setMessage("Local admin user added.");
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add local admin user");
    }
  }

  async function saveUser(username: string) {
    const edit = userEdits[username];
    if (!edit) return;
    setError(null);
    setMessage(null);
    if (edit.password && edit.password !== edit.confirmPassword) {
      setError(`Passwords for ${username} do not match.`);
      return;
    }

    try {
      const response = await fetch(`/api/auth/admin/users/${encodeURIComponent(username)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: edit.password || undefined, role: edit.role, disabled: edit.disabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update local admin user");
      setMessage(`Updated ${username}.`);
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update local admin user");
    }
  }

  async function deleteUser(username: string) {
    if (!window.confirm(`Delete local admin user ${username}?`)) return;
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/auth/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to delete local admin user");
      setMessage(`Deleted ${username}.`);
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete local admin user");
    }
  }

  function updateRoleRule(role: AdminRole, field: keyof RoleRule, value: string) {
    if (!config) return;
    setConfig({
      ...config,
      roles: {
        ...config.roles,
        [role]: {
          ...config.roles[role],
          [field]: splitList(value),
        },
      },
    });
  }

  function updateUserEdit(username: string, updates: Partial<{ password: string; confirmPassword: string; role: AdminRole; disabled: boolean }>) {
    setUserEdits((current) => ({
      ...current,
      [username]: {
        ...(current[username] || { password: "", confirmPassword: "", role: "viewer" as AdminRole, disabled: false }),
        ...updates,
      },
    }));
  }

  if (loading) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Loading admin authentication...</CardContent></Card>;
  }

  if (!config) {
    return <Card><CardContent className="pt-6 text-sm text-red-500">{error || "Unable to load admin authentication."}</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Admin Authentication</CardTitle>
            <CardDescription>Manage TPA web UI and admin API access.</CardDescription>
          </div>
          <Badge variant={config.enabled ? "default" : "outline"}>{config.enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[240px_180px_auto] md:items-end">
          <div className="space-y-2">
            <Label>Admin provider</Label>
            <Select value={config.provider} onValueChange={(value) => setConfig({ ...config, provider: value as AdminAuthProvider })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local users</SelectItem>
                <SelectItem value="sso">SSO/OIDC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-session-duration">Session hours</Label>
            <Input
              id="admin-session-duration"
              type="number"
              min={1}
              max={168}
              value={config.sessionDurationHours}
              onChange={(event) => setConfig({ ...config, sessionDurationHours: Number(event.target.value) || 8 })}
            />
          </div>
          <Button onClick={saveConfig} disabled={saving}>{saving ? "Saving..." : "Save auth settings"}</Button>
        </div>
        {config.provider === "sso" && (
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch checked={config.allowLocalFallback} onCheckedChange={(allowLocalFallback) => setConfig({ ...config, allowLocalFallback })} />
            <div>
              <Label>Allow local account sign-in</Label>
              <p className="text-sm text-muted-foreground">Keep local admin login available when SSO is selected. This is useful as a break-glass path if the identity provider is unavailable or misconfigured.</p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

        {config.provider === "local" ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Local Admin Users</h3>
              <p className="text-sm text-muted-foreground">Create users, change roles, disable access, or set a new password.</p>
            </div>

            <div className="space-y-3">
              {localUsers.map((user) => {
                const edit = userEdits[user.username] || { password: "", confirmPassword: "", role: user.role, disabled: user.disabled };
                return (
                  <div key={user.username} className="rounded-md border p-4 space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{user.username}</div>
                        <div className="text-xs text-muted-foreground">{user.disabled ? "Disabled" : "Active"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{user.role}</Badge>
                        <Button variant="destructive" size="sm" onClick={() => deleteUser(user.username)}>Delete</Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4 md:items-end">
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <RoleSelect value={edit.role} onChange={(role) => updateUserEdit(user.username, { role })} />
                      </div>
                      <div className="space-y-2">
                        <Label>New password</Label>
                        <Input type="password" autoComplete="new-password" value={edit.password} onChange={(event) => updateUserEdit(user.username, { password: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Confirm password</Label>
                        <Input type="password" autoComplete="new-password" value={edit.confirmPassword} onChange={(event) => updateUserEdit(user.username, { confirmPassword: event.target.value })} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={edit.disabled} onCheckedChange={(disabled) => updateUserEdit(user.username, { disabled })} />
                          <Label>Disabled</Label>
                        </div>
                        <Button size="sm" onClick={() => saveUser(user.username)}>Save</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Add local user</h4>
              <div className="grid gap-3 md:grid-cols-5 md:items-end">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input autoComplete="username" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" autoComplete="new-password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Confirm password</Label>
                  <Input type="password" autoComplete="new-password" value={newUser.confirmPassword} onChange={(event) => setNewUser({ ...newUser, confirmPassword: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <RoleSelect value={newUser.role} onChange={(role) => setNewUser({ ...newUser, role })} />
                </div>
                <Button onClick={addUser}>Add user</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {globalSso && (
              <div className="rounded-md border p-4 space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Global Admin SSO Provider</h3>
                  <p className="text-sm text-muted-foreground">Used for TPA admin SSO login and as the legacy fallback for service SSO rules without a selected provider.</p>
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Provider preset</p>
                    <p>Select a preset to fill known provider endpoints. Client ID, client secret, and redirect URI still come from your OAuth app registration.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Provider preset</Label>
                  <Select value={globalSsoPreset} onValueChange={(value) => applyGlobalSsoPreset(value as SsoProviderPresetId)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SSO_PROVIDER_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{getSsoProviderPreset(globalSsoPreset).description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={globalSso.enabled} onCheckedChange={(enabled) => setGlobalSso({ ...globalSso, enabled })} />
                  <Label>Provider enabled</Label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input value={globalSso.clientId} onChange={(event) => setGlobalSso({ ...globalSso, clientId: event.target.value })} />
                    <p className="text-xs text-muted-foreground">The OAuth/OIDC application ID from your provider.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Client secret</Label>
                    <div className="flex gap-2">
                      <Input type={showGlobalSsoSecret ? "text" : "password"} placeholder={globalSso.hasClientSecret ? "Keep existing secret" : "Provider client secret"} value={globalSso.clientSecret || ""} onChange={(event) => setGlobalSso({ ...globalSso, clientSecret: event.target.value })} />
                      {globalSso.hasClientSecret && !globalSso.clientSecret && (
                        <Button type="button" variant="outline" onClick={revealGlobalSsoSecret} disabled={revealingGlobalSsoSecret}>
                          {revealingGlobalSsoSecret ? "Revealing..." : "Reveal"}
                        </Button>
                      )}
                      {globalSso.clientSecret && (
                        <Button type="button" variant="outline" onClick={() => setShowGlobalSsoSecret((value) => !value)}>
                          {showGlobalSsoSecret ? "Hide" : "Show"}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Blank keeps the current stored secret. Reveal loads the saved value for inspection or rotation.</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Redirect URI</Label>
                    <Input value={globalSso.redirectUri} onChange={(event) => setGlobalSso({ ...globalSso, redirectUri: event.target.value })} placeholder="https://tpa.example.com/api/auth/sso/callback" />
                    <p className="text-xs text-muted-foreground">Must exactly match the callback URL registered with the provider.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <Input value={globalSso.scopes} onChange={(event) => setGlobalSso({ ...globalSso, scopes: event.target.value })} placeholder="openid profile email groups" />
                    <p className="text-xs text-muted-foreground">Space-separated scopes. Start with <code>openid profile email</code>; add provider-specific group scopes only when role mapping needs groups.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>IdP base URL (optional)</Label>
                  <Input value={globalSso.idpUrl} onChange={(event) => setGlobalSso({ ...globalSso, idpUrl: event.target.value })} placeholder="https://auth.example.com/oauth2" />
                  <p className="text-xs text-muted-foreground">Optional shortcut used as <code>/auth</code>, <code>/token</code>, and <code>/userinfo</code> when explicit endpoint URLs are blank. Leave blank for Google and enter the explicit URLs instead.</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Authorization URL</Label>
                    <Input value={globalSso.authorizationUrl} onChange={(event) => setGlobalSso({ ...globalSso, authorizationUrl: event.target.value })} placeholder="https://accounts.google.com/o/oauth2/v2/auth" />
                    <p className="text-xs text-muted-foreground">Browser redirect endpoint where login starts.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Token URL</Label>
                    <Input value={globalSso.tokenUrl} onChange={(event) => setGlobalSso({ ...globalSso, tokenUrl: event.target.value })} placeholder="https://oauth2.googleapis.com/token" />
                    <p className="text-xs text-muted-foreground">Server endpoint used to exchange the callback code for tokens.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Userinfo URL</Label>
                    <Input value={globalSso.userinfoUrl} onChange={(event) => setGlobalSso({ ...globalSso, userinfoUrl: event.target.value })} placeholder="https://openidconnect.googleapis.com/v1/userinfo" />
                    <p className="text-xs text-muted-foreground">Endpoint used to read subject, email, name, and any group claims.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={checkGlobalSsoConfig} disabled={checkingGlobalSso}>
                    {checkingGlobalSso ? "Checking..." : "Check configuration"}
                  </Button>
                  <Button type="button" variant="outline" onClick={startGlobalSsoTest} disabled={startingGlobalSsoTest}>
                    {startingGlobalSsoTest ? "Starting..." : "Test login"}
                  </Button>
                  <Button onClick={saveGlobalSsoConfig} disabled={savingGlobalSso}>{savingGlobalSso ? "Saving..." : "Save global SSO provider"}</Button>
                </div>
                {globalSsoCheckResult && <SsoCheckSummary result={globalSsoCheckResult} />}
              </div>
            )}

            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">SSO Role Mapping</h3>
              <p className="text-sm text-muted-foreground">Map OIDC users or groups into TPA roles. Values are comma-separated.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {ROLES.map((role) => (
                <div key={role} className="rounded-md border p-4 space-y-3">
                  <div>
                    <h4 className="font-medium capitalize text-gray-900 dark:text-gray-100">{role}</h4>
                    <p className="text-xs text-muted-foreground">{roleHelp[role]}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Users</Label>
                    <Textarea value={config.roles[role].users.join(", ")} onChange={(event) => updateRoleRule(role, "users", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Groups</Label>
                    <Textarea value={config.roles[role].groups.join(", ")} onChange={(event) => updateRoleRule(role, "groups", event.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SsoCheckSummary({ result }: { result: SsoCheckResult }) {
  const className = result.ok
    ? "rounded-md border border-green-700/40 bg-green-950/20 p-3 text-sm text-green-700 dark:text-green-300"
    : "rounded-md border border-red-700/40 bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300";
  return (
    <div className={className}>
      <p className="font-medium">{result.ok ? "SSO configuration check passed." : "SSO configuration check found issues."}</p>
      {result.errors?.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {result.errors.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      {result.probes && result.probes.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          {result.probes.map((probe) => (
            <div key={probe.label}>
              <span className="font-medium">{probe.label}:</span> {probe.reachable ? "reachable" : "not reachable"}
              {typeof probe.status === "number" ? " (HTTP " + probe.status + ")" : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function RoleSelect({ value, onChange }: { value: AdminRole; onChange: (role: AdminRole) => void }) {
  return (
    <Select value={value} onValueChange={(role) => onChange(role as AdminRole)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function normalizeGlobalSso(value: GlobalSsoConfigResponse): GlobalSsoForm {
  return {
    enabled: Boolean(value.enabled),
    idpUrl: value.idpUrl || "",
    authorizationUrl: value.authorizationUrl || "",
    tokenUrl: value.tokenUrl || "",
    userinfoUrl: value.userinfoUrl || "",
    clientId: value.clientId || "",
    clientSecret: value.clientSecret || "",
    redirectUri: value.redirectUri || "",
    scopes: (value.scopes || ["openid", "profile", "email"]).join(" "),
    hasClientSecret: Boolean(value.hasClientSecret),
  };
}

function normalizeConfig(value: AdminAuthConfigResponse): AdminAuthConfigResponse {
  return {
    enabled: value.enabled,
    provider: value.provider === "sso" ? "sso" : "local",
    allowLocalFallback: Boolean(value.allowLocalFallback),
    sessionDurationHours: value.sessionDurationHours || 8,
    roles: {
      viewer: { users: value.roles?.viewer?.users || [], groups: value.roles?.viewer?.groups || [] },
      editor: { users: value.roles?.editor?.users || [], groups: value.roles?.editor?.groups || [] },
      admin: { users: value.roles?.admin?.users || [], groups: value.roles?.admin?.groups || [] },
    },
    localUsers: value.localUsers || [],
  };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function splitSpaceList(value: string) {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}
