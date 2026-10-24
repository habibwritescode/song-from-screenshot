import type { ConnectionResult } from "../../../client/api";
import { PLATFORM_LABELS, PLATFORMS } from "../../../client/platforms";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";
import { el } from "./dom";

const NOT_SAVED =
  "This browser won't keep it (private browsing?). Open the app in a normal window.";

const TEST_MESSAGES: Record<ConnectionResult["kind"], string> = {
  ok: "Token accepted.",
  bad_token: "Token rejected. Check it matches the Worker's ACCESS_TOKEN.",
  unreachable: "Can't reach your Worker. Check your connection.",
  not_song_resolver:
    "This address isn't answering like a song-resolver Worker.",
};

function tokenField(value: string) {
  const input = el("input", {
    id: "token",
    type: "password",
    value,
    autocomplete: "off",
    spellcheck: false,
    required: true,
  });
  const reveal = el("button", { type: "button" }, "Show");
  reveal.dataset.action = "reveal";
  reveal.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    reveal.textContent = hidden ? "Hide" : "Show";
  });
  const error = el("p", { className: "error" });
  error.setAttribute("role", "alert");
  const label = el(
    "label",
    { htmlFor: "token" },
    "Access token",
    el(
      "span",
      { className: "hint" },
      "The token setup printed, or the one you entered on the Deploy form.",
    ),
  );
  const field = el(
    "div",
    { className: "field" },
    label,
    el("div", { className: "row" }, input, reveal),
    error,
  );
  /** The trimmed token, or null with an error shown. */
  const read = () => {
    const token = input.value.trim();
    error.textContent = token ? "" : "Paste your access token.";
    return token || null;
  };
  return { field, read, error };
}

/** First run: just the token, everything else at its default. */
export function renderSetup(actions: {
  onSave(settings: Settings): boolean;
}): HTMLElement {
  const token = tokenField("");
  const form = el(
    "form",
    { className: "panel" },
    token.field,
    el("button", { type: "submit", className: "primary" }, "Save"),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = token.read();
    if (!value) return;
    if (!actions.onSave({ ...DEFAULT_SETTINGS, token: value })) {
      token.error.textContent = NOT_SAVED;
    }
  });
  return el(
    "section",
    { className: "setup" },
    el(
      "p",
      { className: "lede" },
      "Paste your access token, or open the setup link on this phone.",
    ),
    form,
  );
}

export function renderSettings(
  saved: Settings,
  actions: {
    onSave(settings: Settings): boolean;
    onTest(token: string): Promise<ConnectionResult>;
    onClearHistory(): Promise<void>;
  },
): HTMLElement {
  const token = tokenField(saved.token);
  const preferred = el(
    "select",
    { id: "preferred" },
    ...PLATFORMS.map((platform) =>
      el("option", { value: platform }, PLATFORM_LABELS[platform]),
    ),
  );
  preferred.value = saved.preferredPlatform;
  const openDirectly = el("input", {
    id: "open-directly",
    type: "checkbox",
    checked: saved.openDirectly,
  });
  const status = el("p", { className: "status" });
  status.setAttribute("role", "status");
  const test = el("button", { type: "button" }, "Test");
  test.dataset.action = "test";

  const form = el(
    "form",
    { className: "panel" },
    token.field,
    el(
      "div",
      { className: "field" },
      el(
        "label",
        { htmlFor: "preferred" },
        "Preferred platform",
        el("span", { className: "hint" }, "Shown first on every result."),
      ),
      preferred,
    ),
    el(
      "label",
      { className: "check" },
      openDirectly,
      "Open my app directly when the song is found",
    ),
    el(
      "div",
      { className: "actions" },
      el("button", { type: "submit", className: "primary" }, "Save"),
      test,
    ),
    status,
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = token.read();
    if (!value) return;
    const ok = actions.onSave({
      token: value,
      preferredPlatform: preferred.value as Settings["preferredPlatform"],
      openDirectly: openDirectly.checked,
    });
    status.dataset.result = ok ? "ok" : "bad";
    status.textContent = ok ? "Saved." : NOT_SAVED;
  });

  test.addEventListener("click", () => {
    const value = token.read();
    if (!value) return;
    test.disabled = true;
    status.textContent = "Testing…";
    delete status.dataset.result;
    void actions
      .onTest(value)
      .then((result) => {
        status.dataset.result = result.kind === "ok" ? "ok" : "bad";
        status.textContent = TEST_MESSAGES[result.kind];
      })
      .finally(() => (test.disabled = false));
  });

  const clear = el("button", { type: "button" }, "Clear history");
  clear.dataset.action = "clear-history";
  const cleared = el("p", { className: "status" });
  cleared.setAttribute("role", "status");
  clear.addEventListener("click", () => {
    void actions.onClearHistory().then(
      () => (cleared.textContent = "History cleared."),
      () => (cleared.textContent = "Couldn't clear the history."),
    );
  });

  return el(
    "section",
    { className: "settings" },
    el("h2", {}, "Settings"),
    form,
    el(
      "div",
      { className: "panel" },
      el(
        "p",
        { className: "hint" },
        "Your last 10 songs are kept on this device only.",
      ),
      clear,
      cleared,
    ),
    el("a", { href: "#", className: "back" }, "Done"),
  );
}
