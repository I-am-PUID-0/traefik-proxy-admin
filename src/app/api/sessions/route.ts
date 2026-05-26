import { NextResponse } from "next/server";
import { db, domains, sessions, services } from "@/lib/db";
import { sessionManager } from "@/lib/session-manager";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    // Get all sessions with service information
    const sessionsWithServices = await db
      .select({
        id: sessions.id,
        serviceId: sessions.serviceId,
        sessionToken: sessions.sessionToken,
        userIdentifier: sessions.userIdentifier,
        authMethod: sessions.authMethod,
        clientIp: sessions.clientIp,
        clientIpSource: sessions.clientIpSource,
        lastIp: sessions.lastIp,
        ipChanged: sessions.ipChanged,
        userAgent: sessions.userAgent,
        lastUserAgent: sessions.lastUserAgent,
        userAgentChanged: sessions.userAgentChanged,
        requestedHost: sessions.requestedHost,
        entryPoint: sessions.entryPoint,
        lastPath: sessions.lastPath,
        accessCount: sessions.accessCount,
        riskFlags: sessions.riskFlags,
        ssoIssuer: sessions.ssoIssuer,
        ssoSubject: sessions.ssoSubject,
        ssoEmail: sessions.ssoEmail,
        ssoName: sessions.ssoName,
        ssoGroups: sessions.ssoGroups,
        expiresAt: sessions.expiresAt,
        lastAccessedAt: sessions.lastAccessedAt,
        createdAt: sessions.createdAt,
        serviceName: services.name,
        subdomain: services.subdomain,
        hostnameMode: services.hostnameMode,
        customHostnames: services.customHostnames,
        domain: domains.domain,
      })
      .from(sessions)
      .leftJoin(services, eq(sessions.serviceId, services.id))
      .leftJoin(domains, eq(services.domainId, domains.id));

    return NextResponse.json(sessionsWithServices);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Delete all sessions
    await db.delete(sessions);
    
    // Clear memory cache
    const activeSessions = sessionManager.getActiveSessions();
    for (const session of activeSessions) {
      await sessionManager.deleteSession(session.sessionToken);
    }

    return NextResponse.json({ message: "All sessions deleted successfully" });
  } catch (error) {
    console.error("Error deleting all sessions:", error);
    return NextResponse.json(
      { error: "Failed to delete sessions" },
      { status: 500 }
    );
  }
}