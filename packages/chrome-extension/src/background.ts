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

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.runtime.openOptionsPage();
  }
});

const FAILED: FindResult = {
  outcome: { kind: "error", code: "internal_error" },
  artwork: null,
};

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
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
      case "find":
        // Always reply, or the card would wait until Chrome closes the channel.
        void findSong(message, { fetch, loadSettings: readSettings })
          .catch(() => FAILED)
          .then(sendResponse);
        // Keeps the message channel open until the async reply is sent.
        return true;
    }
  },
);
