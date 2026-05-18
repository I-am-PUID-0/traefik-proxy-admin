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

  const fetchMiddlewares = useCallback(async () => {
    try {
      const response = await fetch("/api/traefik/middlewares");
      if (!response.ok) {
        setMiddlewares([]);
        return;
      }

      const data = await response.json();
      setMiddlewares(Array.isArray(data.middlewares) ? data.middlewares : []);
    } catch (error) {
      console.error("Error fetching Traefik middlewares:", error);
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
    fetchMiddlewares,
  };
}
