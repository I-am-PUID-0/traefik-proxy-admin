import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { getAdminAuthSecret } from "./admin-auth-shared";

export type SignedSSOStateData = {
  type?: "service" | "admin";
  serviceId?: string;
  returnTo?: string | null;
  ssoConfigId?: string | null;
  timestamp: number;
};

export function createSignedSSOState(data: SignedSSOStateData) {
  const payload = Buffer.from(JSON.stringify({ ...data, nonce: randomBytes(16).toString("hex") }), "utf8").toString("base64url");
  const signature = signPayload(payload);
  return "v1." + payload + "." + signature;
}

export function verifySignedSSOState(state: string) {
  const [version, payload, signature] = state.split(".");
  if (version !== "v1" || !payload || !signature) return null;

  const expected = signPayload(payload);
  const actualBytes = Buffer.from(signature, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");

  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedSSOStateData;
  } catch {
    return null;
  }
}

function signPayload(payload: string) {
  const secret = getAdminAuthSecret();
  if (!secret) {
    throw new Error("ADMIN_AUTH_SECRET is required for SSO state signing in production");
  }

  return createHmac("sha256", secret).update(payload).digest("base64url");
}
