import { db, sharedLinks, SharedLink } from "@/lib/db";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "crypto";

export function generateShareToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSharedLink(
  serviceId: string,
  expiresAt: Date,
  sessionDurationMinutes: number = 60
): Promise<SharedLink> {
  const token = generateShareToken();
  
  const [sharedLink] = await db
    .insert(sharedLinks)
    .values({
      serviceId,
      token,
      expiresAt,
      sessionDurationMinutes,
    })
    .returning();
  
  return sharedLink;
}

export async function getSharedLink(token: string): Promise<SharedLink | null> {
  const [sharedLink] = await db
    .select()
    .from(sharedLinks)
    .where(eq(sharedLinks.token, token));
  
  if (!sharedLink) return null;
  
  // Check if link is expired
  if (sharedLink.expiresAt < new Date()) {
    return null;
  }
  
  return sharedLink;
}

export async function consumeSharedLink(token: string, serviceId?: string): Promise<SharedLink | null> {
  const now = new Date();
  const conditions = [
    eq(sharedLinks.token, token),
    eq(sharedLinks.isUsed, false),
    gt(sharedLinks.expiresAt, now),
  ];

  if (serviceId) {
    conditions.push(eq(sharedLinks.serviceId, serviceId));
  }

  const [updatedLink] = await db
    .update(sharedLinks)
    .set({
      isUsed: true,
      usedAt: now,
    })
    .where(and(...conditions))
    .returning();
  
  return updatedLink || null;
}
