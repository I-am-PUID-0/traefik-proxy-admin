import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { readJsonBody, readOptionalJsonBody, RequestBodyError } from "@/lib/request-guards";

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("request body guards", () => {
  it("parses JSON bodies within the configured limit", async () => {
    await expect(readJsonBody(jsonRequest(JSON.stringify({ ok: true })), 64)).resolves.toEqual({ ok: true });
  });

  it("rejects bodies larger than the configured limit", async () => {
    await expect(readJsonBody(jsonRequest(JSON.stringify({ value: "too-large" })), 8)).rejects.toMatchObject({
      name: "RequestBodyError",
      status: 413,
    } satisfies Partial<RequestBodyError>);
  });

  it("returns the fallback for optional empty JSON bodies", async () => {
    await expect(readOptionalJsonBody(jsonRequest(""), { durationMinutes: null })).resolves.toEqual({
      durationMinutes: null,
    });
  });

  it("still parses optional bodies when content length is absent", async () => {
    await expect(
      readOptionalJsonBody(jsonRequest(JSON.stringify({ durationMinutes: 30 })), { durationMinutes: null }),
    ).resolves.toEqual({ durationMinutes: 30 });
  });
});
