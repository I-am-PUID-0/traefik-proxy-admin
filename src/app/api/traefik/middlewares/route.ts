import { NextResponse } from "next/server";
import { fetchTraefikApi } from "@/lib/traefik/api-client";

interface TraefikMiddlewareSummary {
  name?: string;
  provider?: string;
  type?: string;
  status?: string;
}

export interface AvailableMiddleware {
  name: string;
  provider: string;
  type?: string;
  status?: string;
}

function normalizeMiddlewareName(middleware: TraefikMiddlewareSummary): AvailableMiddleware | null {
  if (!middleware.name) {
    return null;
  }

  const provider = middleware.provider || middleware.name.split("@")[1] || "unknown";
  const name = middleware.name.includes("@") ? middleware.name : `${middleware.name}@${provider}`;

  return {
    name,
    provider,
    type: middleware.type,
    status: middleware.status,
  };
}

export async function GET() {
  const result = await fetchTraefikApi<TraefikMiddlewareSummary[]>("/api/http/middlewares");

  if (!result.state.configured) {
    return NextResponse.json({
      configured: false,
      error: "TRAEFIK_API_URL is not configured",
      middlewares: [],
    });
  }

  if (!result.response?.ok || !Array.isArray(result.data)) {
    return NextResponse.json(
      { configured: true, error: result.error || "Failed to fetch Traefik middlewares", middlewares: [] },
      { status: 502 },
    );
  }

  const normalized = result.data
    .map(normalizeMiddlewareName)
    .filter((middleware): middleware is AvailableMiddleware => middleware !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ configured: true, middlewares: normalized });
}
