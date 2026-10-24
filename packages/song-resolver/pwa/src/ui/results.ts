import type { Outcome, OutcomeError } from "../../../client/api";
import { isWebUrl, resultLinks, type LinkButton } from "../../../client/links";
import type { Platform } from "../../../client/platforms";
import type { ResolveResponse } from "../../../src/types";
import { el } from "./dom";

export type ResultState =
  | { kind: "loading" }
  /** The browser couldn't decode the image to convert it. */
  | { kind: "unsupported" }
  | { kind: "offline" }
  /** The shared file was already taken (reload, back button) or cleared. */
  | { kind: "share_missing" }
  /** A share reached the Worker because the service worker wasn't installed yet. */
  | { kind: "share_unavailable" }
  | { kind: "done"; outcome: Outcome };

type Action = "retry" | "settings";

// The extension's wording, adjusted for an app that has no Worker URL to set.
const ERRORS: Record<OutcomeError, [message: string, action?: Action]> = {
  not_configured: ["Add your access token in Settings to start.", "settings"],
  unauthorized: ["Your token was rejected.", "settings"],
  network: ["Can't reach your Worker. Check your connection.", "retry"],
  bad_response: ["Your Worker answered with something unexpected.", "retry"],
  upstream_error: ["Your Worker couldn't finish. Try again.", "retry"],
  internal_error: ["Your Worker couldn't finish. Try again.", "retry"],
  timeout: ["Your Worker took too long. Try again.", "retry"],
  image_unreadable: ["Couldn't read this image."],
  image_too_large: ["This image can't be read."],
  unsupported_type: ["This image can't be read."],
  missing_image: ["This image can't be read."],
};

function linkList(links: LinkButton[]): HTMLElement {
  return el(
    "ul",
    { className: "links" },
    ...links
      .filter(({ url }) => isWebUrl(url))
      .map(({ label, url }) =>
        el(
          "li",
          {},
          el(
            "a",
            {
              className: "link",
              href: url,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            label,
            el("span", { className: "arrow", ariaHidden: "true" }, "↗"),
          ),
        ),
      ),
  );
}

function trackInfo(track: ResolveResponse["track"]): HTMLElement | null {
  if (!track) return null;
  const artwork =
    track.artworkUrl && isWebUrl(track.artworkUrl)
      ? el("img", { src: track.artworkUrl, alt: "", className: "artwork" })
      : null;
  return el(
    "div",
    { className: "track" },
    artwork,
    el(
      "div",
      { className: "text" },
      el("strong", { className: "title" }, track.title),
      el("span", { className: "artist" }, track.artist),
      track.album ? el("span", { className: "album" }, track.album) : null,
    ),
  );
}

const message = (text: string) => el("p", { className: "message" }, text);

function retryButton(onRetry: () => void): HTMLButtonElement {
  const button = el(
    "button",
    { type: "button", onclick: onRetry },
    "Try again",
  );
  button.dataset.action = "retry";
  return button;
}

function body(
  state: ResultState,
  preferred: Platform,
  onRetry: () => void,
): [name: string, children: (Node | null)[]] {
  switch (state.kind) {
    case "loading":
      return [
        "loading",
        [
          el(
            "p",
            { className: "message" },
            el("span", { className: "spinner", ariaHidden: "true" }),
            "Reading screenshot…",
          ),
        ],
      ];
    case "unsupported":
      return [
        "unsupported",
        [
          message(
            "This browser can't read this image. On iPhone, share it through the Shortcut, which converts it.",
          ),
        ],
      ];
    case "share_missing":
      return [
        "share_missing",
        [message("That screenshot is no longer here. Share it again.")],
      ];
    case "share_unavailable":
      return [
        "share_unavailable",
        [message("Open the app once, then share again.")],
      ];
    case "offline":
      return [
        "offline",
        [
          message("You're offline. Connect and try again."),
          retryButton(onRetry),
        ],
      ];
    case "done": {
      const { outcome } = state;
      if (outcome.kind === "error") {
        const [text, action] = ERRORS[outcome.code];
        const next =
          action === "retry"
            ? retryButton(onRetry)
            : action === "settings"
              ? el(
                  "a",
                  { href: "#settings", className: "action" },
                  "Open Settings",
                )
              : null;
        return ["error", [message(text), next]];
      }
      const { response } = outcome;
      const links = linkList(resultLinks(response, preferred));
      switch (response.status) {
        case "matched":
          return [
            "matched",
            [
              trackInfo(response.track),
              links,
              response.partial
                ? el(
                    "p",
                    { className: "note" },
                    "Some platforms didn't answer.",
                  )
                : null,
            ],
          ];
        case "uncertain":
          return [
            "uncertain",
            [
              message("Not sure this is the song."),
              trackInfo(response.track),
              links,
            ],
          ];
        case "not_found":
          return [
            "not_found",
            [message("No song found in this image."), links],
          ];
      }
    }
  }
}

export function renderResult(
  state: ResultState,
  preferred: Platform,
  actions: { onRetry(): void },
): HTMLElement {
  const [name, children] = body(state, preferred, actions.onRetry);
  const view = el("section", { className: "result" }, ...children);
  view.dataset.state = name;
  if (state.kind === "loading") view.setAttribute("aria-busy", "true");
  return view;
}
