"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { ServiceForm } from "@/components/service-form";
import { useServices } from "@/hooks/use-services";
import { useRouter } from "next/navigation";
import type { ServiceFormData } from "@/hooks/use-service-form";

export default function AddServicePage() {
  const { saveService, defaultDuration, configLoaded } = useServices();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [importData, setImportData] = useState<Partial<ServiceFormData> | undefined>(undefined);
  const [importReady, setImportReady] = useState(false);
  const [draftMode, setDraftMode] = useState(false);

  useEffect(() => {
    setMounted(true);

    const draftStorageKey = "tpa-traefik-import-draft";
    const searchParams = new URLSearchParams(window.location.search);
    const rawUrlDraft = searchParams.get("draft");
    const rawSessionDraft = window.sessionStorage.getItem(draftStorageKey);
    const rawLocalDraft = window.localStorage.getItem(draftStorageKey);
    const rawDraft = rawUrlDraft || rawSessionDraft || rawLocalDraft;
    const hasDraftParam = searchParams.get("traefikImportDraft") === "1" || Boolean(rawDraft);
    setDraftMode(hasDraftParam);
    setImportReady(false);

    if (hasDraftParam) {
      if (rawDraft) {
        try {
          setImportData(JSON.parse(rawDraft));
        } catch (error) {
          console.error("Failed to parse Traefik import draft:", error);
          setImportData(undefined);
        } finally {
          window.sessionStorage.removeItem(draftStorageKey);
          window.localStorage.removeItem(draftStorageKey);
          setImportReady(true);
        }
        return;
      }

      setImportData(undefined);
      setImportReady(true);
      return;
    }

    const importedHost = searchParams.get("host") || "";
    const importedEntrypoint = searchParams.get("entrypoint") || null;
    const importedMiddlewares = searchParams.get("middlewares") || "";
    const importedName = searchParams.get("name") || "";
    setImportData(importedName || importedHost || importedEntrypoint || importedMiddlewares
      ? {
          name: importedName ? importedName.replace(/@.*$/, "") : "",
          hostnameMode: importedHost ? "custom" as const : "subdomain" as const,
          customHostnames: importedHost ? JSON.stringify([importedHost]) : null,
          entrypoint: importedEntrypoint,
          middlewares: importedMiddlewares,
        }
      : undefined);
    setImportReady(true);
  }, []);

  const handleSubmit = async (serviceData: ServiceFormData) => {
    setSaving(true);
    try {
      await saveService(serviceData, null);
      router.push("/");
    } catch (error) {
      console.error("Failed to save service:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/");
  };

  const formKey = draftMode
    ? `draft-${importData?.name || "pending"}-${importData?.targetIp || "target"}`
    : "new-service";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Services
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Add Service</h1>
            <p className="text-muted-foreground">
              Create a new Traefik proxy service
            </p>
          </div>
        </div>

        {mounted && importReady && configLoaded ? (
          <ServiceForm
            key={formKey}
            service={null}
            defaultDuration={defaultDuration}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitting={saving}
            initialData={importData}
          />
        ) : (
          <div
            className="min-h-[28rem] rounded-md border p-6"
            aria-label="Preparing service form"
            suppressHydrationWarning
          />
        )}
      </div>
    </AppLayout>
  );
}