import "server-only";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db, ipJailDecisions, type NewIpJailDecision } from "@/lib/db";
import { isLoopbackIpJailSubject, normalizeIpJailSubject, serializeIpJailDecision } from "@/lib/ip-jail-shared";

const MAX_REASON_LENGTH = 500;
const MAX_EVIDENCE_LENGTH = 1000;
const MAX_SOURCE_LENGTH = 80;

export interface CreateIpJailDecisionInput {
  subject: string;
  reason?: string | null;
  source?: string | null;
  evidence?: string | null;
  expiresAt?: Date | null;
  allowLocalhost?: boolean;
}

export function activeIpJailCondition(now = new Date()) {
  return and(
    eq(ipJailDecisions.isEnabled, true),
    or(isNull(ipJailDecisions.expiresAt), gt(ipJailDecisions.expiresAt, now)),
  );
}

export function ipJailEnforcementEnabled() {
  const value = process.env.TPA_IP_JAIL_ENFORCEMENT?.trim().toLowerCase();
  return !["0", "false", "no", "off", "disabled"].includes(value || "");
}

export async function listIpJailDecisions() {
  const now = new Date();
  const decisions = await db
    .select()
    .from(ipJailDecisions)
    .orderBy(desc(ipJailDecisions.createdAt));

  return decisions.map((decision) => serializeIpJailDecision(decision, now));
}

export async function listActiveIpJailSubjects() {
  const decisions = await db
    .select({ subject: ipJailDecisions.subject })
    .from(ipJailDecisions)
    .where(activeIpJailCondition());

  return Array.from(new Set(decisions.map((decision) => decision.subject))).sort();
}

export async function createIpJailDecision(input: CreateIpJailDecisionInput) {
  const now = new Date();
  const subject = normalizeIpJailSubject(input.subject);
  if (isLoopbackIpJailSubject(subject) && !input.allowLocalhost) {
    throw new Error("Loopback addresses require explicit confirmation");
  }

  const values: NewIpJailDecision = {
    subject,
    reason: cleanOptionalText(input.reason, MAX_REASON_LENGTH),
    source: cleanSource(input.source),
    evidence: cleanOptionalText(input.evidence, MAX_EVIDENCE_LENGTH),
    expiresAt: input.expiresAt ?? null,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  };

  const [decision] = await db.insert(ipJailDecisions).values(values).returning();
  return serializeIpJailDecision(decision, now);
}

export async function deleteIpJailDecision(id: string) {
  await db.delete(ipJailDecisions).where(eq(ipJailDecisions.id, id));
}

function cleanOptionalText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanSource(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "manual";
  return trimmed.slice(0, MAX_SOURCE_LENGTH).replace(/[^a-zA-Z0-9_.:-]/g, "-");
}
