import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { appConfig, db } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  ADMIN_SESSION_COOKIE,
  adminAuthEnabled,
  createAdminSessionToken,
  roleAllows,
  verifyAdminSessionToken,
  type AdminRole,
  type AdminSessionClaims,
} from "@/lib/admin-auth-shared";

export type AdminAuthProvider = "local" | "sso";

export interface RoleRule {
  users?: string[];
  groups?: string[];
}

export interface LocalAdminUser {
  username: string;
  passwordHash: string;
  role: AdminRole;
  disabled: boolean;
}

export interface AdminAuthConfig {
  enabled: boolean;
  provider: AdminAuthProvider;
  allowLocalFallback: boolean;
  sessionDurationHours: number;
  roles: Record<AdminRole, RoleRule>;
  localUsers: LocalAdminUser[];
}

const DEFAULT_ADMIN_AUTH_CONFIG: AdminAuthConfig = {
  enabled: true,
  provider: "local",
  allowLocalFallback: false,
  sessionDurationHours: 8,
  roles: {
    viewer: { users: [], groups: [] },
    editor: { users: [], groups: [] },
    admin: { users: [], groups: [] },
  },
  localUsers: [],
};

function configuredProvider(): AdminAuthProvider {
  return process.env.ADMIN_AUTH_PROVIDER === "sso" ? "sso" : "local";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asAdminRole(value: unknown): AdminRole {
  return value === "viewer" || value === "editor" || value === "admin" ? value : "viewer";
}

function sanitizeLocalUsers(value: unknown): LocalAdminUser[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((user): user is Partial<LocalAdminUser> => typeof user === "object" && user !== null)
    .map((user) => ({
      username: typeof user.username === "string" ? user.username.trim() : "",
      passwordHash: typeof user.passwordHash === "string" ? user.passwordHash : "",
      role: asAdminRole(user.role),
      disabled: Boolean(user.disabled),
    }))
    .filter((user) => user.username.length > 0 && user.passwordHash.length > 0);
}

export async function updateAdminAuthConfig(config: AdminAuthConfig): Promise<void> {
  const provider = config.provider === "sso" ? "sso" : "local";
  const sanitized: AdminAuthConfig = {
    enabled: adminAuthEnabled(),
    provider,
    allowLocalFallback: Boolean(config.allowLocalFallback),
    sessionDurationHours: Math.max(1, Math.min(168, Number(config.sessionDurationHours) || 8)),
    roles: {
      viewer: { users: asStringArray(config.roles.viewer.users), groups: asStringArray(config.roles.viewer.groups) },
      editor: { users: asStringArray(config.roles.editor.users), groups: asStringArray(config.roles.editor.groups) },
      admin: { users: asStringArray(config.roles.admin.users), groups: asStringArray(config.roles.admin.groups) },
    },
    localUsers: sanitizeLocalUsers(config.localUsers),
  };

  const configValue = JSON.stringify(sanitized);
  await db
    .insert(appConfig)
    .values({
      key: "admin_auth_config",
      value: configValue,
      description: "Admin authentication provider and role mapping",
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: configValue, updatedAt: new Date() },
    });
}

export async function getAdminAuthConfig(): Promise<AdminAuthConfig> {
  const [stored] = await db.select().from(appConfig).where(eq(appConfig.key, "admin_auth_config"));
  if (!stored?.value) {
    return {
      ...DEFAULT_ADMIN_AUTH_CONFIG,
      enabled: adminAuthEnabled(),
      provider: configuredProvider(),
    };
  }

  const parsed = JSON.parse(stored.value) as Partial<AdminAuthConfig>;
  return {
    enabled: adminAuthEnabled(),
    provider: process.env.ADMIN_AUTH_PROVIDER ? configuredProvider() : parsed.provider === "sso" ? "sso" : "local",
    allowLocalFallback: Boolean(parsed.allowLocalFallback),
    sessionDurationHours: parsed.sessionDurationHours || DEFAULT_ADMIN_AUTH_CONFIG.sessionDurationHours,
    roles: {
      viewer: { users: asStringArray(parsed.roles?.viewer?.users), groups: asStringArray(parsed.roles?.viewer?.groups) },
      editor: { users: asStringArray(parsed.roles?.editor?.users), groups: asStringArray(parsed.roles?.editor?.groups) },
      admin: { users: asStringArray(parsed.roles?.admin?.users), groups: asStringArray(parsed.roles?.admin?.groups) },
    },
    localUsers: sanitizeLocalUsers(parsed.localUsers),
  };
}

function matchesRule(rule: RoleRule, userInfo: { sub: string; name?: string; email?: string; groups?: string[] }) {
  const identities = [userInfo.sub, userInfo.name, userInfo.email].filter(Boolean);
  const userAllowed = (rule.users || []).some((user) => identities.includes(user));
  const groupAllowed = (rule.groups || []).some((group) => userInfo.groups?.includes(group));
  return userAllowed || groupAllowed;
}

export function resolveAdminRole(
  config: AdminAuthConfig,
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
): AdminRole | null {
  if (matchesRule(config.roles.admin, userInfo)) return "admin";
  if (matchesRule(config.roles.editor, userInfo)) return "editor";
  if (matchesRule(config.roles.viewer, userInfo)) return "viewer";

  const hasRules = (["admin", "editor", "viewer"] as AdminRole[]).some((role) =>
    (config.roles[role].users || []).length > 0 || (config.roles[role].groups || []).length > 0,
  );

  return hasRules ? null : "admin";
}

export async function hasLocalAdminUsers() {
  const config = await getAdminAuthConfig();
  return config.localUsers.length > 0;
}

export async function createInitialLocalAdminUser(username: string, password: string) {
  const config = await getAdminAuthConfig();
  if (config.localUsers.length > 0) {
    throw new Error("Local admin user already exists");
  }

  const normalizedUsername = username.trim();
  if (normalizedUsername.length < 3 || password.length < 12) {
    throw new Error("Username must be at least 3 characters and password at least 12 characters");
  }

  const nextConfig: AdminAuthConfig = {
    ...config,
    provider: "local",
    localUsers: [
      {
        username: normalizedUsername,
        passwordHash: await bcrypt.hash(password, 12),
        role: "admin",
        disabled: false,
      },
    ],
  };
  await updateAdminAuthConfig(nextConfig);
  return nextConfig.localUsers[0];
}

export async function createLocalAdminUser(username: string, password: string, role: AdminRole) {
  const config = await getAdminAuthConfig();
  const normalizedUsername = username.trim();
  if (normalizedUsername.length < 3 || password.length < 12) {
    throw new Error("Username must be at least 3 characters and password at least 12 characters");
  }
  if (config.localUsers.some((user) => user.username === normalizedUsername)) {
    throw new Error("Local admin user already exists");
  }

  const nextConfig: AdminAuthConfig = {
    ...config,
    localUsers: [
      ...config.localUsers,
      {
        username: normalizedUsername,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        disabled: false,
      },
    ],
  };
  await updateAdminAuthConfig(nextConfig);
  return nextConfig.localUsers.find((user) => user.username === normalizedUsername)!;
}

export async function updateLocalAdminUser(
  username: string,
  updates: { password?: string; role?: AdminRole; disabled?: boolean },
) {
  const config = await getAdminAuthConfig();
  const userIndex = config.localUsers.findIndex((user) => user.username === username);
  if (userIndex === -1) throw new Error("Local admin user not found");

  const nextUsers = [...config.localUsers];
  const currentUser = nextUsers[userIndex];
  const nextUser: LocalAdminUser = {
    ...currentUser,
    role: updates.role || currentUser.role,
    disabled: updates.disabled ?? currentUser.disabled,
  };

  if (updates.password) {
    if (updates.password.length < 12) throw new Error("Password must be at least 12 characters");
    nextUser.passwordHash = await bcrypt.hash(updates.password, 12);
  }

  nextUsers[userIndex] = nextUser;
  ensureLocalAdminRemains(nextUsers);
  await updateAdminAuthConfig({ ...config, localUsers: nextUsers });
  return nextUser;
}

export async function deleteLocalAdminUser(username: string) {
  const config = await getAdminAuthConfig();
  const nextUsers = config.localUsers.filter((user) => user.username !== username);
  if (nextUsers.length === config.localUsers.length) throw new Error("Local admin user not found");
  ensureLocalAdminRemains(nextUsers);
  await updateAdminAuthConfig({ ...config, localUsers: nextUsers });
}

function ensureLocalAdminRemains(users: LocalAdminUser[]) {
  const hasEnabledAdmin = users.some((user) => user.role === "admin" && !user.disabled);
  if (!hasEnabledAdmin) {
    throw new Error("At least one enabled local admin user is required");
  }
}

export async function authenticateLocalAdminUser(username: string, password: string) {
  const config = await getAdminAuthConfig();
  const user = config.localUsers.find((candidate) => candidate.username === username.trim());
  if (!user || user.disabled) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}

export function adminCookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(process.env.ADMIN_COOKIE_DOMAIN ? { domain: process.env.ADMIN_COOKIE_DOMAIN } : {}),
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  };
}

export async function createAdminSessionCookie(
  userInfo: { sub: string; name?: string; email?: string; groups?: string[] },
  role: AdminRole,
  durationHours: number,
) {
  const expiresAt = Math.floor(Date.now() / 1000) + durationHours * 60 * 60;
  const claims: AdminSessionClaims = {
    sub: userInfo.sub,
    name: userInfo.name || userInfo.email,
    groups: userInfo.groups || [],
    role,
    exp: expiresAt,
  };

  return createAdminSessionToken(claims);
}

export async function getCurrentAdminSession() {
  if (!adminAuthEnabled()) return null;
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdminRole(requiredRole: AdminRole) {
  if (!adminAuthEnabled()) return null;
  const session = await getCurrentAdminSession();
  if (!session || !roleAllows(session.role, requiredRole)) {
    throw new Error("Unauthorized");
  }
  return session;
}
