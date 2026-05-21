import { AdminLoginForm } from "@/components/admin-login-form";
import { getAdminAuthConfig } from "@/lib/admin-auth";
import { adminAuthEnabled } from "@/lib/admin-auth-shared";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; showPassword?: string }> }) {
  const params = await searchParams;
  const config = await getAdminAuthConfig();

  return (
    <AdminLoginForm
      initialStatus={{
        enabled: adminAuthEnabled(),
        provider: config.provider,
        allowLocalFallback: config.allowLocalFallback,
        hasLocalUsers: config.localUsers.length > 0,
      }}
      returnTo={safeReturnTo(params.returnTo || "/")}
      initialShowPasswords={params.showPassword === "1"}
    />
  );
}

function safeReturnTo(returnTo: string) {
  return returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
}
