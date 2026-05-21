import { NextRequest, NextResponse } from "next/server";
import { deleteLocalAdminUser, updateLocalAdminUser } from "@/lib/admin-auth";
import type { AdminRole } from "@/lib/admin-auth-shared";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    const body = (await request.json()) as { password?: string; role?: AdminRole; disabled?: boolean };
    const user = await updateLocalAdminUser(decodeURIComponent(username), {
      password: body.password || undefined,
      role: sanitizeRole(body.role),
      disabled: typeof body.disabled === "boolean" ? body.disabled : undefined,
    });
    return NextResponse.json({ user: redactUser(user) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update local admin user" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;
    await deleteLocalAdminUser(decodeURIComponent(username));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete local admin user" }, { status: 400 });
  }
}

function sanitizeRole(role: unknown): AdminRole | undefined {
  return role === "viewer" || role === "editor" || role === "admin" ? role : undefined;
}

function redactUser(user: { username: string; role: AdminRole; disabled: boolean }) {
  return { username: user.username, role: user.role, disabled: user.disabled };
}
