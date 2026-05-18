import { NextResponse } from "next/server";
import { fetchTraefikApi } from "@/lib/traefik/api-client";

interface TraefikEntrypointSummary {
  name?: string;
  address?: string;
}

export interface AvailableEntrypoint {
  name: string;
  address?: string;
}

export async function GET() {
  const result = await fetchTraefikApi<TraefikEntrypointSummary[]>("/api/entrypoints");

  if (!result.state.configured) {
    return NextResponse.json({
      configured: false,
      error: "TRAEFIK_API_URL is not configured",
      entrypoints: [],
    });
  }

  if (!result.response?.ok || !Array.isArray(result.data)) {
    return NextResponse.json(
      { configured: true, error: result.error || "Failed to fetch Traefik entrypoints", entrypoints: [] },
      { status: 502 },
    );
  }

  const entrypoints = result.data
    .filter((entrypoint): entrypoint is TraefikEntrypointSummary & { name: string } => Boolean(entrypoint.name))
    .map((entrypoint) => ({
      name: entrypoint.name,
      address: entrypoint.address,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ configured: true, entrypoints });
}
