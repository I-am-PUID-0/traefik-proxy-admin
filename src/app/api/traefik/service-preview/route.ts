import { NextRequest, NextResponse } from "next/server";
import { previewServiceConfig } from "@/lib/traefik/service-preview";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const preview = await previewServiceConfig(body);
    return NextResponse.json(preview);
  } catch (error) {
    console.error("Error previewing service Traefik config:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview service config" },
      { status: 400 },
    );
  }
}
