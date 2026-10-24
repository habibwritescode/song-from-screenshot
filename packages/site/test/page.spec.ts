import { expect, test } from "./harness";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the home page loads", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("every in-page link has a target", async ({ page }) => {
  const targets = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")?.slice(1) ?? ""),
    );
  expect(targets.length).toBeGreaterThan(0);
  for (const id of targets) {
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
  }
});

test("every image loads, in light and dark", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.reload();
    // Images in hidden demo examples are only fetched when shown.
    for (const label of [
      "Spotify on X",
      "Apple Music on Android",
      "Instagram story",
      "A post with no song",
    ]) {
      await page.getByText(label, { exact: true }).click();
    }
    const broken = await page.locator("img").evaluateAll(async (images) => {
      const results = await Promise.all(
        (images as HTMLImageElement[]).map(async (img) => {
          img.loading = "eager";
          try {
            await img.decode();
            return null;
          } catch {
            return img.currentSrc || img.src;
          }
        }),
      );
      return results.filter((src) => src !== null);
    });
    expect(broken).toEqual([]);
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no sideways scrolling on a 375 px phone, ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 375, height: 800 });
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBe(375);
  });
}

test("the link-preview image is served by the site", async ({
  page,
  request,
}) => {
  const image = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  // The tag points at the deployed site; its path must exist here too.
  const response = await request.get(new URL(image ?? "").pathname);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("every link to another site opens in a new tab", async ({ page }) => {
  const external = page.locator('a[href^="http"]');
  expect(await external.count()).toBeGreaterThan(0);
  for (const link of await external.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
    await expect(link).toHaveAccessibleDescription("Opens in a new tab");
  }
});

test("robots.txt is a real text file", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/plain");
});

test("an unknown address gets a 404 page, not the home page", async ({
  page,
}) => {
  // Nested, so the page's styles and icon must use absolute paths to load.
  const response = await page.goto("/no/such/page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Page not found.",
  );
  await expect(page.locator(".header")).toHaveCSS("display", "flex");
});

test("the page's text is set in Inter, loaded from the site", async ({
  page,
}) => {
  const status = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.family.replaceAll('"', "") === "Inter")
      .map((face) => face.status);
  });
  expect(status).toEqual(["loaded"]);
});
