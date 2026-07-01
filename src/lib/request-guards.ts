import { NextRequest, NextResponse } from "next/server";

const DEFAULT_JSON_LIMIT_BYTES = 64 * 1024;

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export class RequestBodyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

export async function readJsonBody<T = unknown>(request: NextRequest, maxBytes = DEFAULT_JSON_LIMIT_BYTES): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestBodyError("Request body is too large", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestBodyError("Request body is too large", 413);
  }

  if (!text.trim()) {
    throw new RequestBodyError("Request body is required", 400);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON", 400);
  }
}

export async function readOptionalJsonBody<T = unknown>(
  request: NextRequest,
  fallback: T,
  maxBytes = DEFAULT_JSON_LIMIT_BYTES,
): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestBodyError("Request body is too large", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestBodyError("Request body is too large", 413);
  }

  if (!text.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON", 400);
  }
}

export function bodyErrorResponse(error: unknown, fallback = "Invalid request body") {
  if (error instanceof RequestBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: fallback }, { status: 400 });
}

export function rateLimit(request: NextRequest, options: RateLimitOptions) {
  const now = Date.now();
  cleanupRateLimitBuckets(now);

  const bucketKey = `${options.key}:${clientKey(request)}`;
  const bucket = rateLimitBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.limit) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function clientKey(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

function cleanupRateLimitBuckets(now: number) {
  if (rateLimitBuckets.size < 1000) return;

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}
