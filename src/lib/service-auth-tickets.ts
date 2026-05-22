import "server-only";
import { randomBytes } from "crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db, serviceAuthTickets, sessions } from "@/lib/db";

const TICKET_TTL_MS = 5 * 60 * 1000;
export const SERVICE_AUTH_TICKET_PARAM = "tpa-auth-ticket";

export async function createServiceAuthTicket(input: {
  serviceId: string;
  sessionToken: string;
  returnTo: string;
  userIdentifier?: string;
}) {
  await cleanupExpiredServiceAuthTickets();

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);

  await db.insert(serviceAuthTickets).values({
    serviceId: input.serviceId,
    sessionToken: input.sessionToken,
    returnTo: input.returnTo,
    userIdentifier: input.userIdentifier,
    token,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function consumeServiceAuthTicket(token: string, serviceId: string) {
  const now = new Date();
  const [ticket] = await db
    .update(serviceAuthTickets)
    .set({ consumedAt: now })
    .where(and(
      eq(serviceAuthTickets.token, token),
      eq(serviceAuthTickets.serviceId, serviceId),
      isNull(serviceAuthTickets.consumedAt),
      gt(serviceAuthTickets.expiresAt, now),
    ))
    .returning();

  if (!ticket) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.sessionToken, ticket.sessionToken),
      eq(sessions.serviceId, serviceId),
      gt(sessions.expiresAt, now),
    ))
    .limit(1);

  if (!session) return null;

  return { ticket, session };
}

export async function cleanupExpiredServiceAuthTickets() {
  await db.delete(serviceAuthTickets).where(lt(serviceAuthTickets.expiresAt, new Date()));
}

export function appendServiceAuthTicket(url: string, token: string) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set(SERVICE_AUTH_TICKET_PARAM, token);
  return nextUrl.toString();
}

export function removeServiceAuthTicket(url: string) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.delete(SERVICE_AUTH_TICKET_PARAM);
  return nextUrl.toString();
}
