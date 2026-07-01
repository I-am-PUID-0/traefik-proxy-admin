import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthConfig, updateAdminAuthConfig, type AdminAuthConfig } from "@/lib/admin-auth";
import { bodyErrorResponse, readJsonBody, RequestBodyError } from "@/lib/request-guards";

export async function GET() {
  return NextResponse.json(redact(await getAdminAuthConfig()));
}

export async function PUT(request: NextRequest) {
  try {
    const current = await getAdminAuthConfig();
    const payload = await readJsonBody<Partial<AdminAuthConfig>>(request);
    const nextConfig: AdminAuthConfig = {
      ...current,
      provider: payload.provider === "sso" ? "sso" : payload.provider === "local" ? "local" : current.provider,
      allowLocalFallback: Boolean(payload.allowLocalFallback),
      sessionDurationHours: payload.sessionDurationHours ?? current.sessionDurationHours,
      roles: payload.roles ?? current.roles,
      localUsers: current.localUsers,
    };

    await updateAdminAuthConfig(nextConfig);
    return NextResponse.json(redact(await getAdminAuthConfig()));
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return bodyErrorResponse(error);
    }

    return NextResponse.json({ error: "Unable to update admin auth config" }, { status: 500 });
  }
}

function redact(config: AdminAuthConfig) {
  return {
    ...config,
    localUsers: config.localUsers.map((user) => ({
      username: user.username,
      role: user.role,
      disabled: user.disabled,
    })),
  };
}
