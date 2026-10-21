/// <reference types="node" />
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Live tests call real APIs (and cost money), so they only run with LIVE=1.
const live = process.env.LIVE === "1";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: live ? ["test/live.test.ts"] : ["test/**/*.test.ts"],
    exclude: live ? [] : ["test/live.test.ts"],
    testTimeout: live ? 60_000 : 5_000,
    coverage: {
      provider: "istanbul",
      include: ["src/**"],
    },
  },
});
