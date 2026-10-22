import { pickImage } from "./lib/find-image";
import { blobToDataUrl, sniffImageType } from "./lib/image-bytes";
import type { FindRequest, FindResult } from "./lib/pipeline";
import { DEFAULT_SETTINGS, type DisplaySettings } from "./lib/settings";
import { createHoverButton } from "./ui/button";
import { renderCard, type CardState } from "./ui/card";
import css from "./ui/styles.css";

const CARD_GAP = 8;
const CARD_WIDTH = 320;
// The hover button is for X and Instagram; elsewhere the script only runs
// after a right-click, and stays out of the way.
const HOVER_HOSTS = new Set(["x.com", "twitter.com", "www.instagram.com"]);
const hoverSite = HOVER_HOSTS.has(location.hostname);

/** What a lookup is about and where its card goes. */
interface Target {
  /** Identifies the lookup: the image element, or the URL when there's no element. */
  key: object | string;
  rect: () => DOMRect;
  src: string;
  srcset: string;
  /** Right-clicks allow a screen capture if the download fails. */
  capture: boolean;
}

const imageTarget = (image: HTMLImageElement, capture: boolean): Target => ({
  key: image,
  rect: () => image.getBoundingClientRect(),
  src: image.currentSrc || image.src,
  srcset: image.srcset,
  capture,
});

let settings: DisplaySettings = DEFAULT_SETTINGS;
// Content scripts can't read extension storage (the background restricts it
// to keep the token out of web pages), so settings are refreshed on load,
// when the tab comes back into view, and with each lookup.
async function refreshSettings() {
  let reply: Partial<DisplaySettings> | undefined;
  try {
    reply = (await chrome.runtime.sendMessage({
      type: "get_display_settings",
    })) as Partial<DisplaySettings> | undefined;
  } catch {
    return; // Extension reloaded; keep the last known settings.
  }
  if (typeof reply?.hoverButton !== "boolean" || !reply.preferredPlatform) {
    return;
  }
  settings = {
    preferredPlatform: reply.preferredPlatform,
    hoverButton: reply.hoverButton,
  };
  if (!settings.hoverButton) button.hide();
}

// A custom element name, so page styles aimed at div or button can't reach it.
const host = document.createElement("song-from-screenshot");
host.style.cssText = "position:absolute;top:0;left:0;z-index:2147483647;";
const root = host.attachShadow({ mode: "closed" });
const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
root.adoptedStyleSheets = [sheet];
document.documentElement.append(host);

const button = createHoverButton(
  (image) => void find(imageTarget(image, false)),
);
root.append(button.element);

let card: { key: Target["key"]; element: HTMLElement } | null = null;
const inFlight = new Set<Target["key"]>();
let contextPoint: { x: number; y: number } | null = null;

function closeCard() {
  card?.element.remove();
  card = null;
}

function place(element: HTMLElement, rect: DOMRect) {
  const height = element.offsetHeight;
  let left = rect.right + CARD_GAP;
  let top = Math.max(rect.top, CARD_GAP);
  if (left + CARD_WIDTH > innerWidth - CARD_GAP) {
    left = rect.left - CARD_GAP - CARD_WIDTH;
  }
  if (left < CARD_GAP) {
    left = Math.min(
      Math.max(rect.left, CARD_GAP),
      innerWidth - CARD_WIDTH - CARD_GAP,
    );
    top = rect.bottom + CARD_GAP;
  }
  top = Math.min(top, Math.max(innerHeight - height - CARD_GAP, CARD_GAP));
  // Document coordinates, so the card scrolls with the image.
  element.style.left = `${left + scrollX}px`;
  element.style.top = `${top + scrollY}px`;
}

function showCard(target: Target, state: CardState) {
  closeCard();
  const element = renderCard(state, settings.preferredPlatform, {
    onClose: closeCard,
    onRetry: () => void find(target),
    onOpenOptions: () =>
      void chrome.runtime.sendMessage({ type: "open_options" }),
  });
  root.append(element);
  place(element, target.rect());
  card = { key: target.key, element };
}

// The background refuses bigger downloads too.
const MAX_BLOB_BYTES = 25 * 1024 * 1024;

/** blob: URLs only exist in this page, so the background can't fetch them. */
async function readPageBlob(src: string): Promise<string> {
  try {
    const blob = await (await fetch(src)).blob();
    if (blob.size > MAX_BLOB_BYTES) return src;
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const type = sniffImageType(head);
    return (
      (type && (await blobToDataUrl(blob.slice(0, blob.size, type)))) || src
    );
  } catch {
    return src;
  }
}

function captureRequest(target: Target): FindRequest["capture"] {
  // A capture is of the top frame, so a box inside an iframe would be wrong.
  if (!target.capture || window !== window.top) return undefined;
  const { x, y, width, height } = target.rect();
  return {
    rect: { x, y, width, height },
    viewport: { width: innerWidth, height: innerHeight },
  };
}

async function find(target: Target) {
  if (inFlight.has(target.key)) return;
  inFlight.add(target.key);
  button.hide();
  showCard(target, { kind: "loading" });
  // Not awaited: the card already has the settings from page load.
  void refreshSettings();

  let state: CardState;
  try {
    const request: FindRequest = {
      type: "find",
      src: target.src.startsWith("blob:")
        ? await readPageBlob(target.src)
        : target.src,
      srcset: target.srcset,
      capture: captureRequest(target),
    };
    const result = (await chrome.runtime.sendMessage(request)) as
      FindResult | undefined;
    state = result
      ? { kind: "done", ...result }
      : {
          kind: "done",
          outcome: { kind: "error", code: "internal_error" },
          artwork: null,
        };
  } catch {
    // The extension was reloaded or updated; this old content script is cut off.
    state = { kind: "reload" };
  } finally {
    inFlight.delete(target.key);
  }
  // Only if the user hasn't closed the loading card or moved on to another image.
  if (card?.key === target.key) showCard(target, state);
}

const hasSrc = (
  element: Element,
  srcUrl: string,
): element is HTMLImageElement =>
  element instanceof HTMLImageElement &&
  (element.currentSrc === srcUrl || element.src === srcUrl);

/**
 * Right-click "Find song". Chrome reports the image URL when the click was on
 * an image; on Instagram's overlays it reports none, so the script looks under
 * the point it saw the menu open at. On other sites the first right-click
 * injects the script after the menu opened, so it has no point yet. A
 * right-clicked image skips the size threshold: the user picked it.
 */
function findFromContextMenu(srcUrl: string | undefined) {
  const stack = contextPoint
    ? document.elementsFromPoint(contextPoint.x, contextPoint.y)
    : [];
  // Chrome's srcUrl names the image clicked; the point tells copies of it apart.
  const image = srcUrl
    ? (stack.find((element) => hasSrc(element, srcUrl)) ??
      [...document.images].find((element) => hasSrc(element, srcUrl)) ??
      null)
    : pickImage(stack);
  if (image) return void find(imageTarget(image, true));

  const anchor = contextPoint
    ? new DOMRect(contextPoint.x, contextPoint.y, 0, 0)
    : new DOMRect(innerWidth - CARD_GAP, CARD_GAP, 0, 0);
  const target: Target = {
    key: srcUrl ?? "no-image",
    rect: () => anchor,
    src: srcUrl ?? "",
    srcset: "",
    capture: false,
  };
  if (srcUrl) void find(target);
  else showCard(target, { kind: "no_image" });
}

let frame = 0;
document.addEventListener(
  "pointermove",
  (event) => {
    if (!hoverSite || !settings.hoverButton || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const stack = document.elementsFromPoint(event.clientX, event.clientY);
      if (stack[0] === host) return;
      const image = pickImage(stack);
      if (image) button.showFor(image);
      else button.hide();
    });
  },
  { passive: true },
);

addEventListener("scroll", () => button.hide(), {
  capture: true,
  passive: true,
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && card) closeCard();
  },
  true,
);

document.addEventListener(
  "pointerdown",
  (event) => {
    if (card && !event.composedPath().includes(host)) closeCard();
  },
  true,
);

document.addEventListener(
  "contextmenu",
  (event) => (contextPoint = { x: event.clientX, y: event.clientY }),
  { capture: true, passive: true },
);

chrome.runtime.onMessage.addListener(
  (message: { type: string; srcUrl?: string }) => {
    if (message.type === "context_find") findFromContextMenu(message.srcUrl);
  },
);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshSettings();
});
void refreshSettings();
