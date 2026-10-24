import {
  clickInShadow,
  expect,
  finishedCard,
  hoverAndFind,
  test,
  UNREACHABLE_URL,
  X_PAGE,
} from "./harness";
import { xFeed } from "song-resolver/client/test/fixtures/responses.ts";

test("when extension storage fails, the card offers Try again, which works once it's back", async ({
  page,
  sw,
}) => {
  await page.goto(X_PAGE);
  await sw.evaluate(() => {
    const storage = chrome.storage.local as unknown as Record<string, unknown>;
    (globalThis as Record<string, unknown>).restoreStorage = (
      (get) => () =>
        (storage.get = get)
    )(storage.get);
    storage.get = () => Promise.reject(new Error("storage unavailable"));
  });

  await hoverAndFind(page, "#feed");
  const failed = await finishedCard(page);
  expect(failed.state).toBe("error");
  expect(failed.text).toContain("Try again");
  expect(failed.actions).toContain("retry");

  await sw.evaluate(() =>
    ((globalThis as Record<string, unknown>).restoreStorage as () => void)(),
  );
  await clickInShadow(page, '[data-action="retry"]');
  await expect
    .poll(async () => (await finishedCard(page)).state)
    .toBe("matched");
});

test("a wrong token says so and points to the settings", async ({
  page,
  sw,
}) => {
  await sw.evaluate(() => chrome.storage.local.set({ token: "wrong" }));
  await page.goto(X_PAGE);
  await hoverAndFind(page, "#feed");

  const card = await finishedCard(page);
  expect(card.text).toContain("Your token was rejected.");
  expect(card.actions).toContain("options");
});

test("an unreachable Worker says so instead of spinning", async ({
  page,
  sw,
}) => {
  await sw.evaluate(
    (workerUrl) => chrome.storage.local.set({ workerUrl }),
    UNREACHABLE_URL,
  );
  await page.goto(X_PAGE);
  await hoverAndFind(page, "#feed");

  expect((await finishedCard(page)).text).toContain("Can't reach your Worker.");
});

test("before setup, the card and the popup both point to the settings", async ({
  page,
  sw,
  context,
  extensionId,
}) => {
  await sw.evaluate(() => chrome.storage.local.remove(["workerUrl", "token"]));
  await page.goto(X_PAGE);
  await hoverAndFind(page, "#feed");

  const card = await finishedCard(page);
  expect(card.text).toContain("Set your Worker URL and token to start.");
  expect(card.links).not.toContain(xFeed.links.spotify);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole("button", { name: "Set up" })).toBeVisible();
});
