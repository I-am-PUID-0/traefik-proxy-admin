import { NextResponse } from "next/server";
import { getAdminAuthConfig } from "@/lib/admin-auth";
import { adminAuthEnabled } from "@/lib/admin-auth-shared";

export async function GET() {
  const config = await getAdminAuthConfig();
  return NextResponse.json({
    enabled: adminAuthEnabled(),
    provider: config.provider,
    hasLocalUsers: config.localUsers.length > 0,
    sessionDurationHours: config.sessionDurationHours,
  });
}
