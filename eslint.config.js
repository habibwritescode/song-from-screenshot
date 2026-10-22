import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/.wrangler/",
      "**/coverage/",
      "**/test-results/",
      "**/playwright-report/",
      "**/dist/",
      "**/worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
);
