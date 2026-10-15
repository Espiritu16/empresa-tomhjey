import { defineConfig, devices } from "@playwright/test";

const puerto = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${puerto}`;
const reutilizarServidor = process.env.PLAYWRIGHT_REUSE_SERVER
  ? process.env.PLAYWRIGHT_REUSE_SERVER === "true"
  : !process.env.CI;

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
    baseURL,
    trace: "off",
    screenshot: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${puerto}`,
    url: `${baseURL}/acceso`,
    reuseExistingServer: reutilizarServidor,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
