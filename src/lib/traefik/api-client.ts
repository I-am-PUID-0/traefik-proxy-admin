import "server-only";

export interface TraefikApiState {
  configured: boolean;
  apiUrl?: string;
  fallback: boolean;
}

export function getTraefikApiState(): TraefikApiState {
  const configuredUrl = process.env.TRAEFIK_API_URL?.trim();

  if (configuredUrl) {
    return {
      configured: true,
      apiUrl: configuredUrl.replace(/\/$/, ""),
      fallback: false,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      configured: true,
      apiUrl: "http://localhost:8080",
      fallback: true,
    };
  }

  return {
    configured: false,
    fallback: false,
  };
}

export async function fetchTraefikApi<T>(path: string): Promise<{
  state: TraefikApiState;
  response?: Response;
  data?: T;
  error?: string;
}> {
  const state = getTraefikApiState();

  if (!state.configured || !state.apiUrl) {
    return {
      state,
      error: "TRAEFIK_API_URL is not configured",
    };
  }

  try {
    const response = await fetch(`${state.apiUrl}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        state,
        response,
        error: `Traefik API returned ${response.status}`,
      };
    }

    return {
      state,
      response,
      data: await response.json() as T,
    };
  } catch (error) {
    console.error("Error fetching Traefik API:", error);
    return {
      state,
      error: "Failed to connect to Traefik API",
    };
  }
}
