import { defineConfig, devices } from "@playwright/test";

export const PORT = 8799;

export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  // The real Worker serves the app, so static assets, _headers and the
  // /share fallback are tested as deployed. Tests intercept /api/resolve, so
  // no Claude call is made; anything that slipped through would carry the
  // test token and get 401.
  webServer: {
    command: `npx wrangler dev --port ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
