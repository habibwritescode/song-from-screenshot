/// <reference types="node" />
import { test as base, expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ResolveResponse } from "../../../src/types";
import {
  fein,
  noPlayer,
  slideTackle,
  xFeed,
} from "../../../client/test/fixtures/responses";

export const TOKEN = "e2e-token";

export const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
export const AVIF = fileURLToPath(
  new URL(
    "../../../../chrome-extension/test/fixtures/images/fein.avif",
    import.meta.url,
  ),
);

/** The fake Worker recognises the fixture screenshots by their bytes. */
const RECORDED: [Buffer, ResolveResponse][] = [
  [readFileSync(fixture("spotify-x-feed.png")), xFeed],
  [readFileSync(fixture("apple-music-android-fein.png")), fein],
  [readFileSync(fixture("apple-music-android-slide-tackle.png")), slideTackle],
];

// Hosts outside the Worker's origin that the app may load: album covers, and
// the platform a test opens directly.
const ARTWORK_HOSTS = new Set(["is1-ssl.mzstatic.com", "i.scdn.co"]);
const PLATFORM_HOSTS = new Set(["open.spotify.com"]);
// 1×1 PNG: the page only needs an image it can show.
const ARTWORK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** The image part of an upload to the fake Worker. */
export interface Upload {
  type: string;
  bytes: Buffer;
}

function imagePart(body: Buffer, contentType: string): Upload | null {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  // latin1 maps each byte to one character, so string offsets are byte offsets.
  const header = /content-type: (image\/[\w+-]+)\r\n\r\n/i.exec(
    body.toString("latin1"),
  );
  if (!boundary || !header?.[1]) return null;
  const start = header.index + header[0].length;
  const end = body.indexOf(`\r\n--${boundary}`, start);
  if (end < 0) return null;
  return { type: header[1], bytes: body.subarray(start, end) };
}

export interface Network {
  /** Every host asked for: the page, its service worker, images. */
  hosts: Set<string>;
  /** Paths on the Worker's origin that reached the network, with their method. */
  workerRequests: string[];
  uploads: Upload[];
}

function fakeResolve(route: Route, net: Network) {
  const request = route.request();
  if (request.headers()["authorization"] !== `Bearer ${TOKEN}`) {
    return route.fulfill({
      status: 401,
      json: { error: { code: "unauthorized", message: "…" } },
    });
  }
  const upload = imagePart(
    request.postDataBuffer() ?? Buffer.alloc(0),
    request.headers()["content-type"] ?? "",
  );
  if (!upload) {
    return route.fulfill({
      status: 400,
      json: { error: { code: "missing_image", message: "…" } },
    });
  }
  net.uploads.push(upload);
  const match = RECORDED.find(([bytes]) => bytes.equals(upload.bytes));
  return route.fulfill({ json: match?.[1] ?? noPlayer });
}

export const test = base.extend<{ net: Network }>({
  // Automatic: every test is intercepted and host-checked, even one that
  // never reads `net`. Otherwise its lookups would reach the real Worker.
  net: [
    async ({ context, baseURL }, use) => {
      const net: Network = {
        hosts: new Set(),
        workerRequests: [],
        uploads: [],
      };
      const origin = new URL(baseURL ?? "").origin;
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (!url.protocol.startsWith("http")) return route.continue();
        net.hosts.add(url.host);
        if (url.origin === origin) {
          net.workerRequests.push(
            `${route.request().method()} ${url.pathname}`,
          );
          if (url.pathname === "/api/resolve") return fakeResolve(route, net);
          return route.continue();
        }
        if (ARTWORK_HOSTS.has(url.hostname)) {
          return route.fulfill({ body: ARTWORK, contentType: "image/png" });
        }
        if (PLATFORM_HOSTS.has(url.hostname)) {
          return route.fulfill({
            body: "platform page",
            contentType: "text/html",
          });
        }
        return route.abort("addressunreachable");
      });
      await use(net);
      // Spec criterion 8: nothing but this origin, album covers and a
      // platform link the test opened.
      expect(
        [...net.hosts].filter(
          (host) =>
            host !== new URL(origin).host &&
            !ARTWORK_HOSTS.has(host) &&
            !PLATFORM_HOSTS.has(host),
        ),
        "requests to other hosts",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Saves settings on this origin, as the setup screen would. */
export async function signIn(
  page: Page,
  settings: { preferredPlatform?: string; openDirectly?: boolean } = {},
) {
  await page.goto("/");
  await page.evaluate(
    (saved) => localStorage.setItem("settings", JSON.stringify(saved)),
    {
      token: TOKEN,
      preferredPlatform: "spotify",
      openDirectly: false,
      ...settings,
    },
  );
  await page.reload();
}

/** Waits for the service worker to control the page, as an installed app's would. */
export async function controlledByServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

/** The finished result view: state, title and link targets. */
export async function finishedResult(page: Page) {
  const result = page.locator(".result:not([aria-busy])");
  await result.waitFor();
  return {
    state: await result.getAttribute("data-state"),
    // allTextContents doesn't wait: not every result has a title.
    title: (await result.locator(".title").allTextContents())[0] ?? null,
    links: await result
      .locator("a.link")
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href)),
  };
}
