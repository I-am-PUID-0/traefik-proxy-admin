import { NextResponse } from "next/server";
import { fetchTraefikApi, getTraefikApiState } from "@/lib/traefik/api-client";

interface TraefikVersionResponse {
  Version?: string;
  Codename?: string;
  GoVersion?: string;
  Os?: string;
  Arch?: string;
}

export async function GET() {
  const state = getTraefikApiState();

  if (!state.configured) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      fallback: false,
      error: "TRAEFIK_API_URL is not configured",
    });
  }

  const result = await fetchTraefikApi<TraefikVersionResponse>("/api/version");

  return NextResponse.json({
    configured: true,
    reachable: Boolean(result.response?.ok),
    fallback: result.state.fallback,
    apiUrl: result.state.apiUrl,
    version: result.data?.Version,
    codename: result.data?.Codename,
    goVersion: result.data?.GoVersion,
    os: result.data?.Os,
    arch: result.data?.Arch,
    error: result.error,
  }, { status: result.response?.ok || !result.error ? 200 : 502 });
}
