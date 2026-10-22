import {
  expect,
  finishedCard,
  hoverAndFind,
  INSTAGRAM_PAGE,
  rightClickFind,
  test,
  X_PAGE,
} from "./harness";
import {
  fein,
  igStoryPartial,
  slideTackle,
  xFeed,
} from "../fixtures/responses";

test("X: hover, Find song, and the card links every platform, preferred first", async ({
  page,
  net,
}) => {
  await page.goto(X_PAGE);
  await hoverAndFind(page, "#feed");

  const card = await finishedCard(page);
  expect(card.state).toBe("matched");
  expect(card.text).toContain(xFeed.track.title);
  expect(card.text).toContain(xFeed.track.artist);
  expect(card.links).toEqual([
    xFeed.links.spotify,
    xFeed.links.appleMusic,
    xFeed.links.youtubeMusic,
    xFeed.links.youtube,
    xFeed.links.deezer,
  ]);
  // X's CSP blocks the artwork host, so the card gets the artwork inline.
  expect(card.artwork).toMatch(/^data:image\/png;base64,/);
  // The original-size image, not the feed thumbnail.
  expect(net.urls).toContain(
    "https://pbs.twimg.com/media/GZxFeed?format=jpg&name=orig",
  );
});

test("Instagram: hovering through the overlay finds the story and its widest image", async ({
  page,
  net,
}) => {
  await page.goto(INSTAGRAM_PAGE);
  await hoverAndFind(page, "#story");

  const card = await finishedCard(page);
  expect(card.state).toBe("matched");
  expect(card.text).toContain(igStoryPartial.track.title);
  expect(card.links[0]).toBe(igStoryPartial.links.spotify);
  expect(card.text).toContain("Some platforms didn't answer.");
  expect(net.urls).toContain(
    "https://scontent.cdninstagram.com/v/story_1080.jpg",
  );
});

test("right-click on an X image finds the song", async ({ page, sw }) => {
  await page.goto(X_PAGE);
  const box = await page.locator("#feed").boundingBox();
  if (!box) throw new Error("no image");
  await rightClickFind(
    page,
    sw,
    { x: box.x + 100, y: box.y + 100 },
    {
      menuItemId: "find-image",
      srcUrl: "https://pbs.twimg.com/media/GZxFeed?format=jpg&name=small",
    },
  );
  expect((await finishedCard(page)).links[0]).toBe(xFeed.links.spotify);
});

for (const [id, response] of [
  ["fein", fein],
  ["slide-tackle", slideTackle],
] as const) {
  test(`right-click through Instagram's overlay reads the Apple Music screenshot (${id})`, async ({
    page,
    sw,
  }) => {
    await page.goto(INSTAGRAM_PAGE);
    const image = page.locator(`#${id}`);
    await image.scrollIntoViewIfNeeded();
    const box = await image.boundingBox();
    if (!box) throw new Error("no image");
    // The overlay hides the image from Chrome, so the menu reports a page click.
    await rightClickFind(
      page,
      sw,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { menuItemId: "find-page" },
    );

    const card = await finishedCard(page);
    expect(card.state).toBe("matched");
    expect(card.text).toContain(response.track.title);
    expect(card.links[0]).toBe(response.links.spotify);
  });
}

test("an AVIF image is converted to JPEG before it's uploaded", async ({
  page,
  net,
}) => {
  await page.goto(INSTAGRAM_PAGE);
  await hoverAndFind(page, "#avif");
  await finishedCard(page);

  expect(net.uploads).toHaveLength(1);
  const [upload] = net.uploads;
  expect(upload?.type).toBe("image/jpeg");
  // The bytes themselves, not just the label: JPEG starts FF D8 FF.
  expect([...(upload?.bytes.subarray(0, 3) ?? [])]).toEqual([0xff, 0xd8, 0xff]);
});

test("the popup lists the song afterwards", async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto(X_PAGE);
  await hoverAndFind(page, "#feed");
  await finishedCard(page);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator(".entry .title")).toHaveText([xFeed.track.title]);
  await expect(popup.locator(".entry a.primary")).toHaveAttribute(
    "href",
    xFeed.links.spotify,
  );
});
