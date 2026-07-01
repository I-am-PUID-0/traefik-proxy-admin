import { NextResponse } from "next/server";
import { adminAuthEnabled } from "@/lib/admin-auth-shared";
import { getCurrentAdminSession } from "@/lib/admin-auth";

function sessionResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function GET() {
  if (!adminAuthEnabled()) {
    return sessionResponse({ enabled: false, session: null });
  }

  const session = await getCurrentAdminSession();
  if (!session) {
    return sessionResponse({ enabled: true, session: null }, { status: 401 });
  }

  return sessionResponse({
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
