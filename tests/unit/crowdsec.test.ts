import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchCrowdSecDecisions } from "@/lib/crowdsec";

describe("crowdsec helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports unconfigured status without calling CrowdSec", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCrowdSecDecisions()).resolves.toMatchObject({
      configured: false,
      reachable: false,
      decisions: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches active decisions with the configured bouncer key", async () => {
    vi.stubEnv("CROWDSEC_LAPI_URL", "http://crowdsec:8080/");
    vi.stubEnv("CROWDSEC_BOUNCER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        deleted: null,
        new: [
          {
            id: 42,
            origin: "crowdsec",
            scenario: "crowdsecurity/http-probing",
            scope: "Ip",
            type: "ban",
            value: "203.0.113.10",
            duration: "3h59m",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await fetchCrowdSecDecisions();

    expect(status).toMatchObject({
      configured: true,
      reachable: true,
      apiUrl: "http://crowdsec:8080",
      mode: "stream",
      decisions: [
        {
          id: 42,
          origin: "crowdsec",
          scenario: "crowdsecurity/http-probing",
          scope: "Ip",
          type: "ban",
          value: "203.0.113.10",
          duration: "3h59m",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith("http://crowdsec:8080/v1/decisions/stream?startup=true", expect.objectContaining({
      headers: expect.objectContaining({
        "Accept": "application/json",
        "X-Api-Key": "test-key",
      }),
    }));
  });

  it("returns a safe error when CrowdSec rejects the bouncer key", async () => {
    vi.stubEnv("CROWDSEC_LAPI_URL", "http://crowdsec:8080");
    vi.stubEnv("CROWDSEC_BOUNCER_API_KEY", "bad-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "forbidden" }),
    }));

    await expect(fetchCrowdSecDecisions()).resolves.toMatchObject({
      configured: true,
      reachable: false,
      decisions: [],
      error: "CrowdSec rejected the bouncer API key",
    });
  });
});
