export type AdminRole = "viewer" | "editor" | "admin";

export interface AdminSessionClaims {
  sub: string;
  name?: string;
  groups: string[];
  role: AdminRole;
  exp: number;
}

export const ADMIN_SESSION_COOKIE = "tpa-admin-session";

const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

function textEncoder() {
  return new TextEncoder();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlEncodeJson(value: unknown): string {
  return bytesToBase64Url(textEncoder().encode(JSON.stringify(value)));
}

function base64UrlDecodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function adminAuthEnabled() {
  return process.env.ADMIN_AUTH_ENABLED !== "false" && process.env.TPA_ADMIN_AUTH_ENABLED !== "false";
}

export function getAdminAuthSecret() {
  const secret = process.env.ADMIN_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "development-admin-auth-secret";
  return "";
}

export function roleAllows(actual: AdminRole, required: AdminRole) {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export async function createAdminSessionToken(claims: AdminSessionClaims, secret = getAdminAuthSecret()) {
  if (!secret) {
    throw new Error("ADMIN_AUTH_SECRET is required when admin auth is enabled in production");
  }

  const payload = base64UrlEncodeJson(claims);
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder().encode(payload));

  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(token: string | undefined, secret = getAdminAuthSecret()) {
  if (!token || !secret) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const key = await hmacKey(secret);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(base64UrlToBytes(signature)),
    toArrayBuffer(textEncoder().encode(payload)),
  );

  if (!verified) return null;

  const claims = base64UrlDecodeJson<AdminSessionClaims>(payload);
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  if (!["viewer", "editor", "admin"].includes(claims.role)) return null;

  return claims;
}
