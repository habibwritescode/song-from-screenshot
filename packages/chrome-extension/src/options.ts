import { testConnection, type ConnectionResult } from "./lib/api";
import {
  loadSettings,
  normalizeWorkerUrl,
  PLATFORM_LABELS,
  PLATFORMS,
  saveSettings,
  type Platform,
  type Settings,
} from "./lib/settings";

const storage = chrome.storage.local;

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`options.html is missing #${id}`);
  return element as T;
}

const form = $<HTMLFormElement>("form");
const workerUrl = $<HTMLInputElement>("workerUrl");
const token = $<HTMLInputElement>("token");
const reveal = $<HTMLButtonElement>("reveal");
const preferredPlatform = $<HTMLSelectElement>("preferredPlatform");
const hoverButton = $<HTMLInputElement>("hoverButton");
const testButton = $<HTMLButtonElement>("test");
const saved = $<HTMLSpanElement>("saved");
const checks = $<HTMLUListElement>("checks");

for (const platform of PLATFORMS) {
  preferredPlatform.add(new Option(PLATFORM_LABELS[platform], platform));
}

function showError(input: HTMLInputElement, errorId: string, message = "") {
  input.setAttribute("aria-invalid", String(message !== ""));
  $(errorId).textContent = message;
}

/** The form's values, or null (with errors shown) if they can't be used. */
function readForm(): Settings | null {
  const url = normalizeWorkerUrl(workerUrl.value);
  showError(
    workerUrl,
    "urlError",
    url ? "" : "Enter your Worker's https:// address.",
  );
  const secret = token.value.trim();
  showError(token, "tokenError", secret ? "" : "Enter your access token.");
  if (!url || !secret) return null;
  workerUrl.value = url;
  return {
    workerUrl: url,
    token: secret,
    preferredPlatform: preferredPlatform.value as Platform,
    hoverButton: hoverButton.checked,
  };
}

type Check = [ok: boolean, text: string];

function connectionChecks(result: ConnectionResult): Check[] {
  switch (result.kind) {
    case "unreachable":
      // Also what a non-Worker site looks like: without CORS headers the
      // browser hides its reply, so it can't be told apart from no reply.
      return [[false, "No song-resolver Worker answered at this URL."]];
    case "not_song_resolver":
      return [
        [false, "That address answers, but it isn't a song-resolver Worker."],
      ];
    case "bad_token":
      return [
        [true, `Worker reachable (version ${result.version})`],
        [false, "Token rejected. Check it matches the Worker's ACCESS_TOKEN."],
      ];
    case "ok":
      return [
        [true, `Worker reachable (version ${result.version})`],
        [true, "Token accepted"],
      ];
  }
}

function showChecks(result: ConnectionResult) {
  const lines = connectionChecks(result);
  checks.replaceChildren(
    ...lines.map(([ok, text]) => {
      const item = document.createElement("li");
      item.className = ok ? "ok" : "bad";
      item.textContent = text;
      return item;
    }),
  );
}

reveal.addEventListener("click", () => {
  const hidden = token.type === "password";
  token.type = hidden ? "text" : "password";
  reveal.textContent = hidden ? "Hide" : "Show";
  reveal.setAttribute("aria-pressed", String(hidden));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = readForm();
  if (!settings) return;
  await saveSettings(storage, settings);
  saved.textContent = "Saved";
  setTimeout(() => (saved.textContent = ""), 2000);
});

testButton.addEventListener("click", async () => {
  const settings = readForm();
  if (!settings) return;
  testButton.disabled = true;
  checks.replaceChildren();
  try {
    showChecks(await testConnection(settings, fetch));
  } finally {
    testButton.disabled = false;
  }
});

void loadSettings(storage).then((settings) => {
  workerUrl.value = settings.workerUrl;
  token.value = settings.token;
  preferredPlatform.value = settings.preferredPlatform;
  hoverButton.checked = settings.hoverButton;
});
