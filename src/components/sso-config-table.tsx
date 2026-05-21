"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Edit, KeyRound, Plus, Trash2 } from "lucide-react";

export interface SsoProviderConfig {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  idpUrl?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userinfoUrl?: string | null;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  hasClientSecret: boolean;
}

interface SsoConfigTableProps {
  configs: SsoProviderConfig[];
  loading: boolean;
  onAddConfig: () => void;
  onEditConfig: (config: SsoProviderConfig) => void;
  onDeleteConfig: (id: string) => Promise<void>;
}

export function SsoConfigTable({ configs, loading, onAddConfig, onEditConfig, onDeleteConfig }: SsoConfigTableProps) {
  const [deletingConfig, setDeletingConfig] = useState<string | null>(null);

  const handleDeleteConfig = async (id: string) => {
    setDeletingConfig(id);
    try {
      await onDeleteConfig(id);
    } finally {
      setDeletingConfig(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Service SSO Configurations
          </CardTitle>
          <CardDescription>Loading reusable service SSO providers...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Service SSO Configurations
            </CardTitle>
            <CardDescription>
              Reusable OAuth/OIDC providers for proxied services. Attach one from a service Security page, then set that service&apos;s allowed users or groups.
            </CardDescription>
          </div>
          <Button onClick={onAddConfig} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add SSO Provider
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <div className="py-8 text-center">
            <KeyRound className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">No SSO providers found</h3>
            <p className="mb-4 text-gray-500 dark:text-gray-400">Create a reusable provider, then attach it to one or more services.</p>
            <Button onClick={onAddConfig}>
              <Plus className="mr-2 h-4 w-4" />
              Add SSO Provider
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <div key={config.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{config.name}</h3>
                      <Badge variant={config.enabled ? "default" : "secondary"}>{config.enabled ? "Enabled" : "Disabled"}</Badge>
                      <Badge variant="outline">{config.scopes.join(" ")}</Badge>
                    </div>
                    {config.description && <p className="text-sm text-gray-600 dark:text-gray-400">{config.description}</p>}
                    <p className="text-xs text-muted-foreground">Client ID: {config.clientId}</p>
                    <p className="text-xs text-muted-foreground">Redirect URI: {config.redirectUri}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => onEditConfig(config)}>
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm" disabled={deletingConfig === config.id} className="text-red-600 hover:text-red-700">
                          <Trash2 className="mr-1 h-4 w-4" />
                          Delete
                        </Button>
                      }
                      title="Delete SSO Provider"
                      description={'Are you sure you want to delete "' + config.name + '"? Services using it should be moved to another provider first.'}
                      confirmText="Delete"
                      onConfirm={() => handleDeleteConfig(config.id)}
                      variant="destructive"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
