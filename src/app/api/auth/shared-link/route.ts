import { NextRequest, NextResponse } from "next/server";
import { consumeSharedLink } from "@/lib/shared-links";
import { sessionManager } from "@/lib/session-manager";
import { randomBytes } from "crypto";
import { TRAEFIK_SESSION_COOKIE, COOKIE_DEFAULTS } from "@/lib/constants";
import { getSessionRequestContext } from "@/lib/session-request-context";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Use the shared link
    const sharedLink = await consumeSharedLink(token);
    
    if (!sharedLink) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    // Create a new session with optimal cookie expiry
    const sessionToken = randomBytes(32).toString("hex");
    
    const { session, cookieExpiresAt } = await sessionManager.createSessionWithOptimalCookieExpiry(
      sharedLink.serviceId,
      sessionToken,
      sharedLink.sessionDurationMinutes,
      sharedLink.id,
      "shared-link-user",
      {
        ...getSessionRequestContext(request),
        authMethod: "shared_link",
      },
    );

    // Set session cookie
    const response = NextResponse.json({ 
      success: true,
      message: "Access granted",
      expiresAt: session.expiresAt,
      cookieExpiresAt
    });
    
    response.cookies.set(TRAEFIK_SESSION_COOKIE, sessionToken, {
      ...COOKIE_DEFAULTS,
      expires: cookieExpiresAt,
    });

    return response;
    
  } catch (error) {
    console.error("Shared link auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
