import { NextRequest, NextResponse } from "next/server";
import { readTraefikAccessLogs } from "@/lib/traefik/access-logs";

export async function GET(request: NextRequest) {
  const result = await readTraefikAccessLogs(request.nextUrl.searchParams.get("limit"));
  return NextResponse.json(result);
}
