import { useCallback, useEffect, useState } from "react";

export interface AvailableEntrypoint {
  name: string;
  address?: string;
}

export function useTraefikEntrypoints() {
  const [entrypoints, setEntrypoints] = useState<AvailableEntrypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntrypoints = useCallback(async () => {
    try {
      const response = await fetch("/api/traefik/entrypoints");
      const data = await response.json().catch(() => ({}));
      setConfigured(data.configured !== false);
      setError(typeof data.error === "string" ? data.error : null);

      if (!response.ok) {
        setEntrypoints([]);
        return;
      }

      setEntrypoints(Array.isArray(data.entrypoints) ? data.entrypoints : []);
    } catch (error) {
      console.error("Error fetching Traefik entrypoints:", error);
      setConfigured(true);
      setError("Failed to fetch Traefik entrypoints");
      setEntrypoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntrypoints();
  }, [fetchEntrypoints]);

  return {
    entrypoints,
    loading,
    configured,
    error,
    fetchEntrypoints,
  };
}
