import { defineConfig, devices } from "@playwright/test";

// 3100 é a porta do `pnpm dev` deste projeto (package.json). O default era
// 3000 e nunca bateu: o webServer subia em 3100 e o Playwright esperava em
// 3000 até estourar os 120s. Como a suíte nunca chegou a rodar (o
// @playwright/test só foi instalado agora), o descompasso ficou invisível.
const PORT = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
