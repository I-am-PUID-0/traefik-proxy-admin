import { NextResponse } from "next/server";
import { fetchTraefikApi } from "@/lib/traefik/api-client";

interface TraefikServiceSummary {
  name?: string;
  provider?: string;
  status?: string;
  type?: string;
}

export async function GET() {
  const result = await fetchTraefikApi<TraefikServiceSummary[]>("/api/http/services");

  if (!result.state.configured) {
    return NextResponse.json({ configured: false, error: "TRAEFIK_API_URL is not configured", services: [] });
  }

  if (!result.response?.ok || !Array.isArray(result.data)) {
    return NextResponse.json(
      { configured: true, error: result.error || "Failed to fetch Traefik services", services: [] },
      { status: 502 },
    );
  }

  const services = result.data
    .filter((service) => Boolean(service.name))
    .map((service) => ({
      name: service.name,
      provider: service.provider || service.name?.split("@")[1] || "unknown",
      status: service.status,
      type: service.type,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return NextResponse.json({ configured: true, services });
}
