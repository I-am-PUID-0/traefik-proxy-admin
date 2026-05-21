"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SsoProviderConfig } from "@/components/sso-config-table";
import type { SsoProviderFormData } from "@/hooks/use-sso-configs";

interface SsoConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingConfig: SsoProviderConfig | null;
  onSubmit: (data: SsoProviderFormData) => Promise<void>;
}

interface FormErrors {
  name?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  endpoints?: string;
  scopes?: string;
}

type SsoCheckResult = {
  ok: boolean;
  errors: string[];
  probes?: Array<{ label: string; url: string; reachable: boolean; status?: number; error?: string }>;
};

const emptyForm: SsoProviderFormData = {
  name: "",
  description: "",
  enabled: true,
  idpUrl: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "",
  scopes: "openid profile email",
};

export function SsoConfigDialog({ open, onOpenChange, editingConfig, onSubmit }: SsoConfigDialogProps) {
  const [formData, setFormData] = useState<SsoProviderFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [revealingClientSecret, setRevealingClientSecret] = useState(false);
  const [checkingProvider, setCheckingProvider] = useState(false);
  const [startingLoginTest, setStartingLoginTest] = useState(false);
  const [checkResult, setCheckResult] = useState<SsoCheckResult | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingConfig) {
      setFormData({
        name: editingConfig.name,
        description: editingConfig.description || "",
        enabled: editingConfig.enabled,
        idpUrl: editingConfig.idpUrl || "",
        authorizationUrl: editingConfig.authorizationUrl || "",
        tokenUrl: editingConfig.tokenUrl || "",
        userinfoUrl: editingConfig.userinfoUrl || "",
        clientId: editingConfig.clientId,
        clientSecret: "",
        redirectUri: editingConfig.redirectUri,
        scopes: editingConfig.scopes.join(" "),
      });
    } else {
      setFormData(emptyForm);
    }
    setShowClientSecret(false);
    setCheckResult(null);
    setFormErrors({});
  }, [open, editingConfig]);

  const validateForm = () => {
    const errors: FormErrors = {};
    if (!formData.name.trim()) errors.name = "Name is required";
    if (!formData.clientId.trim()) errors.clientId = "Client ID is required";
    if (!editingConfig && !formData.clientSecret.trim()) errors.clientSecret = "Client secret is required";
    if (!formData.redirectUri.trim()) errors.redirectUri = "Redirect URI is required";
    if (!formData.idpUrl.trim() && (!formData.authorizationUrl.trim() || !formData.tokenUrl.trim() || !formData.userinfoUrl.trim())) {
      errors.endpoints = "Provide either an IdP base URL or all explicit OIDC endpoint URLs.";
    }
    if (formData.scopes.split(/[\s,]+/).filter(Boolean).length === 0) errors.scopes = "At least one scope is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const revealClientSecret = async () => {
    if (!editingConfig) return;
    setRevealingClientSecret(true);
    setFormErrors({});
    try {
      const response = await fetch(`/api/security/sso-configs/${editingConfig.id}?includeSecret=true`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to reveal SSO provider secret");
      if (!payload.clientSecret) throw new Error("No stored client secret is available.");
      setFormData((current) => ({ ...current, clientSecret: payload.clientSecret }));
      setShowClientSecret(true);
    } catch (error) {
      setFormErrors({ clientSecret: error instanceof Error ? error.message : "Unable to reveal SSO provider secret" });
    } finally {
      setRevealingClientSecret(false);
    }
  };

  const formPayload = () => ({
    ...formData,
    scopes: formData.scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
  });

  const checkProvider = async () => {
    setCheckingProvider(true);
    setCheckResult(null);
    setFormErrors({});
    try {
      const response = await fetch("/api/auth/sso/test/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload()),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to check SSO provider");
      setCheckResult(result);
    } catch (error) {
      setFormErrors({ endpoints: error instanceof Error ? error.message : "Unable to check SSO provider" });
    } finally {
      setCheckingProvider(false);
    }
  };

  const startLoginTest = async () => {
    setStartingLoginTest(true);
    setFormErrors({});
    try {
      const response = await fetch("/api/auth/sso/test/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: formPayload() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.details?.join(", ") || result.error || "Unable to start SSO login test");
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFormErrors({ endpoints: error instanceof Error ? error.message : "Unable to start SSO login test" });
    } finally {
      setStartingLoginTest(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save SSO provider:", error);
      setFormErrors({ name: error instanceof Error ? error.message : "Failed to save SSO provider" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editingConfig ? "Edit SSO Provider" : "Add SSO Provider"}</DialogTitle>
            <DialogDescription>
              Create a reusable OAuth/OIDC provider for service-level SSO. Leave the client secret blank when editing to keep the current secret.
            </DialogDescription>
            <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Common values</p>
              <p><span className="font-medium">Google:</span> authorization <code>https://accounts.google.com/o/oauth2/v2/auth</code>, token <code>https://oauth2.googleapis.com/token</code>, userinfo <code>https://openidconnect.googleapis.com/v1/userinfo</code>, scopes <code>openid profile email</code>.</p>
              <p><span className="font-medium">Generic OIDC:</span> enter the client ID/secret, this app&apos;s callback URL, and either explicit endpoint URLs or an IdP base URL only if your provider exposes <code>/auth</code>, <code>/token</code>, and <code>/userinfo</code>.</p>
            </div>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-2">
              <Switch
                id="sso-enabled"
                checked={formData.enabled}
                onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
                disabled={submitting}
              />
              <Label htmlFor="sso-enabled">Provider enabled</Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sso-name">Name</Label>
                <Input id="sso-name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={submitting} />
                <p className="text-xs text-muted-foreground">Friendly name shown when attaching this provider to a service.</p>
                {formErrors.name && <p className="text-sm text-red-600">{formErrors.name}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-client-id">Client ID</Label>
                <Input id="sso-client-id" value={formData.clientId} onChange={(event) => setFormData({ ...formData, clientId: event.target.value })} disabled={submitting} />
                <p className="text-xs text-muted-foreground">OAuth/OIDC application ID from the identity provider.</p>
                {formErrors.clientId && <p className="text-sm text-red-600">{formErrors.clientId}</p>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sso-description">Description (optional)</Label>
              <Input id="sso-description" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} disabled={submitting} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sso-client-secret">Client Secret</Label>
                <div className="flex gap-2">
                  <Input id="sso-client-secret" type={showClientSecret ? "text" : "password"} value={formData.clientSecret} onChange={(event) => setFormData({ ...formData, clientSecret: event.target.value })} placeholder={editingConfig ? "Keep existing secret" : "Provider client secret"} disabled={submitting} />
                  {editingConfig?.hasClientSecret && !formData.clientSecret && (
                    <Button type="button" variant="outline" onClick={revealClientSecret} disabled={submitting || revealingClientSecret}>
                      {revealingClientSecret ? "Revealing..." : "Reveal"}
                    </Button>
                  )}
                  {formData.clientSecret && (
                    <Button type="button" variant="outline" onClick={() => setShowClientSecret((value) => !value)} disabled={submitting}>
                      {showClientSecret ? "Hide" : "Show"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Blank keeps the current stored secret. Reveal loads it for inspection or replacement.</p>
                {formErrors.clientSecret && <p className="text-sm text-red-600">{formErrors.clientSecret}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-redirect-uri">Redirect URI</Label>
                <Input id="sso-redirect-uri" value={formData.redirectUri} onChange={(event) => setFormData({ ...formData, redirectUri: event.target.value })} placeholder="https://tpa.example.com/api/auth/sso/callback" disabled={submitting} />
                <p className="text-xs text-muted-foreground">Must exactly match the callback URL registered with this provider.</p>
                {formErrors.redirectUri && <p className="text-sm text-red-600">{formErrors.redirectUri}</p>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sso-scopes">Scopes</Label>
              <Input id="sso-scopes" value={formData.scopes} onChange={(event) => setFormData({ ...formData, scopes: event.target.value })} placeholder="openid profile email groups" disabled={submitting} />
              <p className="text-xs text-muted-foreground">Space-separated scopes. Start with <code>openid profile email</code>; add group scopes only if your provider returns group claims.</p>
              {formErrors.scopes && <p className="text-sm text-red-600">{formErrors.scopes}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sso-idp-url">IdP Base URL (optional)</Label>
              <Input id="sso-idp-url" value={formData.idpUrl} onChange={(event) => setFormData({ ...formData, idpUrl: event.target.value })} placeholder="https://auth.example.com/oauth2" disabled={submitting} />
              <p className="text-xs text-muted-foreground">Optional shortcut used as <code>/auth</code>, <code>/token</code>, and <code>/userinfo</code> when explicit endpoint URLs are blank. Leave blank for Google and enter explicit URLs.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="sso-authorization-url">Authorization URL</Label>
                <Input id="sso-authorization-url" value={formData.authorizationUrl} onChange={(event) => setFormData({ ...formData, authorizationUrl: event.target.value })} placeholder="https://accounts.google.com/o/oauth2/v2/auth" disabled={submitting} />
                <p className="text-xs text-muted-foreground">Browser redirect endpoint where login starts.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-token-url">Token URL</Label>
                <Input id="sso-token-url" value={formData.tokenUrl} onChange={(event) => setFormData({ ...formData, tokenUrl: event.target.value })} placeholder="https://oauth2.googleapis.com/token" disabled={submitting} />
                <p className="text-xs text-muted-foreground">Server endpoint used to exchange the callback code for tokens.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sso-userinfo-url">Userinfo URL</Label>
                <Input id="sso-userinfo-url" value={formData.userinfoUrl} onChange={(event) => setFormData({ ...formData, userinfoUrl: event.target.value })} placeholder="https://openidconnect.googleapis.com/v1/userinfo" disabled={submitting} />
                <p className="text-xs text-muted-foreground">Endpoint used to read subject, email, name, and any group claims.</p>
              </div>
            </div>
            {formErrors.endpoints && <p className="text-sm text-red-600">{formErrors.endpoints}</p>}
            {checkResult && <SsoCheckSummary result={checkResult} />}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={checkProvider} disabled={submitting || checkingProvider}>
              {checkingProvider ? "Checking..." : "Check configuration"}
            </Button>
            <Button type="button" variant="outline" onClick={startLoginTest} disabled={submitting || startingLoginTest}>
              {startingLoginTest ? "Starting..." : "Test login"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : editingConfig ? "Update" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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