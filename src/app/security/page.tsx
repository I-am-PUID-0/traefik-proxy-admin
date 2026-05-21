"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { BasicAuthConfigTable } from "@/components/basic-auth-config-table";
import { BasicAuthConfigDialog } from "@/components/basic-auth-config-dialog";
import { BasicAuthUserDialog } from "@/components/basic-auth-user-dialog";
import { AdminAuthPanel } from "@/components/admin-auth-panel";
import { SsoConfigDialog } from "@/components/sso-config-dialog";
import { SsoConfigTable, type SsoProviderConfig } from "@/components/sso-config-table";
import { useBasicAuth } from "@/hooks/use-basic-auth";
import { useSsoConfigs } from "@/hooks/use-sso-configs";
import type { BasicAuthConfig, BasicAuthUser } from "@/components/basic-auth-config-table";

export default function SecurityPage() {
  const {
    configs,
    loading,
    fetchConfigs,
    saveConfig,
    deleteConfig,
    saveUser,
    deleteUser,
  } = useBasicAuth();

  const {
    configs: ssoConfigs,
    loading: ssoLoading,
    fetchConfigs: fetchSsoConfigs,
    saveConfig: saveSsoConfig,
    deleteConfig: deleteSsoConfig,
  } = useSsoConfigs();

  // UI state
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());
  const [showSsoConfigDialog, setShowSsoConfigDialog] = useState(false);
  const [editingSsoConfig, setEditingSsoConfig] = useState<SsoProviderConfig | null>(null);

  // Config dialog state
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BasicAuthConfig | null>(null);

  // User dialog state
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<BasicAuthUser | null>(null);
  const [userParentConfigId, setUserParentConfigId] = useState<string>("");

  useEffect(() => {
    fetchConfigs();
    fetchSsoConfigs();
  }, [fetchConfigs, fetchSsoConfigs]);

  const toggleConfigExpansion = (configId: string) => {
    const newExpanded = new Set(expandedConfigs);
    if (newExpanded.has(configId)) {
      newExpanded.delete(configId);
    } else {
      newExpanded.add(configId);
    }
    setExpandedConfigs(newExpanded);
  };

  const handleAddSsoConfig = () => {
    setEditingSsoConfig(null);
    setShowSsoConfigDialog(true);
  };

  const handleEditSsoConfig = (config: SsoProviderConfig) => {
    setEditingSsoConfig(config);
    setShowSsoConfigDialog(true);
  };

  const handleAddConfig = () => {
    setEditingConfig(null);
    setShowConfigDialog(true);
  };

  const handleEditConfig = (config: BasicAuthConfig) => {
    setEditingConfig(config);
    setShowConfigDialog(true);
  };

  const handleAddUser = (configId: string) => {
    setUserParentConfigId(configId);
    setEditingUser(null);
    setShowUserDialog(true);
  };

  const handleEditUser = (user: BasicAuthUser) => {
    setUserParentConfigId(user.configId);
    setEditingUser(user);
    setShowUserDialog(true);
  };

  const handleConfigSubmit = async (data: { name: string; description: string }) => {
    await saveConfig(data, editingConfig);
  };

  const handleUserSubmit = async (data: { username: string; password: string; configId: string }) => {
    await saveUser(data, editingUser);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Security Management</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage admin access and service basic authentication
          </p>
        </div>

        <AdminAuthPanel />

        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-medium">Service Basic Auth is separate from TPA admin login.</p>
          <p className="mt-1">
            The section below creates reusable HTTP Basic Authentication credential sets for proxied services.
            Attach one of these sets from a service Security page when you want Traefik to challenge visitors
            before forwarding them to that service.
          </p>
        </div>

        <SsoConfigTable
          configs={ssoConfigs}
          loading={ssoLoading}
          onAddConfig={handleAddSsoConfig}
          onEditConfig={handleEditSsoConfig}
          onDeleteConfig={deleteSsoConfig}
        />

        <BasicAuthConfigTable
          configs={configs}
          expandedConfigs={expandedConfigs}
          loading={loading}
          onToggleExpansion={toggleConfigExpansion}
          onAddConfig={handleAddConfig}
          onEditConfig={handleEditConfig}
          onDeleteConfig={deleteConfig}
          onAddUser={handleAddUser}
          onEditUser={handleEditUser}
          onDeleteUser={deleteUser}
        />

        <SsoConfigDialog
          open={showSsoConfigDialog}
          onOpenChange={setShowSsoConfigDialog}
          editingConfig={editingSsoConfig}
          onSubmit={(data) => saveSsoConfig(data, editingSsoConfig)}
        />

        <BasicAuthConfigDialog
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          editingConfig={editingConfig}
          onSubmit={handleConfigSubmit}
        />

        <BasicAuthUserDialog
          open={showUserDialog}
          onOpenChange={setShowUserDialog}
          editingUser={editingUser}
          parentConfigId={userParentConfigId}
          onSubmit={handleUserSubmit}
        />
      </div>
    </AppLayout>
  );
}