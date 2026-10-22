import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "istanbul",
      include: ["src/lib/**/*.ts", "src/ui/**/*.ts"],
    },
  },
});
