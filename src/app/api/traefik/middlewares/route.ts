import { NextResponse } from "next/server";

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
  const traefikApiUrl = process.env.TRAEFIK_API_URL || (
    process.env.NODE_ENV === "production" ? undefined : "http://localhost:8080"
  );

  if (!traefikApiUrl) {
    return NextResponse.json({
      configured: false,
      error: "TRAEFIK_API_URL is not configured",
      middlewares: [],
    });
  }

  try {
    const response = await fetch(`${traefikApiUrl}/api/http/middlewares`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { configured: true, error: "Failed to fetch Traefik middlewares", middlewares: [] },
        { status: 502 },
      );
    }

    const middlewares = await response.json() as TraefikMiddlewareSummary[];
    const normalized = middlewares
      .map(normalizeMiddlewareName)
      .filter((middleware): middleware is AvailableMiddleware => middleware !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ configured: true, middlewares: normalized });
  } catch (error) {
    console.error("Error fetching Traefik middlewares:", error);
    return NextResponse.json(
      { configured: true, error: "Failed to connect to Traefik API", middlewares: [] },
      { status: 502 },
    );
  }
}
