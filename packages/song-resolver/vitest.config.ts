/// <reference types="node" />
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Live tests call real APIs (and cost money), so they only run with LIVE=1.
const live = process.env.LIVE === "1";

export default defineConfig({
  test: {
    // With LIVE=1 the client project has nothing to run.
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["src/**", "client/**"],
      exclude: ["client/test/**"],
    },
    projects: [
      {
        plugins: [
          cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } }),
        ],
        test: {
          name: "worker",
          include: live ? ["test/live.test.ts"] : ["test/**/*.test.ts"],
          exclude: live ? [] : ["test/live.test.ts"],
          testTimeout: live ? 60_000 : 5_000,
        },
      },
      // Code shared by the browser clients runs in Node, not workerd.
      {
        test: {
          name: "client",
          include: live ? [] : ["client/test/**/*.test.ts"],
        },
      },
    ],
  },
});
