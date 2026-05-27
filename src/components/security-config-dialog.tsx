"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Plus,
  X,
  AlertCircle,
  Users,
  Link,
  Key,
  Info,
  Loader2,
} from "lucide-react";
import type { SecurityType, SecurityConfig } from "@/lib/dto/service-security.dto";

interface BasicAuthConfig {
  id: string;
  name: string;
  description?: string;
}

interface SsoProviderConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
}

interface SecurityConfigDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  serviceId: string;
  editingConfig?: (SecurityConfig & { id: string }) | null;
  onSave: (config: SecurityConfig & { id?: string }) => Promise<void>;
  onCancel?: () => void;
  // Configuration limits
  hasSharedLink?: boolean;
  hasSso?: boolean;
  basicAuthCount?: number;
}

interface FormData {
  type: SecurityType;
  isEnabled: boolean;
  priority: number;
  config: {
    // Shared link config
    expiresInHours?: number;
    sessionDurationMinutes?: number;
    // SSO config
    ssoConfigId?: string;
    groups?: string[];
    users?: string[];
    // Basic auth config
    basicAuthConfigId?: string;
    // Bypass config
    name?: string;
    rule?: string;
    mode?: "simple" | "observed";
    middlewares?: string[];
      };
}

interface FormErrors {
  type?: string;
  priority?: string;
  expiresInHours?: string;
  sessionDurationMinutes?: string;
  groups?: string;
  users?: string;
  ssoConfigId?: string;
  basicAuthConfigId?: string;
  name?: string;
  rule?: string;
  middlewares?: string;
}


const bypassRulePresets = [
  {
    value: "ha-companion",
    label: "HA Companion User-Agent",
    rule: "HeaderRegexp(`User-Agent`, `Home Assistant/.*`)",
  },
  {
    value: "tautulli-api-key",
    label: "Tautulli API key",
    rule: "Header(`X-Api-Key`, `change-me`) || Query(`apikey`, `change-me`)",
  },
  {
    value: "post-webhook",
    label: "POST webhook path",
    rule: "Method(`POST`) && Path(`/api/webhook/your-token`)",
  },
  {
    value: "path-prefix",
    label: "Path prefix",
    rule: "PathPrefix(`/api/public`)",
  },
  {
    value: "client-ip",
    label: "Client IP/CIDR",
    rule: "ClientIP(`10.0.0.0/8`)",
  },
  {
    value: "header",
    label: "Exact header",
    rule: "Header(`X-Bypass-Token`, `change-me`)",
  },
  {
    value: "healthcheck",
    label: "Health check path",
    rule: "Path(`/health`) || Path(`/ping`)",
  },
  {
    value: "plex-webhook",
    label: "Plex webhook",
    rule: "Method(`POST`) && Path(`/webhooks/plex`)",
  },
];

const securityTypeOptions = [
  {
    value: "shared_link" as const,
    label: "Shared Link",
    description: "Time-limited access links",
    icon: Link,
  },
  {
    value: "sso" as const,
    label: "SSO Authentication",
    description: "Single Sign-On authentication",
    icon: Users,
  },
  {
    value: "basic_auth" as const,
    label: "Basic Authentication",
    description: "Username and password authentication",
    icon: Key,
  },
  {
    value: "bypass" as const,
    label: "Bypass Rule",
    description: "Higher-priority auth bypass route",
    icon: Shield,
  },
];

export function SecurityConfigDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  editingConfig,
  onSave,
  onCancel,
  hasSharedLink = false,
  hasSso = false,
}: SecurityConfigDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [basicAuthConfigs, setBasicAuthConfigs] = useState<BasicAuthConfig[]>([]);
  const [ssoProviderConfigs, setSsoProviderConfigs] = useState<SsoProviderConfig[]>([]);
  const [loadingBasicAuth, setLoadingBasicAuth] = useState(false);
  const [loadingSsoProviders, setLoadingSsoProviders] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;

  const [formData, setFormData] = useState<FormData>({
    type: "shared_link",
    isEnabled: true,
    priority: 10,
    config: {
      expiresInHours: 24,
      sessionDurationMinutes: 60,
      ssoConfigId: "",
      groups: [],
      users: [],
      basicAuthConfigId: "",
      name: "",
      rule: "",
      mode: "simple",
      middlewares: [],
    },
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [groupInput, setGroupInput] = useState("");
  const [userInput, setUserInput] = useState("");

  // Filter available security types based on existing configurations
  const getAvailableSecurityTypes = () => {
    if (editingConfig) {
      // When editing, allow the current type
      return securityTypeOptions;
    }

    return securityTypeOptions.filter(option => {
      switch (option.value) {
        case 'shared_link':
          return !hasSharedLink; // Only allow if no shared link exists
        case 'sso':
          return !hasSso; // Only allow if no SSO exists
        case 'basic_auth':
          return true; // Always allow basic auth (multiple allowed)
        default:
          return true;
      }
    });
  };

  // Load editing data
  useEffect(() => {
    if (editingConfig && isOpen) {
      setFormData({
        type: editingConfig.type,
        isEnabled: editingConfig.isEnabled,
        priority: editingConfig.priority,
        config: {
          ...editingConfig.config,
          ssoConfigId: editingConfig.type === "sso" ? editingConfig.config.ssoConfigId : "",
          groups: editingConfig.type === "sso" ? editingConfig.config.groups : [],
          users: editingConfig.type === "sso" ? editingConfig.config.users : [],
          name: editingConfig.type === "bypass" ? editingConfig.config.name : "",
          rule: editingConfig.type === "bypass" ? editingConfig.config.rule : "",
          mode: editingConfig.type === "bypass" ? editingConfig.config.mode : "simple",
          middlewares: editingConfig.type === "bypass" ? editingConfig.config.middlewares : [],
        },
      });
    } else if (isOpen) {
      // Reset form for new config
      setFormData({
        type: "shared_link",
        isEnabled: true,
        priority: 10,
        config: {
          expiresInHours: 24,
          sessionDurationMinutes: 60,
          ssoConfigId: "",
          groups: [],
          users: [],
          basicAuthConfigId: "",
          name: "",
          rule: "",
          mode: "simple",
          middlewares: [],
            },
      });
    }
    setErrors({});
    setGroupInput("");
    setUserInput("");
  }, [editingConfig, isOpen]);

  // Load reusable auth configs when dialog opens and a provider-backed type is selected
  useEffect(() => {
    if (isOpen && (formData.type === "basic_auth" || editingConfig?.type === "basic_auth")) {
      fetchBasicAuthConfigs();
    }
    if (isOpen && (formData.type === "sso" || editingConfig?.type === "sso")) {
      fetchSsoProviderConfigs();
    }
  }, [isOpen, formData.type, editingConfig?.type]);

  const fetchBasicAuthConfigs = async () => {
    setLoadingBasicAuth(true);
    try {
      const response = await fetch("/api/security/basic-auth-configs");
      if (response.ok) {
        const data = await response.json();
        setBasicAuthConfigs(data);
      }
    } catch (error) {
      console.error("Failed to fetch basic auth configs:", error);
    } finally {
      setLoadingBasicAuth(false);
    }
  };

  const fetchSsoProviderConfigs = async () => {
    setLoadingSsoProviders(true);
    try {
      const response = await fetch("/api/security/sso-configs");
      if (response.ok) {
        const data = await response.json();
        setSsoProviderConfigs(data);
      }
    } catch (error) {
      console.error("Failed to fetch SSO configs:", error);
    } finally {
      setLoadingSsoProviders(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Priority validation
    if (formData.priority < 0 || formData.priority > 100) {
      newErrors.priority = "Priority must be between 0 and 100";
    }

    // Type-specific validation
    switch (formData.type) {
      case "shared_link":
        if (!formData.config.expiresInHours || formData.config.expiresInHours < 1) {
          newErrors.expiresInHours = "Expiration time must be at least 1 hour";
        }
        if (!formData.config.sessionDurationMinutes || formData.config.sessionDurationMinutes < 1) {
          newErrors.sessionDurationMinutes = "Session duration must be at least 1 minute";
        }
        break;

      case "sso":
        if (
          (!formData.config.groups || formData.config.groups.length === 0) &&
          (!formData.config.users || formData.config.users.length === 0)
        ) {
          newErrors.groups = "At least one group or user must be specified";
          newErrors.users = "At least one group or user must be specified";
        }
        break;

      case "basic_auth":
        if (!formData.config.basicAuthConfigId) {
          newErrors.basicAuthConfigId = "Basic auth configuration is required";
        }
        break;

      case "bypass":
        if (!formData.config.name?.trim()) {
          newErrors.name = "Bypass name is required";
        }
        if (!formData.config.rule?.trim()) {
          newErrors.rule = "Match rule is required";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Clean up config based on type
      const cleanConfig = { ...formData };

      switch (cleanConfig.type) {
        case "shared_link":
          cleanConfig.config = {
            expiresInHours: cleanConfig.config.expiresInHours!,
            sessionDurationMinutes: cleanConfig.config.sessionDurationMinutes!,
          };
          break;
        case "sso":
          cleanConfig.config = {
            ...(cleanConfig.config.ssoConfigId ? { ssoConfigId: cleanConfig.config.ssoConfigId } : {}),
            groups: cleanConfig.config.groups!,
            users: cleanConfig.config.users!,
          };
          break;
        case "basic_auth":
          cleanConfig.config = {
            basicAuthConfigId: cleanConfig.config.basicAuthConfigId!,
          };
          break;
        case "bypass":
          cleanConfig.config = {
            name: cleanConfig.config.name!.trim(),
            rule: cleanConfig.config.rule!.trim(),
            mode: cleanConfig.config.mode === "observed" ? "observed" : "simple",
            middlewares: cleanConfig.config.middlewares || [],
            sessionDurationMinutes: 0,
          };
          break;
      }

      const configToSave = editingConfig
        ? { ...cleanConfig, id: editingConfig.id }
        : cleanConfig;

      await onSave(configToSave as SecurityConfig & { id?: string });
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save security config:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    onCancel?.();
  };

  const addGroup = () => {
    if (groupInput.trim() && !formData.config.groups?.includes(groupInput.trim())) {
      setFormData({
        ...formData,
        config: {
          ...formData.config,
          groups: [...(formData.config.groups || []), groupInput.trim()],
        },
      });
      setGroupInput("");
      // Clear errors when adding valid data
      if (errors.groups || errors.users) {
        setErrors({ ...errors, groups: undefined, users: undefined });
      }
    }
  };

  const removeGroup = (group: string) => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        groups: formData.config.groups?.filter((g) => g !== group) || [],
      },
    });
  };

  const addUser = () => {
    if (userInput.trim() && !formData.config.users?.includes(userInput.trim())) {
      setFormData({
        ...formData,
        config: {
          ...formData.config,
          users: [...(formData.config.users || []), userInput.trim()],
        },
      });
      setUserInput("");
      // Clear errors when adding valid data
      if (errors.groups || errors.users) {
        setErrors({ ...errors, groups: undefined, users: undefined });
      }
    }
  };

  const removeUser = (user: string) => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        users: formData.config.users?.filter((u) => u !== user) || [],
      },
    });
  };

  const selectedTypeOption = securityTypeOptions.find((option) => option.value === formData.type);
  const TypeIcon = selectedTypeOption?.icon || Shield;

  const dialogContent = (
    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <TypeIcon className="h-5 w-5" />
          {editingConfig ? "Edit Security Configuration" : "Add Security Configuration"}
        </DialogTitle>
        <DialogDescription>
          {editingConfig
            ? "Update the security configuration for this service."
            : "Create a new security configuration for this service."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Security Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="type">Security Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => {
              setFormData({
                ...formData,
                type: value as SecurityType,
                priority: value === "bypass" ? 100 : formData.type === "bypass" ? 10 : formData.priority,
                config: {
                  expiresInHours: 24,
                  sessionDurationMinutes: 60,
                  ssoConfigId: "",
                  groups: [],
                  users: [],
                  basicAuthConfigId: "",
                  name: "",
                  rule: "",
                  mode: value === "bypass" ? "simple" : undefined,
                  middlewares: [],
                            },
              });
              setErrors({});
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAvailableSecurityTypes().map((option) => {
                const OptionIcon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <OptionIcon className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {errors.type && (
            <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {errors.type}
            </div>
          )}
        </div>

        {/* Basic Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority">Priority (0-100)</Label>
            <Input
              id="priority"
              type="number"
              min={0}
              max={100}
              value={formData.priority}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  priority: parseInt(e.target.value) || 0,
                })
              }
            />
            {errors.priority && (
              <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {errors.priority}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Higher numbers have higher priority. Bypass rules usually need a higher priority than the normal auth route.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isEnabled: checked })
                }
              />
              <Label htmlFor="enabled">Configuration enabled</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Disabled configurations are ignored
            </p>
          </div>
        </div>

        {/* Type-specific Configuration */}
        {formData.type === "shared_link" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link className="h-4 w-4" />
              Shared Link Configuration
            </div>
            <p className="text-xs text-muted-foreground">
              Shared Link is an access-control rule. When enabled, direct service visits are
              denied until the visitor opens a generated link and receives a service session.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiresInHours">Link expires in (hours)</Label>
                <Input
                  id="expiresInHours"
                  type="number"
                  min={1}
                  value={formData.config.expiresInHours || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        expiresInHours: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
                {errors.expiresInHours && (
                  <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {errors.expiresInHours}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionDurationMinutes">Session duration (minutes)</Label>
                <Input
                  id="sessionDurationMinutes"
                  type="number"
                  min={1}
                  value={formData.config.sessionDurationMinutes || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        sessionDurationMinutes: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
                {errors.sessionDurationMinutes && (
                  <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {errors.sessionDurationMinutes}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Users can generate time-limited links to access this service without additional authentication.
              </span>
            </div>
          </div>
        )}

        {formData.type === "sso" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              SSO Configuration
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ssoProviderConfig">SSO Provider Configuration</Label>
                {loadingSsoProviders ? (
                  <div className="flex items-center gap-2 p-3 border rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading SSO providers...</span>
                  </div>
                ) : (
                  <Select
                    value={formData.config.ssoConfigId || "__global__"}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        config: {
                          ...formData.config,
                          ssoConfigId: value === "__global__" ? "" : value,
                        },
                      })
                    }
                  >
                    <SelectTrigger id="ssoProviderConfig">
                      <SelectValue placeholder="Select an SSO provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__global__">
                        <div>
                          <div className="font-medium">Global legacy SSO provider</div>
                          <div className="text-xs text-muted-foreground">Uses the existing app-wide SSO configuration.</div>
                        </div>
                      </SelectItem>
                      {ssoProviderConfigs.map((config) => (
                        <SelectItem key={config.id} value={config.id} disabled={!config.enabled}>
                          <div>
                            <div className="font-medium">{config.name}{!config.enabled ? " (disabled)" : ""}</div>
                            {config.description && (
                              <div className="text-xs text-muted-foreground">
                                {config.description}
                              </div>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.ssoConfigId && (
                  <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {errors.ssoConfigId}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Choose a reusable SSO provider from Security, or use the legacy global provider for existing setups.
                </p>
              </div>

              {/* Groups */}
              <div className="space-y-2">
                <Label>Allowed Groups</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter group name"
                    value={groupInput}
                    onChange={(e) => setGroupInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGroup();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addGroup}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.config.groups && formData.config.groups.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.config.groups.map((group) => (
                      <Badge key={group} variant="outline" className="text-xs">
                        {group}
                        <button
                          type="button"
                          onClick={() => removeGroup(group)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Users */}
              <div className="space-y-2">
                <Label>Allowed Users</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter username"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addUser();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addUser}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.config.users && formData.config.users.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.config.users.map((user) => (
                      <Badge key={user} variant="outline" className="text-xs">
                        {user}
                        <button
                          type="button"
                          onClick={() => removeUser(user)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(errors.groups || errors.users) && (
              <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {errors.groups || errors.users}
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <Info className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Users must authenticate through your SSO provider and be members of specified groups or users.
                Leave both empty to allow all authenticated users.
              </span>
            </div>
          </div>
        )}

        {formData.type === "basic_auth" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Key className="h-4 w-4" />
              Basic Authentication Configuration
            </div>

            <div className="space-y-2">
              <Label htmlFor="basicAuthConfig">Basic Auth Configuration</Label>
              {loadingBasicAuth ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading configurations...</span>
                </div>
              ) : (
                <Select
                  value={formData.config.basicAuthConfigId || ""}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        basicAuthConfigId: value,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {basicAuthConfigs.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">
                        No configurations available
                      </div>
                    ) : (
                      basicAuthConfigs.map((config) => (
                        <SelectItem key={config.id} value={config.id}>
                          <div>
                            <div className="font-medium">{config.name}</div>
                            {config.description && (
                              <div className="text-xs text-muted-foreground">
                                {config.description}
                              </div>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {errors.basicAuthConfigId && (
                <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {errors.basicAuthConfigId}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Choose which basic authentication configuration to use.
                {basicAuthConfigs.length === 0 && (
                  <>
                    {" "}Create configurations in the{" "}
                    <span className="underline">Security section</span>.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm text-orange-700 dark:text-orange-300">
                Users must provide valid username and password credentials to access this service.
              </span>
            </div>
          </div>
        )}

        {formData.type === "bypass" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4" />
              Bypass Rule Configuration
            </div>
            <p className="text-xs text-muted-foreground">
              Creates a higher-priority router for this service that skips SSO/shared-link/basic-auth middleware. Use a match expression without the Host rule; TPA adds the service host automatically.
            </p>

            <div className="space-y-2">
              <Label htmlFor="bypassName">Name</Label>
              <Input
                id="bypassName"
                value={formData.config.name || ""}
                placeholder="Home Assistant companion app"
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, name: e.target.value } })}
              />
              {errors.name && (
                <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {errors.name}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label htmlFor="bypassRule">Match expression</Label>
                <Select
                  value=""
                  onValueChange={(value) => {
                    const preset = bypassRulePresets.find((item) => item.value === value);
                    if (!preset) return;
                    setFormData({ ...formData, config: { ...formData.config, rule: preset.rule } });
                  }}
                >
                  <SelectTrigger className="h-8 w-full sm:w-[230px]">
                    <SelectValue placeholder="Insert rule preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {bypassRulePresets.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                id="bypassRule"
                value={formData.config.rule || ""}
                placeholder={'Example: HeaderRegexp(`User-Agent`, `Home Assistant/.*`)\nExample: Method(`POST`) && Path(`/api/webhook/...`)'}
                onChange={(e) => setFormData({ ...formData, config: { ...formData.config, rule: e.target.value } })}
                rows={3}
              />
              {errors.rule && (
                <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {errors.rule}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Pick a preset, then replace the sample values. TPA automatically adds the service Host(...) rule unless your expression already includes Host(...).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bypassMode">Bypass mode</Label>
              <Select
                value={formData.config.mode || "simple"}
                onValueChange={(value) => setFormData({ ...formData, config: { ...formData.config, mode: value as "simple" | "observed" } })}
              >
                <SelectTrigger id="bypassMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple bypass</SelectItem>
                  <SelectItem value="observed">Observed bypass</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Simple bypass never touches TPA auth. Observed bypass adds an allow-only observer that records matching access in Sessions while the bypass rule remains enabled.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bypassMiddlewares">Bypass middlewares</Label>
              <Textarea
                id="bypassMiddlewares"
                value={(formData.config.middlewares || []).join("\n")}
                placeholder={'ha-bypass-ratelimit\nsecure-headers@file'}
                onChange={(e) => setFormData({
                  ...formData,
                  config: {
                    ...formData.config,
                    middlewares: e.target.value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
                  },
                })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Optional middlewares to keep on the bypass lane, such as rate limits. Use @file only for middlewares defined in the Traefik file provider.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingConfig ? "Update Configuration" : "Add Configuration"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {dialogContent}
    </Dialog>
  );
}