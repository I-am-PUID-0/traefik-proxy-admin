import { useCallback, useEffect, useState } from "react";

export interface AvailableMiddleware {
  name: string;
  provider: string;
  type?: string;
  status?: string;
}

export function useTraefikMiddlewares() {
  const [middlewares, setMiddlewares] = useState<AvailableMiddleware[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMiddlewares = useCallback(async () => {
    try {
      const response = await fetch("/api/traefik/middlewares");
      const data = await response.json().catch(() => ({}));
      setConfigured(data.configured !== false);
      setError(typeof data.error === "string" ? data.error : null);

      if (!response.ok) {
        setMiddlewares([]);
        return;
      }

      setMiddlewares(Array.isArray(data.middlewares) ? data.middlewares : []);
    } catch (error) {
      console.error("Error fetching Traefik middlewares:", error);
      setConfigured(true);
      setError("Failed to fetch Traefik middlewares");
      setMiddlewares([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMiddlewares();
  }, [fetchMiddlewares]);

  return {
    middlewares,
    loading,
    configured,
    error,
    fetchMiddlewares,
  };
}
