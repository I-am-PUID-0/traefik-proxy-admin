import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("Traefik middleware discovery route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("disables discovery in production when TRAEFIK_API_URL is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRAEFIK_API_URL", "");
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/traefik/middlewares/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      configured: false,
      error: "TRAEFIK_API_URL is not configured",
      middlewares: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
