import type { Page } from "@playwright/test";
import { expect, test } from "./harness";

// The Instagram story was recorded as partial (Deezer didn't answer), which is
// what tells it apart from the X example: same song, one link fewer, a note.
const EXAMPLES = [
  {
    label: "Spotify on X",
    title: "EGO",
    artist: "Naarly",
    links: 5,
    partial: false,
  },
  {
    label: "Apple Music on Android",
    title: "FE!N (feat. Playboi Carti)",
    artist: "Travis Scott",
    links: 5,
    partial: false,
  },
  {
    label: "Instagram story",
    title: "EGO",
    artist: "Naarly",
    links: 4,
    partial: true,
  },
];

const shown = (page: Page) => page.locator(".demo__example:visible");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("only one example is shown at a time", async ({ page }) => {
  await expect(shown(page)).toHaveCount(1);
  await page.getByText("Instagram story", { exact: true }).click();
  await expect(shown(page)).toHaveCount(1);
});

for (const example of EXAMPLES) {
  test(`clicking "${example.label}" shows its song`, async ({ page }) => {
    await page.getByText(example.label, { exact: true }).click();
    await expect(shown(page).locator(".title")).toHaveText(example.title);
    await expect(shown(page).locator(".artist")).toHaveText(example.artist);
    await expect(shown(page).getByRole("link")).toHaveCount(example.links);
    await expect(
      shown(page).getByText("Some platforms didn't answer."),
    ).toHaveCount(example.partial ? 1 : 0);
  });
}

test("arrow keys move through the examples", async ({ page }) => {
  await page.getByRole("radio", { name: "Spotify on X" }).focus();
  for (const example of EXAMPLES.slice(1)) {
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("radio", { name: example.label }),
    ).toBeFocused();
    await expect(shown(page).locator(".title")).toHaveText(example.title);
  }
});

test("a post with no player shows no song and no links", async ({ page }) => {
  await page.getByText("A post with no song", { exact: true }).click();
  await expect(shown(page).locator(".card")).toHaveText(
    "No song found in this image.",
  );
  await expect(shown(page).getByRole("link")).toHaveCount(0);
});

test("switching examples doesn't change the demo's height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const stage = page.locator(".demo__stage");
  const heights = new Set<number>();
  for (const label of [
    ...EXAMPLES.map((e) => e.label),
    "A post with no song",
  ]) {
    await page.getByText(label, { exact: true }).click();
    heights.add((await stage.boundingBox())?.height ?? 0);
  }
  expect(heights.size).toBe(1);
});

// The card starts 12 px low and rises; reduced motion keeps only its fade.
const cardOffset = (page: Page) =>
  shown(page)
    .locator(".card")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the card fades in without moving; nothing flashes or draws", async ({
    page,
  }) => {
    await page.getByText("Apple Music on Android", { exact: true }).click();
    expect(await cardOffset(page)).toBe(0);
    for (const still of [".viewfinder", ".connector__line"]) {
      const element = shown(page).locator(still).first();
      expect(await element.evaluate((el) => el.getAnimations().length)).toBe(0);
    }
    await expect(shown(page).locator(".card")).toHaveCSS("opacity", "1");
  });
});

test("without reduced motion, the card rises into place", async ({ page }) => {
  await page.getByText("Apple Music on Android", { exact: true }).click();
  expect(await cardOffset(page)).toBeGreaterThan(0);
  await expect(shown(page).locator(".card")).toHaveCSS("opacity", "1");
  expect(await cardOffset(page)).toBe(0);
});

test("the examples are one radio group named Try an example", async ({
  page,
}) => {
  const group = page.getByRole("radiogroup", { name: "Try an example" });
  await expect(group.getByRole("radio")).toHaveCount(4);
});
