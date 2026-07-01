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
  const appPort = Number(new URL(test.info().project.use.baseURL ?? "http://localhost:3100").port);
  const suffix = `e2e-${Date.now().toString(36)}`;
  const domainName = `${suffix}.example.test`;
  const subdomain = `app-${suffix}`;
  const routerName = `router-${subdomain}`;
  const serviceName = `service-${subdomain}`;
  const headerMiddlewareName = `headers-${subdomain}`;
  const bypassRouterName = `${routerName}-api-bypass`;

  let domainId: string | undefined;
  let serviceId: string | undefined;
  let importedServiceId: string | undefined;

  const advancedRule = `Host(\`${subdomain}.${domainName}\`) && Query(\`apikey\`,\`REDACTED\`)`;
  const redirectRegex = `^https?://${subdomain}\\.${domainName}/$`;
  const redirectMiddleware = {
    redirectRegex: {
      regex: redirectRegex,
      replacement: `https://${subdomain}.${domainName}/admin`,
      permanent: true,
    },
  };
  const advancedRouter = {
    name: "api-bypass",
    rule: advancedRule,
    entrypoint: "websecure",
    middlewares: [],
    certResolver: "letsencrypt",
    priority: 100,
  };

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
        serviceGroup: "E2E Group",
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
    expect(service.serviceGroup).toBe("E2E Group");
    expect(service.domainId).toBe(domainId);
    expect(service.subdomain).toBe(subdomain);

    const serviceDetail = await request.get(`/api/services/${serviceId}`);
    expect(serviceDetail.ok()).toBe(true);
    const serviceBody = await serviceDetail.json();
    expect(serviceBody.domain.domain).toBe(domainName);

    const updateData = {
      name: `E2E Service ${suffix} Updated`,
      serviceGroup: "E2E Group Updated",
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
      passHostHeader: false,
      managedMiddlewares: {
        "redirect-to-admin": redirectMiddleware,
      },
      advancedRouters: [advancedRouter],
    };

    const updateService = await request.put(`/api/services/${serviceId}`, {
      data: updateData,
    });

    expect(updateService.ok()).toBe(true);

    const targetTest = await request.post("/api/services/test-target", {
      data: {
        targetIp: "127.0.0.1",
        targetPort: appPort,
      },
    });
    expect(targetTest.ok()).toBe(true);
    const targetTestBody = await targetTest.json();
    expect(targetTestBody.reachable).toBe(true);

    const previewResponse = await request.post("/api/traefik/service-preview", {
      data: {
        serviceId,
        ...updateData,
      },
    });
    expect(previewResponse.ok()).toBe(true);
    const preview = await previewResponse.json();
    expect(preview.proposed.routerName).toBe(routerName);
    expect(preview.proposed.serviceName).toBe(serviceName);
    expect(preview.proposed.router.middlewares).toContain("compress@file");
    expect(preview.proposed.routers[bypassRouterName]).toMatchObject({
      rule: advancedRule,
      service: serviceName,
      entryPoints: ["websecure"],
      priority: 100,
      tls: {
        certResolver: "letsencrypt",
      },
    });
    expect(preview.proposed.routers[bypassRouterName].middlewares).toBeUndefined();
    expect(preview.proposed.middlewares["redirect-to-admin"]).toEqual(redirectMiddleware);

    const configResponse = await request.get("/api/traefik/config");
    expect(configResponse.ok()).toBe(true);
    const config = await configResponse.json();

    expect(config.http.services[serviceName].loadBalancer.servers).toEqual([
      { url: "https://127.0.0.1:9090" },
    ]);
    expect(config.http.services[serviceName].loadBalancer.passHostHeader).toBe(false);
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
    expect(config.http.routers[bypassRouterName]).toMatchObject({
      rule: advancedRule,
      service: serviceName,
      entryPoints: ["websecure"],
      priority: 100,
      tls: {
        certResolver: "letsencrypt",
      },
    });
    expect(config.http.routers[bypassRouterName].middlewares).toBeUndefined();
    expect(config.http.middlewares[headerMiddlewareName]).toEqual({
      headers: {
        customRequestHeaders: {
          "X-E2E-Test": `${suffix}-updated`,
        },
      },
    });
    expect(config.http.middlewares["redirect-to-admin"]).toEqual(redirectMiddleware);

    const exportServiceResponse = await request.get(`/api/services/${serviceId}/export`);
    expect(exportServiceResponse.ok()).toBe(true);
    const serviceExport = await exportServiceResponse.json();
    expect(serviceExport).toMatchObject({
      format: "traefik-proxy-admin.services",
      version: 1,
    });
    expect(serviceExport.services).toHaveLength(1);
    expect(serviceExport.services[0]).toMatchObject({
      name: updateData.name,
      serviceGroup: "E2E Group Updated",
      subdomain,
      targetIp: "127.0.0.1",
      targetPort: 9090,
      passHostHeader: false,
      domain: { domain: domainName },
    });
    expect(serviceExport.services[0].middlewares).toEqual(["compress@file"]);
    expect(serviceExport.services[0].managedMiddlewares["redirect-to-admin"]).toEqual(redirectMiddleware);
    expect(serviceExport.services[0].advancedRouters).toEqual([advancedRouter]);

    const exportAllResponse = await request.get("/api/services/export");
    expect(exportAllResponse.ok()).toBe(true);
    const allExport = await exportAllResponse.json();
    expect(allExport.services.some((exportedService: { name: string }) => exportedService.name === updateData.name)).toBe(true);

    const skippedImportResponse = await request.post("/api/services/import", {
      data: {
        payload: serviceExport,
        conflictStrategy: "skip",
      },
    });
    expect(skippedImportResponse.ok()).toBe(true);
    const skippedImport = await skippedImportResponse.json();
    expect(skippedImport.imported).toBe(0);
    expect(skippedImport.skipped).toBe(1);

    const renamedImportResponse = await request.post("/api/services/import", {
      data: {
        payload: serviceExport,
        conflictStrategy: "rename",
      },
    });
    expect(renamedImportResponse.ok()).toBe(true);
    const renamedImport = await renamedImportResponse.json();
    expect(renamedImport.imported).toBe(1);
    importedServiceId = renamedImport.services[0].serviceId;
    expect(renamedImport.services[0].name).toContain("imported");

    const importedServiceResponse = await request.get(`/api/services/${importedServiceId}`);
    expect(importedServiceResponse.ok()).toBe(true);
    const importedService = await importedServiceResponse.json();
    expect(importedService.name).toContain("imported");
    expect(importedService.serviceGroup).toBe("E2E Group Updated");
    expect(importedService.subdomain).toContain("imported");

    const deleteImportedService = await request.delete(`/api/services/${importedServiceId}`);
    expect(deleteImportedService.ok()).toBe(true);
    importedServiceId = undefined;

    const domainWithServices = await request.get(`/api/domains/${domainId}`);
    expect(domainWithServices.ok()).toBe(true);
    const domainWithServicesBody = await domainWithServices.json();
    expect(domainWithServicesBody.serviceCount).toBe(1);

    const deleteService = await request.delete(`/api/services/${serviceId}`);
    expect(deleteService.ok()).toBe(true);
    serviceId = undefined;

    const deleteDomain = await request.delete(`/api/domains/${domainId}`);
    expect(deleteDomain.ok()).toBe(true);
    domainId = undefined;
  } finally {
    if (importedServiceId) {
      await request.delete(`/api/services/${importedServiceId}`);
    }
    if (serviceId) {
      await request.delete(`/api/services/${serviceId}`);
    }
    if (domainId) {
      await request.delete(`/api/domains/${domainId}`);
    }
  }
});
