import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && ADMIN_AUTH_ENABLED=false TARGET_TEST_ALLOW_CIDRS=127.0.0.0/8,::1/128 pnpm exec next start --port 3100",
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
