import { resolve, testConnection } from "../../client/api";
import { createHistory, type HistoryEntry } from "../../client/history";
import type { ResolveResponse } from "../../src/types";
import { convertToJpeg } from "./canvas";
import { directLink } from "./lib/direct";
import { readFragment } from "./lib/fragment";
import { readShareParams, takeShared } from "./lib/share-store";
import { historyStorage } from "./lib/history-storage";
import {
  loadSettings,
  saveSettings,
  type KeyValueStorage,
} from "./lib/settings";
import { prepareUpload } from "./lib/upload";
import { el } from "./ui/dom";
import { renderHistory } from "./ui/history";
import { renderResult, type ResultState } from "./ui/results";
import { renderSettings, renderSetup } from "./ui/settings";

function deviceStorage(): KeyValueStorage {
  try {
    return window.localStorage;
  } catch {
    // Some browsers throw on access when site data is blocked; settings then
    // last until the tab closes.
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
    };
  }
}

const storage = deviceStorage();
// Not `history`: that would hide the browser's window.history.
const songs = createHistory(historyStorage(storage));
const root = document.getElementById("app") as HTMLElement;

let result: ResultState | null = null;
let lastImage: Blob | null = null;
let entries: HistoryEntry[] = [];
/** A screenshot shared before the token was set; looked up once it is. */
let pending: Blob | null = null;
/** Counts lookups, so an answer that comes back late can't replace a newer one. */
let latestLookup = 0;

/**
 * Reads what a link handed over (the setup link's token, or the iPhone
 * Shortcut's result or error), then removes it from the address bar and
 * history so a reload or a shared screenshot of the URL can't repeat it.
 */
function takeHandoff() {
  if (!/(^#|&)(token|result|error)(=|&|$)/.test(location.hash)) return;
  const handoff = readFragment(location.hash);
  history.replaceState(null, "", location.pathname + location.search);
  switch (handoff?.kind) {
    case "token":
      saveSettings(storage, { ...loadSettings(storage), token: handoff.token });
      break;
    case "result":
      // Newer than any lookup still running in this tab.
      latestLookup++;
      void finish(handoff.response);
      break;
    case "error":
      latestLookup++;
      show({ kind: "done", outcome: { kind: "error", code: handoff.code } });
      break;
  }
}

/** Keeps a found song, then shows it, or opens the preferred app if that's the setting. */
async function finish(response: ResolveResponse, isLatest = () => true) {
  await songs.add(response).catch(() => undefined);
  entries = await songs.load();
  if (!isLatest()) return render();
  const settings = loadSettings(storage);
  const link = settings.openDirectly
    ? directLink(response, settings.preferredPlatform)
    : null;
  if (link) {
    location.replace(link);
    return;
  }
  show({ kind: "done", outcome: { kind: "result", response } });
}

async function lookUp(image: Blob) {
  const lookup = ++latestLookup;
  const isLatest = () => lookup === latestLookup;
  lastImage = image;
  if (!loadSettings(storage).token) {
    pending = image;
    result = null;
    return render();
  }
  if (!navigator.onLine) return show({ kind: "offline" });
  show({ kind: "loading" });
  const upload = await prepareUpload(image, convertToJpeg);
  if (!isLatest()) return;
  if (!upload) return show({ kind: "unsupported" });
  const outcome = await resolve(
    upload,
    { workerUrl: location.origin, token: loadSettings(storage).token },
    fetch,
  );
  if (outcome.kind === "result") await finish(outcome.response, isLatest);
  else if (isLatest()) show({ kind: "done", outcome });
}

function show(state: ResultState) {
  result = state;
  render();
}

function picker(): HTMLElement {
  const input = el("input", { type: "file", accept: "image/*" });
  input.addEventListener("change", () => {
    const [file] = input.files ?? [];
    input.value = "";
    if (file) void lookUp(file);
  });
  const paste =
    "clipboard" in navigator && "read" in navigator.clipboard
      ? el("button", { type: "button" }, "Paste")
      : null;
  paste?.addEventListener("click", () => {
    void navigator.clipboard.read().then(
      async (items) => {
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (type) return lookUp(await item.getType(type));
        }
      },
      () => undefined,
    );
  });
  return el(
    "section",
    { className: "pick" },
    el(
      "div",
      { className: "actions" },
      el(
        "label",
        { className: "button primary" },
        "Choose a screenshot",
        input,
      ),
      paste,
    ),
    el(
      "p",
      { className: "hint" },
      "Or share a screenshot to this app from your gallery.",
    ),
  );
}

function home(preferred: Parameters<typeof renderResult>[1]): HTMLElement {
  return el(
    "div",
    { className: "home" },
    picker(),
    result
      ? renderResult(result, preferred, {
          onRetry: () => lastImage && void lookUp(lastImage),
        })
      : null,
    renderHistory(entries, Date.now(), (entry) => {
      latestLookup++;
      lastImage = null;
      show({
        kind: "done",
        outcome: { kind: "result", response: entry.response },
      });
      scrollTo({ top: 0 });
    }),
  );
}

function render() {
  const settings = loadSettings(storage);
  const onSettings = location.hash === "#settings";
  const header = el(
    "header",
    {},
    el("h1", {}, "Song from Screenshot"),
    onSettings ? null : el("a", { href: "#settings" }, "Settings"),
  );

  let view: HTMLElement;
  if (onSettings) {
    view = renderSettings(settings, {
      onSave: (next) => saveSettings(storage, next),
      onTest: (token) =>
        testConnection({ workerUrl: location.origin, token }, fetch),
      onClearHistory: async () => {
        await songs.clear();
        entries = [];
      },
    });
  } else if (!settings.token && !result) {
    // A result handed over by the iPhone Shortcut needs no token to show.
    view = renderSetup({
      onSave: (next) => {
        const saved = saveSettings(storage, next);
        if (saved && pending) {
          const image = pending;
          pending = null;
          void lookUp(image);
        } else if (saved) {
          render();
        }
        return saved;
      },
    });
  } else {
    view = home(settings.preferredPlatform);
  }
  root.replaceChildren(header, view);
}

document.addEventListener("paste", (event) => {
  const file = [...(event.clipboardData?.files ?? [])].find((f) =>
    f.type.startsWith("image/"),
  );
  if (file && loadSettings(storage).token) void lookUp(file);
});

/** A screenshot from Android's share sheet, parked by the service worker. */
async function takeShare() {
  const share = readShareParams(location.search);
  if (!share) return;
  // Clear it first, so a reload doesn't try the same share again.
  history.replaceState(null, "", location.pathname + location.hash);
  if (share.kind === "unavailable") return show({ kind: "share_unavailable" });
  const image = await takeShared(caches, share.key).catch(() => null);
  if (image) await lookUp(image);
  else show({ kind: "share_missing" });
}

takeHandoff();
render();
void takeShare();
void songs.load().then((loaded) => {
  entries = loaded;
  render();
});
// A setup link opened while the app is already showing only changes the hash.
addEventListener("hashchange", () => {
  takeHandoff();
  render();
});

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js");
}
