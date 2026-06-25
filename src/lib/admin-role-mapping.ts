import type { AdminRole } from "@/lib/admin-auth-shared";

export interface RoleRule {
  users?: string[];
  groups?: string[];
}

export interface AdminRoleMappingConfig {
  roles: Record<AdminRole, RoleRule>;
}

export function hasAdminRoleMappings(config: AdminRoleMappingConfig): boolean {
  return (["admin", "editor", "viewer"] as AdminRole[]).some((role) =>
    (config.roles[role].users || []).length > 0 || (config.roles[role].groups || []).length > 0,
  );
}

function matchesRule(rule: RoleRule, userInfo: { sub: string; name?: string; email?: string; groups?: string[] }) {
  const identities = [userInfo.sub, userInfo.name, userInfo.email].filter(Boolean);
  const userAllowed = (rule.users || []).some((user) => identities.includes(user));
  const groupAllowed = (rule.groups || []).some((group) => userInfo.groups?.includes(group));
  return userAllowed || groupAllowed;
}

export function resolveAdminRole(
  config: AdminRoleMappingConfig,
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
): AdminRole | null {
  if (!hasAdminRoleMappings(config)) return null;

  if (matchesRule(config.roles.admin, userInfo)) return "admin";
  if (matchesRule(config.roles.editor, userInfo)) return "editor";
  if (matchesRule(config.roles.viewer, userInfo)) return "viewer";

  return null;
}
