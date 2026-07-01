import { NextRequest, NextResponse } from "next/server";
import { createLocalAdminUser, getAdminAuthConfig } from "@/lib/admin-auth";
import type { AdminRole } from "@/lib/admin-auth-shared";
import { bodyErrorResponse, readJsonBody, RequestBodyError } from "@/lib/request-guards";

export async function GET() {
  const config = await getAdminAuthConfig();
  return NextResponse.json({ users: redactUsers(config.localUsers) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{ username?: string; password?: string; role?: AdminRole }>(request);
    const user = await createLocalAdminUser(body.username || "", body.password || "", sanitizeRole(body.role));
    return NextResponse.json({ user: redactUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return bodyErrorResponse(error);
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create local admin user" }, { status: 400 });
  }
}

function sanitizeRole(role: unknown): AdminRole {
  return role === "viewer" || role === "editor" || role === "admin" ? role : "viewer";
}

function redactUsers(users: Array<{ username: string; role: AdminRole; disabled: boolean }>) {
  return users.map(redactUser);
}

function redactUser(user: { username: string; role: AdminRole; disabled: boolean }) {
  return { username: user.username, role: user.role, disabled: user.disabled };
}
