import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && rm -rf .next/standalone/.next/static .next/standalone/public && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && ADMIN_AUTH_ENABLED=false TARGET_TEST_ALLOW_CIDRS=127.0.0.0/8,::1/128 PORT=3100 HOSTNAME=0.0.0.0 node .next/standalone/server.js",
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
