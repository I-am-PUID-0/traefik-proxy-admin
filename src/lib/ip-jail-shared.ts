import { isIP } from "node:net";

import type { IpJailDecision } from "@/lib/db/schema";

export interface IpJailDecisionDto {
  id: string;
  subject: string;
  reason: string | null;
  source: string;
  evidence: string | null;
  isEnabled: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeIpJailSubject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("IP address or CIDR range is required");
  }

  const [address, prefix, extra] = trimmed.split("/");
  if (extra !== undefined || !address) {
    throw new Error("Use a single IP address or CIDR range");
  }

  const ipVersion = isIP(address);
  if (!ipVersion) {
    throw new Error("Use a valid IPv4 or IPv6 address");
  }

  if (prefix === undefined) {
    return address.toLowerCase();
  }

  if (!/^\d+$/.test(prefix)) {
    throw new Error("CIDR prefix must be a number");
  }

  const prefixNumber = Number(prefix);
  const maxPrefix = ipVersion === 4 ? 32 : 128;
  if (prefixNumber < 0 || prefixNumber > maxPrefix) {
    throw new Error(`CIDR prefix must be between 0 and ${maxPrefix}`);
  }

  return `${address.toLowerCase()}/${prefixNumber}`;
}

export function isLoopbackIpJailSubject(value: string) {
  let subject: string;
  try {
    subject = normalizeIpJailSubject(value);
  } catch {
    return false;
  }

  const address = subject.split("/")[0];
  return address.startsWith("127.") || address === "::1" || address === "0:0:0:0:0:0:0:1";
}

export function serializeIpJailDecision(decision: IpJailDecision, now = new Date()): IpJailDecisionDto {
  const expiresAt = decision.expiresAt;
  const isActive = decision.isEnabled && (!expiresAt || expiresAt > now);

  return {
    id: decision.id,
    subject: decision.subject,
    reason: decision.reason,
    source: decision.source,
    evidence: decision.evidence,
    isEnabled: decision.isEnabled,
    isActive,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    createdAt: decision.createdAt.toISOString(),
    updatedAt: decision.updatedAt.toISOString(),
  };
}
