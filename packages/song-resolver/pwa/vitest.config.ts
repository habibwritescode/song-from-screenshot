import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
