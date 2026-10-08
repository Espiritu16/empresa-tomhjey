import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/configuracion/preparar.ts",
  globalTeardown: "./e2e/configuracion/limpiar.ts",
  outputDir: "./test-results",
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    screenshot: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://localhost:3000/acceso",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
