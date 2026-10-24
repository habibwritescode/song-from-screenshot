import { readFileSync } from "node:fs";
import {
  fein,
  slideTackle,
  xFeed,
} from "../../../client/test/fixtures/responses";
import {
  AVIF,
  controlledByServiceWorker,
  expect,
  finishedResult,
  fixture,
  signIn,
  test,
  TOKEN,
} from "./harness";

test("pick a screenshot: links in the preferred order, then in Recent", async ({
  page,
}) => {
  await signIn(page, { preferredPlatform: "deezer" });
  await page.setInputFiles("input[type=file]", fixture("spotify-x-feed.png"));

  const result = await finishedResult(page);
  expect(result.state).toBe("matched");
  expect(result.title).toBe(xFeed.track.title);
  expect(result.links).toEqual([
    xFeed.links.deezer,
    xFeed.links.spotify,
    xFeed.links.appleMusic,
    xFeed.links.youtubeMusic,
    xFeed.links.youtube,
  ]);
  await expect(page.locator(".history .title")).toHaveText([xFeed.track.title]);
});

test("a slow answer to an earlier pick doesn't replace the latest one", async ({
  page,
}) => {
  await signIn(page);
  let first = true;
  // Hold back the first lookup's answer until after the second has shown.
  await page.route("**/api/resolve", async (route) => {
    if (first) {
      first = false;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.fallback();
  });
  await page.setInputFiles("input[type=file]", fixture("spotify-x-feed.png"));
  await page.setInputFiles(
    "input[type=file]",
    fixture("apple-music-android-fein.png"),
  );
  await expect(page.locator(".result .title")).toHaveText(fein.track.title);
  await page.waitForTimeout(2000);
  await expect(page.locator(".result .title")).toHaveText(fein.track.title);
  // The earlier song still counts: it's in Recent.
  await expect(page.locator(".history .title")).toContainText([
    xFeed.track.title,
  ]);
});

test("paste a screenshot", async ({ page }) => {
  await signIn(page);
  const png = readFileSync(fixture("apple-music-android-slide-tackle.png"));
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "image.png", { type: "image/png" }));
    document.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data }),
    );
  }, png.toString("base64"));

  const result = await finishedResult(page);
  expect(result.title).toBe(slideTackle.track.title);
});

test("Android share: the service worker takes it, the Worker never sees it", async ({
  page,
  net,
}) => {
  await signIn(page);
  await controlledByServiceWorker(page);
  const png = readFileSync(fixture("apple-music-android-fein.png"));

  // What Android's share sheet sends: a multipart POST navigation to /share.
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "Screenshot.png", { type: "image/png" }));
    const form = Object.assign(document.createElement("form"), {
      method: "post",
      action: "/share",
      enctype: "multipart/form-data",
    });
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      name: "image",
    });
    input.files = data.files;
    form.append(input);
    document.body.append(form);
    form.submit();
  }, png.toString("base64"));

  const result = await finishedResult(page);
  expect(result.title).toBe(fein.track.title);
  expect(new URL(page.url()).search).toBe("");
  expect(net.workerRequests).not.toContain("POST /share");
});

test("a share that reaches the Worker explains what to do", async ({
  page,
}) => {
  await signIn(page);
  // No service worker yet: the Worker's fallback answers.
  const response = await page.request.post("/share", {
    multipart: {
      image: { name: "a.png", mimeType: "image/png", buffer: Buffer.from([1]) },
    },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.goto(response.headers()["location"] ?? "/");
  expect((await finishedResult(page)).state).toBe("share_unavailable");
});

test("an AVIF screenshot is uploaded as a real JPEG", async ({ page, net }) => {
  await signIn(page);
  await page.setInputFiles("input[type=file]", AVIF);
  await finishedResult(page);

  expect(net.uploads).toHaveLength(1);
  expect(net.uploads[0]?.type).toBe("image/jpeg");
  expect([...(net.uploads[0]?.bytes.subarray(0, 3) ?? [])]).toEqual([
    0xff, 0xd8, 0xff,
  ]);
});

test("the setup link saves the token and leaves no trace of it", async ({
  page,
}) => {
  await page.goto(`/#token=${encodeURIComponent(TOKEN)}`);
  await expect(page.locator("input[type=file]")).toBeAttached();
  expect(page.url()).not.toContain(TOKEN);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("settings") ?? "{}").token,
    ),
  ).toBe(TOKEN);
});

test("a result from the iPhone Shortcut shows, and leaves the URL", async ({
  page,
}) => {
  await page.goto(`/#result=${encodeURIComponent(JSON.stringify(fein))}`);
  const result = await finishedResult(page);
  expect(result.title).toBe(fein.track.title);
  expect(new URL(page.url()).hash).toBe("");
});

test("a crafted result can't put a script link on the page", async ({
  page,
}) => {
  const crafted = { ...fein, links: { spotify: "javascript:alert(1)" } };
  await page.goto(`/#result=${encodeURIComponent(JSON.stringify(crafted))}`);
  expect((await finishedResult(page)).links).toEqual([]);
});

test("Open my app directly goes straight to the preferred platform", async ({
  page,
}) => {
  await signIn(page, { openDirectly: true });
  await page.setInputFiles("input[type=file]", fixture("spotify-x-feed.png"));
  await page.waitForURL((url) => url.href === xFeed.links.spotify);
});

test("the page is served with its security headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("connect-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
});
