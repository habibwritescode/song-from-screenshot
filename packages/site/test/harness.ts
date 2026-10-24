import { test as base, expect } from "@playwright/test";

export { expect };

/**
 * Every test fails if the page logs an error (CSP violations are logged as
 * errors), throws, or requests anything from another origin. The page is
 * meant to be fully same-origin with no script, so any of these is a bug.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      if (!baseURL) throw new Error("Set use.baseURL in playwright.config.ts");
      const origin = new URL(baseURL).origin;
      page.on("console", (message) => {
        if (message.type() === "error")
          problems.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) =>
        problems.push(`page error: ${error.message}`),
      );
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith("http") && url.origin !== origin) {
          problems.push(`outside request: ${url.href}`);
        }
      });
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});
