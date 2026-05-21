"use client";

import { useCallback, useState } from "react";
import type { SsoProviderConfig } from "@/components/sso-config-table";

export interface SsoProviderFormData {
  name: string;
  description: string;
  enabled: boolean;
  idpUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

export function useSsoConfigs() {
  const [configs, setConfigs] = useState<SsoProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/sso-configs");
      if (response.ok) {
        setConfigs(await response.json());
      } else {
        console.error("Failed to fetch SSO configurations");
      }
    } catch (error) {
      console.error("Error fetching SSO configurations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = useCallback(async (data: SsoProviderFormData, editingConfig?: SsoProviderConfig | null) => {
    const url = editingConfig ? "/api/security/sso-configs/" + editingConfig.id : "/api/security/sso-configs";
    const method = editingConfig ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        scopes: data.scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to save SSO configuration");
    }

    await fetchConfigs();
  }, [fetchConfigs]);

  const deleteConfig = useCallback(async (id: string) => {
    const response = await fetch("/api/security/sso-configs/" + id, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Failed to delete SSO configuration");
    }
    await fetchConfigs();
  }, [fetchConfigs]);

  return { configs, loading, fetchConfigs, saveConfig, deleteConfig };
}
