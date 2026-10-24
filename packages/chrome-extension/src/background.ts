import { captureImage, convertImage } from "./canvas";
import { createHistory } from "song-resolver/client/history";
import { findSong, type FindRequest, type FindResult } from "./lib/pipeline";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  type DisplaySettings,
} from "./lib/settings";

type Message =
  FindRequest | { type: "open_options" } | { type: "get_display_settings" };

// Keeps the access token out of content scripts, which run inside web pages.
// They ask for the settings they need with get_display_settings instead.
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

const readSettings = () => loadSettings(chrome.storage.local);
const history = createHistory(chrome.storage.local);

// Instagram covers photos with transparent layers, so Chrome reports a click
// on one as "page", not "image". Chrome only shows "page" items when the click
// isn't on an image or link, so the two items never appear together.
const OVERLAY_SITES = [
  "https://x.com/*",
  "https://twitter.com/*",
  "https://www.instagram.com/*",
];

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.runtime.openOptionsPage();
  }
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "find-image",
    title: "Find song",
    contexts: ["image"],
  });
  chrome.contextMenus.create({
    id: "find-page",
    title: "Find song",
    contexts: ["page"],
    documentUrlPatterns: OVERLAY_SITES,
  });
});

const injecting = new Map<string, Promise<unknown>>();

/** Asks the tab's content script to look, injecting it first on other sites. */
async function findInTab(tabId: number, frameId: number, srcUrl?: string) {
  const message = { type: "context_find", srcUrl };
  try {
    await chrome.tabs.sendMessage(tabId, message, { frameId });
    return;
  } catch {
    // No content script in this frame yet.
  }
  const key = `${tabId}:${frameId}`;
  try {
    // Two quick right-clicks would otherwise inject the script twice.
    const injection =
      injecting.get(key) ??
      chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["content.js"],
      });
    injecting.set(key, injection);
    await injection;
    await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch {
    // Pages extensions can't script, like chrome:// and the Web Store.
  } finally {
    injecting.delete(key);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  void findInTab(tab.id, info.frameId ?? 0, info.srcUrl);
});

const FAILED: FindResult = {
  outcome: { kind: "error", code: "internal_error" },
  artwork: null,
};

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    switch (message.type) {
      case "open_options":
        void chrome.runtime.openOptionsPage();
        return false;
      case "get_display_settings":
        void readSettings()
          .catch(() => DEFAULT_SETTINGS)
          .then(({ preferredPlatform, hoverButton }): void =>
            sendResponse({
              preferredPlatform,
              hoverButton,
            } satisfies DisplaySettings),
          );
        return true;
      case "find": {
        const windowId = sender.tab?.windowId;
        // Always reply, or the card would wait until Chrome closes the channel.
        void findSong(message, {
          fetch,
          loadSettings: readSettings,
          captureImage:
            windowId === undefined
              ? undefined
              : (capture) => captureImage(windowId, capture),
          convertImage,
        })
          .then((result) => {
            if (result.outcome.kind === "result") {
              // History is a convenience; a failed write mustn't cost the card.
              history.add(result.outcome.response).catch(() => undefined);
            }
            return result;
          })
          .catch(() => FAILED)
          .then(sendResponse);
        // Keeps the message channel open until the async reply is sent.
        return true;
      }
    }
  },
);
