import type { Page } from "@playwright/test";
import { expect, test, TOKEN, UNREACHABLE_URL, WORKER_URL } from "./harness";

async function openOptions(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // Wait for the saved settings to fill the form.
  await expect(page.locator("#workerUrl")).toHaveValue(WORKER_URL);
}

async function testConnection(page: Page, url: string, token: string) {
  await page.locator("#workerUrl").fill(url);
  await page.locator("#token").fill(token);
  await page.getByRole("button", { name: "Test connection" }).click();
  return page.locator("#checks li");
}

test.describe("Test connection", () => {
  test("accepts the right URL and token", async ({ page, extensionId }) => {
    await openOptions(page, extensionId);
    await expect(await testConnection(page, WORKER_URL, TOKEN)).toHaveText([
      "Worker reachable (version e2e)",
      "Token accepted",
    ]);
  });

  test("tells a wrong token apart from a wrong URL", async ({
    page,
    extensionId,
  }) => {
    await openOptions(page, extensionId);
    await expect(await testConnection(page, WORKER_URL, "wrong")).toHaveText([
      "Worker reachable (version e2e)",
      /Token rejected/,
    ]);
    await expect(await testConnection(page, UNREACHABLE_URL, TOKEN)).toHaveText(
      ["No song-resolver Worker answered at this URL."],
    );
  });

  test("checks without reading an image, so it costs no Claude call", async ({
    page,
    extensionId,
    net,
  }) => {
    await openOptions(page, extensionId);
    await expect(await testConnection(page, WORKER_URL, TOKEN)).toHaveCount(2);
    expect(net.uploads).toEqual([]);
  });
});

test("Save stores the cleaned-up settings", async ({
  page,
  extensionId,
  sw,
}) => {
  await openOptions(page, extensionId);
  await page.locator("#workerUrl").fill("https://mine.example.workers.dev/");
  await page.locator("#token").fill("  new-token  ");
  await page.locator("#preferredPlatform").selectOption("deezer");
  await page.locator("#hoverButton").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  expect(
    await sw.evaluate(() =>
      chrome.storage.local.get([
        "workerUrl",
        "token",
        "preferredPlatform",
        "hoverButton",
      ]),
    ),
  ).toEqual({
    workerUrl: "https://mine.example.workers.dev",
    token: "new-token",
    preferredPlatform: "deezer",
    hoverButton: false,
  });
});
