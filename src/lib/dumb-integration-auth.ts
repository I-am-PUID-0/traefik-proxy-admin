import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function isDumbIntegrationAuthorized(request: NextRequest) {
  const expected = process.env.DUMB_INTEGRATION_TOKEN?.trim() || "";
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length < 32 || expectedBytes.length !== suppliedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, suppliedBytes);
}
