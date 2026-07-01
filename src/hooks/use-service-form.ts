import { useState, useEffect, useCallback } from "react";
import type { Service } from "@/components/service-table";

export type ServiceFormData = Omit<Service, "id" | "createdAt" | "updatedAt"> & {
  domainId?: string;
};

interface UseServiceFormOptions {
  service: Service | null;
  defaultDuration?: number | null;
  initialData?: Partial<ServiceFormData>;
}

export function useServiceForm({ service, defaultDuration, initialData }: UseServiceFormOptions) {
  const getDefaultFormData = useCallback((): ServiceFormData => {
    const hasInitialDuration = Boolean(initialData)
      && Object.prototype.hasOwnProperty.call(initialData, "enableDurationMinutes")
      && initialData?.enableDurationMinutes !== undefined;
    const data: ServiceFormData = {
      name: "",
      serviceGroup: "",
      subdomain: "",
      hostnameMode: "subdomain",
      customHostnames: null,
      domainId: "",
      targetIp: "",
      targetPort: 80,
      entrypoint: null,
      isHttps: true,
      insecureSkipVerify: false,
      passHostHeader: true,
      enabled: true,
      enabledAt: null,
      enableDurationMinutes: defaultDuration ?? null,
      middlewares: "",
      requestHeaders: "",
      managedMiddlewares: "",
      advancedRouters: "",
      ...initialData,
    };

    if (!hasInitialDuration) {
      data.enableDurationMinutes = defaultDuration ?? null;
    }

    return data;
  }, [defaultDuration, initialData]);

  const [formData, setFormData] = useState<ServiceFormData>(getDefaultFormData);
  const [originalFormData, setOriginalFormData] = useState<ServiceFormData>(getDefaultFormData);

  // Initialize form when service prop changes
  useEffect(() => {
    if (service) {
      const serviceData: ServiceFormData = {
        name: service.name,
        serviceGroup: service.serviceGroup || "",
        subdomain: service.subdomain || "",
        hostnameMode: service.hostnameMode,
        customHostnames: service.customHostnames,
        domainId: service.domainId,
        targetIp: service.targetIp,
        targetPort: service.targetPort,
        entrypoint: service.entrypoint || null,
        isHttps: service.isHttps,
        insecureSkipVerify: service.insecureSkipVerify,
        passHostHeader: service.passHostHeader ?? true,
        enabled: service.enabled,
        enabledAt: service.enabledAt,
        enableDurationMinutes: service.enableDurationMinutes,
        middlewares: service.middlewares || "",
        requestHeaders: service.requestHeaders || "",
        managedMiddlewares: service.managedMiddlewares || "",
        advancedRouters: service.advancedRouters || "",
      };
      setFormData(serviceData);
      setOriginalFormData(serviceData);
    } else {
      const defaultData = getDefaultFormData();
      setFormData(defaultData);
      setOriginalFormData(defaultData);
    }
  }, [service, getDefaultFormData]);

  // Update form data when the saved default duration loads. Plain new services
  // can reset to the default shape; imported drafts keep their imported fields and
  // only receive the duration default when the draft did not provide one.
  useEffect(() => {
    if (service || defaultDuration === undefined) {
      return;
    }

    if (!initialData) {
      const defaultData = getDefaultFormData();
      setFormData(defaultData);
      setOriginalFormData(defaultData);
      return;
    }

    const initialDataHasDuration = Object.prototype.hasOwnProperty.call(
      initialData,
      "enableDurationMinutes",
    ) && initialData.enableDurationMinutes !== undefined;

    if (!initialDataHasDuration) {
      const duration = defaultDuration ?? null;
      setFormData((prev) => ({ ...prev, enableDurationMinutes: duration }));
      setOriginalFormData((prev) => ({ ...prev, enableDurationMinutes: duration }));
    }
  }, [defaultDuration, initialData, service, getDefaultFormData]);

  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalFormData);

  const updateFormData = useCallback((updates: Partial<ServiceFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    formData,
    setFormData,
    updateFormData,
    hasUnsavedChanges,
  };
}
