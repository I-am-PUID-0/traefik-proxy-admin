import { NextResponse } from "next/server";
import { adminAuthEnabled } from "@/lib/admin-auth-shared";
import { getCurrentAdminSession } from "@/lib/admin-auth";

export async function GET() {
  if (!adminAuthEnabled()) {
    return NextResponse.json({ enabled: false, session: null });
  }

  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ enabled: true, session: null }, { status: 401 });
  }

  return NextResponse.json({
    enabled: true,
    session: {
      sub: session.sub,
      name: session.name,
      groups: session.groups,
      role: session.role,
      exp: session.exp,
    },
  });
}
