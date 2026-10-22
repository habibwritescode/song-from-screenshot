import { pickImage } from "./lib/find-image";
import type { FindRequest, FindResult } from "./lib/pipeline";
import { DEFAULT_SETTINGS, type DisplaySettings } from "./lib/settings";
import { createHoverButton } from "./ui/button";
import { renderCard, type CardState } from "./ui/card";
import css from "./ui/styles.css";

const CARD_GAP = 8;
const CARD_WIDTH = 320;

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

const button = createHoverButton((image) => void find(image));
root.append(button.element);

let card: { image: HTMLImageElement; element: HTMLElement } | null = null;
const inFlight = new WeakSet<HTMLImageElement>();

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

function showCard(image: HTMLImageElement, state: CardState) {
  closeCard();
  const element = renderCard(state, settings.preferredPlatform, {
    onClose: closeCard,
    onRetry: () => void find(image),
    onOpenOptions: () =>
      void chrome.runtime.sendMessage({ type: "open_options" }),
  });
  root.append(element);
  place(element, image.getBoundingClientRect());
  card = { image, element };
}

async function find(image: HTMLImageElement) {
  if (inFlight.has(image)) return;
  inFlight.add(image);
  showCard(image, { kind: "loading" });
  // Not awaited: the card already has the settings from page load.
  void refreshSettings();

  let state: CardState;
  try {
    const request: FindRequest = {
      type: "find",
      src: image.currentSrc || image.src,
      srcset: image.srcset,
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
    inFlight.delete(image);
  }
  // Only if the user hasn't closed the loading card or moved on to another image.
  if (card?.image === image) showCard(image, state);
}

let frame = 0;
document.addEventListener(
  "pointermove",
  (event) => {
    if (!settings.hoverButton || frame) return;
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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshSettings();
});
void refreshSettings();
