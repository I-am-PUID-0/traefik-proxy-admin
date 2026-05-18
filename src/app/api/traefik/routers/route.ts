import { NextResponse } from "next/server";
import { fetchTraefikApi } from "@/lib/traefik/api-client";

interface TraefikRouterSummary {
  name?: string;
  provider?: string;
  rule?: string;
  service?: string;
  status?: string;
  entryPoints?: string[];
  middlewares?: string[];
}

export async function GET() {
  const result = await fetchTraefikApi<TraefikRouterSummary[]>("/api/http/routers");

  if (!result.state.configured) {
    return NextResponse.json({ configured: false, error: "TRAEFIK_API_URL is not configured", routers: [] });
  }

  if (!result.response?.ok || !Array.isArray(result.data)) {
    return NextResponse.json(
      { configured: true, error: result.error || "Failed to fetch Traefik routers", routers: [] },
      { status: 502 },
    );
  }

  const routers = result.data
    .filter((router) => Boolean(router.name))
    .map((router) => ({
      name: router.name,
      provider: router.provider || router.name?.split("@")[1] || "unknown",
      rule: router.rule,
      service: router.service,
      status: router.status,
      entryPoints: router.entryPoints || [],
      middlewares: router.middlewares || [],
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return NextResponse.json({ configured: true, routers });
}
