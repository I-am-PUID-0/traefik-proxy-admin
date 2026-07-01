import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { generateTraefikConfig } from "@/lib/traefik-config";
import { fetchTraefikApi } from "@/lib/traefik/api-client";

interface LiveRouter {
  name?: string;
  status?: string;
  rule?: string;
  service?: string;
  entryPoints?: string[];
}

interface LiveService {
  name?: string;
  status?: string;
  type?: string;
}

function stripProvider(name: string | undefined): string {
  return (name || "").split("@")[0];
}

function indexByName<T extends { name?: string }>(items: T[] | undefined): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items || []) {
    const name = stripProvider(item.name);
    if (name) map.set(name, item);
  }
  return map;
}

export async function GET() {
  try {
    const generated = await generateTraefikConfig();
    const [routersResult, servicesResult] = await Promise.all([
      fetchTraefikApi<LiveRouter[]>("/api/http/routers"),
      fetchTraefikApi<LiveService[]>("/api/http/services"),
    ]);

    if (!routersResult.state.configured || !servicesResult.state.configured) {
      return NextResponse.json({
        configured: false,
        error: "TRAEFIK_API_URL is not configured",
        routers: [],
        services: [],
        summary: { expected: 0, missing: 0, extra: 0, unhealthy: 0 },
      });
    }

    if (!routersResult.response?.ok || !servicesResult.response?.ok) {
      return NextResponse.json(
        {
          configured: true,
          error: routersResult.error || servicesResult.error || "Failed to fetch live Traefik resources",
          routers: [],
          services: [],
          summary: { expected: 0, missing: 0, extra: 0, unhealthy: 0 },
        },
        { status: 502 },
      );
    }

    const liveRouters = indexByName(routersResult.data);
    const liveServices = indexByName(servicesResult.data);
    const expectedRouters = Object.keys(generated.http.routers || {});
    const expectedServices = Object.keys(generated.http.services || {});

    const routers = [
      ...expectedRouters.map((name) => {
        const live = liveRouters.get(name);
        return {
          name,
          expected: true,
          live: Boolean(live),
          status: live?.status || "missing",
          issue: !live ? "missing" : live.status && live.status !== "enabled" ? "unhealthy" : null,
          generated: generated.http.routers[name],
          observed: live,
        };
      }),
      ...Array.from(liveRouters.entries())
        .filter(([name]) => !expectedRouters.includes(name))
        .map(([name, live]) => ({
          name,
          expected: false,
          live: true,
          status: live.status || "unknown",
          issue: "extra",
          observed: live,
        })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    const services = [
      ...expectedServices.map((name) => {
        const live = liveServices.get(name);
        return {
          name,
          expected: true,
          live: Boolean(live),
          status: live?.status || "missing",
          issue: !live ? "missing" : live.status && live.status !== "enabled" ? "unhealthy" : null,
          generated: generated.http.services[name],
          observed: live,
        };
      }),
      ...Array.from(liveServices.entries())
        .filter(([name]) => !expectedServices.includes(name))
        .map(([name, live]) => ({
          name,
          expected: false,
          live: true,
          status: live.status || "unknown",
          issue: "extra",
          observed: live,
        })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    const all = [...routers, ...services];
    const summary = {
      expected: expectedRouters.length + expectedServices.length,
      missing: all.filter((item) => item.issue === "missing").length,
      extra: all.filter((item) => item.issue === "extra").length,
      unhealthy: all.filter((item) => item.issue === "unhealthy").length,
    };

    return NextResponse.json({ configured: true, routers, services, summary });
  } catch (error) {
    logger.error("Error checking Traefik drift:", error);
    return NextResponse.json(
      { error: "Failed to check Traefik drift", routers: [], services: [] },
      { status: 500 },
    );
  }
}
