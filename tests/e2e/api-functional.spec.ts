import { expect, test } from "@playwright/test";

test("health endpoint reports an operational app", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);

  const health = await response.json();
  expect(health.status).toBe("ok");
  expect(health.timestamp).toEqual(expect.any(String));
  expect(health.uptime).toEqual(expect.any(Number));
});

test("service lifecycle updates the generated Traefik config", async ({ request }) => {
  const suffix = `e2e-${Date.now().toString(36)}`;
  const domainName = `${suffix}.example.test`;
  const subdomain = `app-${suffix}`;
  const routerName = `router-${subdomain}`;
  const serviceName = `service-${subdomain}`;
  const headerMiddlewareName = `headers-${subdomain}`;

  let domainId: string | undefined;
  let serviceId: string | undefined;

  try {
    const createDomain = await request.post("/api/domains", {
      data: {
        name: `E2E ${suffix}`,
        domain: domainName,
        description: "Created by Playwright functional test",
        useWildcardCert: true,
        certResolver: "letsencrypt",
        isDefault: false,
      },
    });

    expect(createDomain.ok()).toBe(true);
    const domain = await createDomain.json();
    domainId = domain.id;
    expect(domain.domain).toBe(domainName);

    const domainDetail = await request.get(`/api/domains/${domainId}`);
    expect(domainDetail.ok()).toBe(true);
    await expect(async () => {
      const body = await domainDetail.json();
      expect(body.serviceCount).toBe(0);
    }).toPass();

    const createService = await request.post("/api/services", {
      data: {
        name: `E2E Service ${suffix}`,
        subdomain,
        hostnameMode: "subdomain",
        domainId,
        targetIp: "127.0.0.1",
        targetPort: 8080,
        entrypoint: "websecure",
        isHttps: false,
        insecureSkipVerify: false,
        enabled: true,
        enableDurationMinutes: null,
        middlewares: "compress@file",
        requestHeaders: {
          "X-E2E-Test": suffix,
        },
      },
    });

    expect(createService.ok()).toBe(true);
    const service = await createService.json();
    serviceId = service.id;
    expect(service.domainId).toBe(domainId);
    expect(service.subdomain).toBe(subdomain);

    const serviceDetail = await request.get(`/api/services/${serviceId}`);
    expect(serviceDetail.ok()).toBe(true);
    const serviceBody = await serviceDetail.json();
    expect(serviceBody.domain.domain).toBe(domainName);

    const updateService = await request.put(`/api/services/${serviceId}`, {
      data: {
        name: `E2E Service ${suffix} Updated`,
        subdomain,
        hostnameMode: "subdomain",
        domainId,
        targetIp: "127.0.0.1",
        targetPort: 9090,
        entrypoint: "websecure",
        isHttps: true,
        insecureSkipVerify: true,
        enabled: true,
        enableDurationMinutes: null,
        middlewares: "compress@file",
        requestHeaders: {
          "X-E2E-Test": `${suffix}-updated`,
        },
      },
    });

    expect(updateService.ok()).toBe(true);

    const configResponse = await request.get("/api/traefik/config");
    expect(configResponse.ok()).toBe(true);
    const config = await configResponse.json();

    expect(config.http.services[serviceName].loadBalancer.servers).toEqual([
      { url: "https://127.0.0.1:9090" },
    ]);
    expect(config.http.services[serviceName].loadBalancer.serversTransport).toBe(
      `insecure-transport-${subdomain}`,
    );
    expect(config.http.serversTransports[`insecure-transport-${subdomain}`]).toEqual({
      insecureSkipVerify: true,
    });
    expect(config.http.routers[routerName]).toMatchObject({
      rule: `Host(\`${subdomain}.${domainName}\`)`,
      service: serviceName,
      entryPoints: ["websecure"],
      tls: {
        certResolver: "letsencrypt",
        domains: [
          {
            main: domainName,
            sans: [`*.${domainName}`],
          },
        ],
      },
    });
    expect(config.http.routers[routerName].middlewares).toEqual([
      headerMiddlewareName,
      "compress@file",
    ]);
    expect(config.http.middlewares[headerMiddlewareName]).toEqual({
      headers: {
        customRequestHeaders: {
          "X-E2E-Test": `${suffix}-updated`,
        },
      },
    });

    const toggleService = await request.post(`/api/services/${serviceId}/toggle`, {
      data: {},
    });
    expect(toggleService.ok()).toBe(true);
    const toggled = await toggleService.json();
    expect(toggled.enabled).toBe(false);

    const disabledConfigResponse = await request.get("/api/traefik/config");
    expect(disabledConfigResponse.ok()).toBe(true);
    const disabledConfig = await disabledConfigResponse.json();
    expect(disabledConfig.http.routers[routerName]).toBeUndefined();
    expect(disabledConfig.http.services[serviceName]).toBeUndefined();
  } finally {
    if (serviceId) {
      await request.delete(`/api/services/${serviceId}`);
    }

    if (domainId) {
      await request.delete(`/api/domains/${domainId}`);
    }
  }
});
