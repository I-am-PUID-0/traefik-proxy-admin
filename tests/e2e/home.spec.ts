import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Traefik Admin" })).toBeVisible();
});


test("Traefik Live page loads", async ({ page }) => {
  await page.goto("/traefik");

  await expect(page.getByRole("heading", { name: "Traefik Live" })).toBeVisible();
  await expect(page.getByText("Live Resources", { exact: true })).toBeVisible();
});


test("Traefik import draft preloads add service form", async ({ page }) => {
  const draft = {
    name: "imported-router",
    hostnameMode: "custom",
    customHostnames: JSON.stringify(["imported.example.com"]),
    targetIp: "imported.docker",
    targetPort: 6767,
    entrypoint: "https",
    isHttps: false,
    insecureSkipVerify: false,
    passHostHeader: true,
    enabled: true,
    middlewares: "example-auth@file",
  };

  await page.goto(`/services/add?traefikImportDraft=1&draft=${encodeURIComponent(JSON.stringify(draft))}`);

  await expect(page.getByLabel("Service Name")).toHaveValue("imported-router");
  await expect(page.getByLabel("Target IP")).toHaveValue("imported.docker");
  await expect(page.getByLabel("Target Port")).toHaveValue("6767");
  await expect(page.getByLabel("Middlewares (comma-separated)")).toHaveValue("example-auth@file");
  await expect(page.getByLabel("Custom Hostnames")).toHaveValue("imported.example.com");
});

test("Traefik import draft preloads from browser storage without flag", async ({ page }) => {
  const draft = {
    name: "stored-import-no-flag",
    hostnameMode: "custom",
    customHostnames: JSON.stringify(["stored-no-flag.example.com"]),
    targetIp: "stored-no-flag.docker",
    targetPort: 9696,
    entrypoint: "https",
    isHttps: false,
    insecureSkipVerify: false,
    passHostHeader: true,
    enabled: true,
    middlewares: "example-auth@file",
  };

  await page.goto("/");
  await page.evaluate((value) => {
    window.sessionStorage.setItem("tpa-traefik-import-draft", value);
  }, JSON.stringify(draft));
  await page.goto("/services/add");

  await expect(page.getByLabel("Service Name")).toHaveValue("stored-import-no-flag");
  await expect(page.getByLabel("Target IP")).toHaveValue("stored-no-flag.docker");
  await expect(page.getByLabel("Target Port")).toHaveValue("9696");
  await expect(page.getByLabel("Middlewares (comma-separated)")).toHaveValue("example-auth@file");
  await expect(page.getByLabel("Custom Hostnames")).toHaveValue("stored-no-flag.example.com");
});

test("Traefik import draft preloads from browser storage", async ({ page }) => {
  const draft = {
    name: "stored-import-router",
    hostnameMode: "custom",
    customHostnames: JSON.stringify(["stored-import.example.com"]),
    targetIp: "stored-import.docker",
    targetPort: 8989,
    entrypoint: "https",
    isHttps: false,
    insecureSkipVerify: false,
    passHostHeader: true,
    enabled: true,
    middlewares: "example-auth@file",
  };

  await page.goto("/");
  await page.evaluate((value) => {
    window.sessionStorage.setItem("tpa-traefik-import-draft", value);
  }, JSON.stringify(draft));
  await page.goto("/services/add?traefikImportDraft=1");

  await expect(page.getByLabel("Service Name")).toHaveValue("stored-import-router");
  await expect(page.getByLabel("Target IP")).toHaveValue("stored-import.docker");
  await expect(page.getByLabel("Target Port")).toHaveValue("8989");
  await expect(page.getByLabel("Middlewares (comma-separated)")).toHaveValue("example-auth@file");
  await expect(page.getByLabel("Custom Hostnames")).toHaveValue("stored-import.example.com");
});

test("Traefik import draft uses saved Forever default duration", async ({ page, request }) => {
  const originalResponse = await request.get("/api/config");
  const originalConfig = originalResponse.ok() ? await originalResponse.json() : {};
  const restoredConfig = {
    globalMiddlewares: [],
    adminPanelDomain: "localhost:3000",
    ...originalConfig,
  };
  const draft = {
    name: "import-default-duration",
    hostnameMode: "subdomain",
    subdomain: "import-default-duration",
    targetIp: "import-default-duration.docker",
    targetPort: 8080,
    entrypoint: "https",
    isHttps: false,
    insecureSkipVerify: false,
    passHostHeader: true,
    enabled: true,
    middlewares: "example-auth@file",
  };

  await request.put("/api/config", {
    data: {
      ...restoredConfig,
      defaultEnableDurationMinutes: null,
    },
  });

  try {
    await page.goto(`/services/add?traefikImportDraft=1&draft=${encodeURIComponent(JSON.stringify(draft))}`);
    await expect(page.getByLabel("Service Name")).toHaveValue("import-default-duration");
    await expect(page.getByLabel("Auto-disable Duration")).toHaveValue("forever");
  } finally {
    await request.put("/api/config", { data: restoredConfig });
  }
});

test("Add service uses saved Forever default duration", async ({ page, request }) => {
  const originalResponse = await request.get("/api/config");
  const originalConfig = originalResponse.ok() ? await originalResponse.json() : {};
  const restoredConfig = {
    globalMiddlewares: [],
    adminPanelDomain: "localhost:3000",
    ...originalConfig,
  };

  await request.put("/api/config", {
    data: {
      ...restoredConfig,
      defaultEnableDurationMinutes: null,
    },
  });

  try {
    await page.goto("/services/add");
    await expect(page.getByLabel("Auto-disable Duration")).toHaveValue("forever");
  } finally {
    await request.put("/api/config", { data: restoredConfig });
  }
});
