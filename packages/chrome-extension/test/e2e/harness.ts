/// <reference types="node" />
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
  type Worker,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ResolveResponse } from "song-resolver/src/types";
import type { Settings } from "../../src/lib/settings";
import {
  fein,
  igStoryPartial,
  noPlayer,
  slideTackle,
  xFeed,
} from "../fixtures/responses";

// Every request goes through Playwright routes, including the service
// worker's, so the fixture pages are served at the real X and Instagram
// addresses and the production build runs unchanged.
export const WORKER_URL = "https://song-resolver.e2e.test";
export const TOKEN = "e2e-token";
export const X_PAGE = "https://x.com/e2e";
export const INSTAGRAM_PAGE = "https://www.instagram.com/e2e";
/** A Worker URL nothing answers at. */
export const UNREACHABLE_URL = "https://nowhere.e2e.test";

const file = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)));
const resolverFixture = (name: string) =>
  file(`../../../song-resolver/fixtures/${name}`);

const X_FEED = resolverFixture("spotify-x-feed.png");
const IG_STORY = resolverFixture("spotify-ig-story.png");
const FEIN = resolverFixture("apple-music-android-fein.png");
const SLIDE_TACKLE = resolverFixture("apple-music-android-slide-tackle.png");

const PAGES: Record<string, Buffer> = {
  [X_PAGE]: file("../fixtures/pages/x.html"),
  [INSTAGRAM_PAGE]: file("../fixtures/pages/instagram.html"),
};

const IMAGES: Record<string, Buffer> = {
  "https://pbs.twimg.com/media/GZxFeed": X_FEED,
  "https://scontent.cdninstagram.com/v/story_640.jpg": IG_STORY,
  "https://scontent.cdninstagram.com/v/story_1080.jpg": IG_STORY,
  "https://scontent.cdninstagram.com/v/fein.jpg": FEIN,
  "https://scontent.cdninstagram.com/v/slide-tackle.jpg": SLIDE_TACKLE,
  "https://scontent.cdninstagram.com/v/fein.avif": file(
    "../fixtures/images/fein.avif",
  ),
};

/** The fake Worker recognises the fixture screenshots by their bytes. */
const RECORDED: [Buffer, ResolveResponse][] = [
  [X_FEED, xFeed],
  [IG_STORY, igStoryPartial],
  [FEIN, fein],
  [SLIDE_TACKLE, slideTackle],
];

const ARTWORK_HOSTS = new Set(["is1-ssl.mzstatic.com", "i.scdn.co"]);

const hostsOf = (urls: string[]) => urls.map((url) => new URL(url).hostname);

/** Spec criterion 8: the image hosts, the Worker and the artwork hosts. */
const EXTENSION_HOSTS = new Set([
  ...hostsOf(Object.keys(IMAGES)),
  ...ARTWORK_HOSTS,
  ...hostsOf([WORKER_URL, UNREACHABLE_URL]),
]);
/** The fixture pages may also load from their own sites. */
const PAGE_HOSTS = new Set([
  ...EXTENSION_HOSTS,
  ...hostsOf(Object.keys(PAGES)),
]);

// 1×1 PNG: the card only needs bytes it can show.
const ARTWORK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

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
  /** Hosts the extension asked for: its service worker, popup and options page. */
  extensionHosts: Set<string>;
  /** Hosts the fixture pages asked for. */
  pageHosts: Set<string>;
  urls: string[];
  uploads: Upload[];
}

function workerError(route: Route, status: number, code: string) {
  return route.fulfill({
    status,
    headers: CORS,
    json: { error: { code, message: code } },
  });
}

function fakeWorker(route: Route, net: Network) {
  const request = route.request();
  const { pathname } = new URL(request.url());
  if (request.method() === "OPTIONS") {
    return route.fulfill({ status: 204, headers: CORS });
  }
  if (pathname === "/api/health") {
    return route.fulfill({ headers: CORS, json: { ok: true, version: "e2e" } });
  }
  if (pathname !== "/api/resolve") return workerError(route, 404, "not_found");
  if (request.headers()["authorization"] !== `Bearer ${TOKEN}`) {
    return workerError(route, 401, "unauthorized");
  }
  const upload = imagePart(
    request.postDataBuffer() ?? Buffer.alloc(0),
    request.headers()["content-type"] ?? "",
  );
  if (!upload) return workerError(route, 400, "missing_image");
  net.uploads.push(upload);
  const match = RECORDED.find(([bytes]) => bytes.equals(upload.bytes));
  return route.fulfill({ headers: CORS, json: match?.[1] ?? noPlayer });
}

function fromExtension(request: Request): boolean {
  if (request.serviceWorker()) return true;
  try {
    return request.frame().url().startsWith("chrome-extension://");
  } catch {
    return false; // A navigation before its frame exists: a page load.
  }
}

async function handle(route: Route, net: Network) {
  const request = route.request();
  const url = new URL(request.url());
  if (!url.protocol.startsWith("http")) return route.continue();
  (fromExtension(request) ? net.extensionHosts : net.pageHosts).add(
    url.hostname,
  );
  net.urls.push(url.href);
  const key = url.origin + url.pathname;

  if (url.origin === WORKER_URL) return fakeWorker(route, net);
  const page = PAGES[key];
  if (page) return route.fulfill({ contentType: "text/html", body: page });
  const image = IMAGES[key];
  if (image) return route.fulfill({ body: image });
  if (ARTWORK_HOSTS.has(url.hostname)) {
    return route.fulfill({ headers: CORS, body: ARTWORK });
  }
  if (PAGES[url.origin + "/e2e"]) return route.fulfill({ status: 404 });
  return route.abort("addressunreachable");
}

export const DEFAULT_E2E_SETTINGS: Settings = {
  workerUrl: WORKER_URL,
  token: TOKEN,
  preferredPlatform: "spotify",
  hoverButton: true,
};

interface Fixtures {
  net: Network;
  context: BrowserContext;
  /** The extension's service worker, with settings saved. */
  sw: Worker;
  extensionId: string;
  page: Page;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  net: async ({}, use) => {
    await use({
      extensionHosts: new Set(),
      pageHosts: new Set(),
      urls: [],
      uploads: [],
    });
  },
  context: async ({ net }, use) => {
    const extension = fileURLToPath(new URL("../../dist", import.meta.url));
    const context = await chromium.launchPersistentContext("", {
      // The default headless shell can't load extensions; full Chromium in
      // new headless mode can.
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    await context.route("**/*", (route) => handle(route, net));
    await use(context);
    await context.close();
    expect(
      [...net.extensionHosts].filter((host) => !EXTENSION_HOSTS.has(host)),
      "extension contacted hosts outside spec criterion 8",
    ).toEqual([]);
    expect(
      [...net.pageHosts].filter((host) => !PAGE_HOSTS.has(host)),
      "fixture pages contacted unexpected hosts",
    ).toEqual([]);
  },
  sw: async ({ context }, use) => {
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await sw.evaluate(
      (settings) => chrome.storage.local.set(settings),
      DEFAULT_E2E_SETTINGS,
    );
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  page: async ({ context, sw }, use) => {
    void sw; // Settings must be saved before the page's content script asks.
    await use(await context.newPage());
  },
});

export { expect };

/**
 * Runs `fn` with `this` bound to the extension's shadow root. The root is
 * closed, so page scripts and Playwright selectors can't reach it; the
 * DevTools protocol can.
 */
async function inShadowRoot<T>(page: Page, fn: string): Promise<T | null> {
  const cdp = await page.context().newCDPSession(page);
  try {
    type DomNode = {
      nodeName: string;
      children?: DomNode[];
      shadowRoots?: { backendNodeId: number }[];
    };
    const { root } = (await cdp.send("DOM.getDocument", {
      depth: -1,
      pierce: true,
    })) as { root: DomNode };
    const find = (node: DomNode): DomNode | undefined =>
      node.nodeName === "SONG-FROM-SCREENSHOT"
        ? node
        : node.children?.map(find).find(Boolean);
    const shadow = find(root)?.shadowRoots?.[0];
    if (!shadow) return null;
    const { object } = await cdp.send("DOM.resolveNode", {
      backendNodeId: shadow.backendNodeId,
    });
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: fn,
      returnByValue: true,
    });
    return (result.value as T | undefined) ?? null;
  } finally {
    await cdp.detach();
  }
}

export interface CardView {
  state: string;
  text: string;
  links: string[];
  artwork: string | null;
  actions: string[];
}

export function readCard(page: Page): Promise<CardView | null> {
  return inShadowRoot<CardView>(
    page,
    `function () {
      const card = this.querySelector(".card");
      if (!card) return null;
      return {
        state: card.dataset.state,
        text: card.textContent,
        links: [...card.querySelectorAll("a")].map((a) => a.href),
        artwork: card.querySelector("img")?.getAttribute("src") ?? null,
        actions: [...card.querySelectorAll("[data-action]")].map((b) => b.dataset.action),
      };
    }`,
  );
}

/** Waits for the card to finish loading and returns it. */
export async function finishedCard(page: Page): Promise<CardView> {
  let card: CardView | null = null;
  await expect
    .poll(async () => {
      card = await readCard(page);
      return card?.state ?? "no card";
    })
    .not.toMatch(/^(loading|no card)$/);
  return card as unknown as CardView;
}

type Point = { x: number; y: number };

const centreOf = (selector: string) => `function () {
  const element = this.querySelector(${JSON.stringify(selector)});
  if (!element || element.hidden) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}`;

/** Clicks an element inside the shadow root with a real mouse click. */
export async function clickInShadow(page: Page, selector: string) {
  let point: Point | null = null;
  await expect
    .poll(
      async () => (point = await inShadowRoot<Point>(page, centreOf(selector))),
    )
    .not.toBeNull();
  const { x, y } = point as unknown as Point;
  await page.mouse.click(x, y);
}

/** Hovers the image and clicks the extension's "Find song" button on it. */
export async function hoverAndFind(page: Page, image: string) {
  const target = page.locator(image);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`${image} isn't visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await clickInShadow(page, ".find");
}

/**
 * Right-clicks a point, then fires the extension's own menu handler. Playwright
 * can't click Chrome's native menu, so the service worker dispatches the click
 * event Chrome would have sent.
 */
export async function rightClickFind(
  page: Page,
  sw: Worker,
  point: Point,
  menu: { menuItemId: "find-image" | "find-page"; srcUrl?: string },
) {
  await page.bringToFront();
  await page.mouse.click(point.x, point.y, { button: "right" });
  await sw.evaluate(
    async ({ pageUrl, info }) => {
      // Matching by URL would need the "tabs" permission, which the extension
      // doesn't have; the page under test is the active tab.
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      // Chrome's events have an untyped dispatch() that runs the listeners.
      const onClicked = chrome.contextMenus.onClicked as unknown as {
        dispatch(
          data: chrome.contextMenus.OnClickData,
          tab?: chrome.tabs.Tab,
        ): void;
      };
      onClicked.dispatch(
        { ...info, editable: false, pageUrl, frameId: 0 },
        tab,
      );
    },
    { pageUrl: page.url(), info: menu },
  );
}
