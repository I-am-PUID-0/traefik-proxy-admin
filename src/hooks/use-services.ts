"use client";

import { useState, useCallback, useEffect } from "react";
import type { Service } from "@/components/service-table";
import type { ServiceFormData } from "./use-service-form";
import { parseMiddlewareNames } from "@/lib/middleware-utils";

function redirectToLogin() {
  const returnTo = window.location.pathname + window.location.search;
  window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultDuration, setDefaultDuration] = useState<number | null | undefined>(undefined);
  const [configLoaded, setConfigLoaded] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch("/api/services");
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      } else if (response.status === 401) {
        redirectToLogin();
      } else {
        console.error("Failed to fetch services");
      }
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoaded(false);
      const response = await fetch("/api/config");
      if (response.ok) {
        const config = await response.json();
        if (Object.prototype.hasOwnProperty.call(config, "defaultEnableDurationMinutes")) {
          setDefaultDuration(config.defaultEnableDurationMinutes);
        } else {
          setDefaultDuration(720);
        }
      } else if (response.status === 401) {
        redirectToLogin();
      } else {
        // If config cannot be loaded, prefer the non-expiring option over an unexpected timeout.
        setDefaultDuration(null);
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
      setDefaultDuration(null);
    } finally {
      setConfigLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveService = useCallback(async (serviceData: ServiceFormData, editingService?: Service | null) => {
    const url = editingService ? `/api/services/${editingService.id}` : "/api/services";
    const method = editingService ? "PUT" : "POST";
    const middlewareNames = parseMiddlewareNames(serviceData.middlewares);
    const payload = {
      ...serviceData,
      middlewares: middlewareNames,
    };

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 401) redirectToLogin();
      const errorText = await response.text();
      throw new Error(`Failed to save service: ${errorText}`);
    }

    await fetchServices();
  }, [fetchServices]);

  const deleteService = useCallback(async (id: string) => {
    const response = await fetch(`/api/services/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      if (response.status === 401) redirectToLogin();
      throw new Error("Failed to delete service");
    }

    await fetchServices();
  }, [fetchServices]);

  const toggleService = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/toggle`, {
      method: "POST",
    });

    if (!response.ok) {
      if (response.status === 401) redirectToLogin();
      throw new Error("Failed to toggle service");
    }

    await fetchServices();
  }, [fetchServices]);

  const generateShareLink = useCallback(async (serviceId: string) => {
    try {
      const response = await fetch("/api/services/share-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serviceId }),
      });

      if (response.ok) {
        const { shareUrl } = await response.json();
        await navigator.clipboard.writeText(shareUrl);
        return shareUrl;
      } else if (response.status === 401) {
        redirectToLogin();
        throw new Error("Admin authentication required");
      } else {
        throw new Error("Failed to generate share link");
      }
    } catch (error) {
      console.error("Error generating share link:", error);
      throw error;
    }
  }, []);

  const fetchServiceById = useCallback(async (id: string): Promise<Service | null> => {
    try {
      const response = await fetch(`/api/services/${id}`);
      if (response.ok) {
        return await response.json();
      } else if (response.status === 401) {
        redirectToLogin();
        return null;
      } else if (response.status === 404) {
        return null;
      } else {
        console.error("Failed to fetch service");
        return null;
      }
    } catch (error) {
      console.error("Error fetching service:", error);
      return null;
    }
  }, []);

  return {
    services,
    loading,
    defaultDuration,
    configLoaded,
    fetchServices,
    fetchServiceById,
    fetchConfig,
    saveService,
    deleteService,
    toggleService,
    generateShareLink,
  };
}
