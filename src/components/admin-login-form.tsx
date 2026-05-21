"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminAuthStatus {
  enabled: boolean;
  provider: "local" | "sso";
  allowLocalFallback: boolean;
  hasLocalUsers: boolean;
}

export function AdminLoginForm({
  initialStatus,
  returnTo,
  initialShowPasswords = false,
}: {
  initialStatus: AdminAuthStatus;
  returnTo: string;
  initialShowPasswords?: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(initialShowPasswords);
  const [showConfirmPassword, setShowConfirmPassword] = useState(initialShowPasswords);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLocalAccount, setShowLocalAccount] = useState(initialStatus.provider === "local");

  async function submitLocal(endpoint: string, setupMode: boolean) {
    setError(null);
    if (setupMode && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Authentication failed");
      }
      router.replace(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  if (!initialStatus.enabled) {
    return (
      <LoginShell>
        <p className="text-sm text-muted-foreground">Admin authentication is disabled for this deployment.</p>
        <Button onClick={() => router.replace(returnTo)}>Continue</Button>
      </LoginShell>
    );
  }

  const setupMode = !initialStatus.hasLocalUsers;
  const showSsoLogin = initialStatus.provider === "sso";
  const showLocalLogin = initialStatus.provider === "local" || (initialStatus.allowLocalFallback && initialStatus.hasLocalUsers);
  const showLocalForm = showLocalLogin && (!showSsoLogin || showLocalAccount);

  if (showSsoLogin && !showLocalLogin) {
    return (
      <LoginShell>
        <SsoLoginButton returnTo={returnTo} />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </LoginShell>
    );
  }

  if (!showLocalLogin) {
    return (
      <LoginShell>
        <p className="text-sm text-muted-foreground">Local account sign-in is not available because no local admin users exist.</p>
        <SsoLoginButton returnTo={returnTo} />
      </LoginShell>
    );
  }
  const localEndpoint = setupMode ? "/api/auth/admin/local/setup" : "/api/auth/admin/local/login";
  return (
    <LoginShell description={setupMode ? "Create the first local admin account." : showSsoLogin ? "Sign in with SSO or a local admin account." : "Sign in with a local admin account."}>
      {showSsoLogin && (
        <div className="space-y-3">
          <SsoLoginButton returnTo={returnTo} />
          <Button type="button" variant="outline" className="w-full" onClick={() => setShowLocalAccount((value) => !value)}>
            {showLocalAccount ? "Hide local account" : "Use local account"}
          </Button>
        </div>
      )}
      {showLocalForm && (
      <form
        id="admin-local-login"
        name="admin-local-login"
        autoComplete="on"
        className="space-y-4"
        method="post"
        action={localEndpoint}
        onSubmit={(event) => {
          event.preventDefault();
          submitLocal(localEndpoint, setupMode);
        }}
      >
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={setupMode ? "new-password" : "current-password"}
            value={password}
            visible={showPassword}
            onVisibleChange={setShowPassword}
            onChange={setPassword}
          />
          {setupMode && <p className="text-xs text-muted-foreground">Use at least 12 characters.</p>}
        </div>
        {setupMode && (
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <PasswordInput
              id="confirm-password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              visible={showConfirmPassword}
              onVisibleChange={setShowConfirmPassword}
              onChange={setConfirmPassword}
            />
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Working..." : setupMode ? "Create admin account" : "Sign in"}
        </Button>
      </form>
      )}
    </LoginShell>
  );
}

function SsoLoginButton({ returnTo }: { returnTo: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Sign in with the configured SSO provider.</p>
      <Button asChild className="w-full">
        <a href={`/api/auth/admin/login?returnTo=${encodeURIComponent(returnTo)}`}>Continue with SSO</a>
      </Button>
    </div>
  );
}

function PasswordInput({
  id,
  name,
  autoComplete,
  value,
  visible,
  onVisibleChange,
  onChange,
}: {
  id: string;
  name: string;
  autoComplete: string;
  value: string;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          onVisibleChange(!visible);
        }}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function LoginShell({ children, description = "Authentication is required to manage Traefik Proxy Admin." }: { children: React.ReactNode; description?: string }) {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-600 text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Traefik Admin</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
