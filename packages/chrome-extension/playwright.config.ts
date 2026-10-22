import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  // Each test launches its own Chromium with the extension loaded.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
});
