import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de UI (browser headless) do CrIA Treino.
 * Exige um dev server ativo: `npm run dev` em outro terminal.
 *
 *   npm run test:ui
 *   BASE_URL=http://192.168.1.10:3000 npm run test:ui
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
