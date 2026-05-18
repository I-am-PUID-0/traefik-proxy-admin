import { useCallback, useEffect, useState } from "react";

export interface TraefikStatus {
  configured: boolean;
  reachable: boolean;
  fallback: boolean;
  apiUrl?: string;
  version?: string;
  codename?: string;
  goVersion?: string;
  os?: string;
  arch?: string;
  error?: string;
}

export function useTraefikStatus() {
  const [status, setStatus] = useState<TraefikStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/traefik/status");
      const data = await response.json().catch(() => null);
      setStatus(data);
    } catch (error) {
      console.error("Error fetching Traefik status:", error);
      setStatus({
        configured: true,
        reachable: false,
        fallback: false,
        error: "Failed to fetch Traefik status",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    fetchStatus,
  };
}
