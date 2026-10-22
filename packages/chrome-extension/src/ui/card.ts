import type { ResolveResponse } from "song-resolver/src/types";
import type { Outcome, OutcomeError } from "../lib/api";
import { isWebUrl, orderedLinks, type LinkButton } from "../lib/links";
import type { Platform } from "../lib/settings";

export type CardState =
  | { kind: "loading" }
  | { kind: "no_image" }
  | { kind: "reload" }
  | { kind: "done"; outcome: Outcome; artwork: string | null };

export interface CardActions {
  onClose: () => void;
  onRetry: () => void;
  onOpenOptions: () => void;
}

type Action = "retry" | "options";

const ERRORS: Record<OutcomeError, [message: string, action?: Action]> = {
  not_configured: ["Set your Worker URL and token to start.", "options"],
  unauthorized: ["Your token was rejected.", "options"],
  network: ["Can't reach your Worker.", "options"],
  bad_response: ["That URL isn't a song-resolver Worker.", "options"],
  upstream_error: ["Your Worker couldn't finish. Try again.", "retry"],
  internal_error: ["Your Worker couldn't finish. Try again.", "retry"],
  timeout: ["Your Worker took too long. Try again.", "retry"],
  image_unreadable: ["Couldn't read this image."],
  image_too_large: ["This image can't be read."],
  unsupported_type: ["This image can't be read."],
  missing_image: ["This image can't be read."],
};

const ACTION_LABELS: Record<Action, string> = {
  retry: "Try again",
  options: "Open settings",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.filter((child) => child !== null));
  return element;
}

function actionButton(
  action: Action | "close",
  label: string,
  onclick: () => void,
  props: Partial<HTMLButtonElement> = {},
): HTMLButtonElement {
  const button = el("button", { type: "button", onclick, ...props }, label);
  button.dataset.action = action;
  return button;
}

/** Every link the card shows comes from the Worker, so only web URLs pass. */
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
            { href: url, target: "_blank", rel: "noopener noreferrer" },
            label,
            el("span", { className: "arrow", ariaHidden: "true" }, "↗"),
          ),
        ),
      ),
  );
}

function trackInfo(
  track: NonNullable<ResolveResponse["track"]>,
  artwork: string | null,
): HTMLElement {
  return el(
    "div",
    { className: "track" },
    artwork ? el("img", { src: artwork, alt: "", className: "artwork" }) : null,
    el(
      "div",
      { className: "text" },
      el("strong", { className: "title" }, track.title),
      el("span", { className: "artist" }, track.artist),
      track.album ? el("span", { className: "album" }, track.album) : null,
    ),
  );
}

function searchLinks(response: ResolveResponse): HTMLElement | null {
  const search = response.searchLinks;
  if (!search) return null;
  return linkList([
    { key: "spotify", label: "Search Spotify", url: search.spotify },
    { key: "youtube", label: "Search YouTube", url: search.youtube },
  ]);
}

function resultBody(
  response: ResolveResponse,
  artwork: string | null,
  preferred: Platform,
): [state: string, body: (Node | null)[]] {
  switch (response.status) {
    case "matched": {
      const links = orderedLinks(response.links, preferred);
      if (response.songLink) {
        links.push({
          key: "songLink",
          label: "More platforms",
          url: response.songLink,
        });
      }
      return [
        "matched",
        [
          response.track ? trackInfo(response.track, artwork) : null,
          linkList(links),
          response.partial
            ? el("p", { className: "note" }, "Some platforms didn't answer.")
            : null,
        ],
      ];
    }
    case "uncertain":
      return [
        "uncertain",
        [
          el("p", { className: "message" }, "Not sure this is the song."),
          response.track ? trackInfo(response.track, artwork) : null,
          searchLinks(response),
        ],
      ];
    case "not_found":
      return [
        "not_found",
        [
          el("p", { className: "message" }, "No song found in this image."),
          searchLinks(response),
        ],
      ];
  }
}

function body(
  state: CardState,
  preferred: Platform,
  actions: CardActions,
): [state: string, body: (Node | null)[]] {
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
    case "no_image":
      return [
        "no_image",
        [el("p", { className: "message" }, "No image here.")],
      ];
    case "reload":
      return [
        "reload",
        [
          el(
            "p",
            { className: "message" },
            "The extension was updated. Reload this page to use it.",
          ),
        ],
      ];
    case "done": {
      const { outcome } = state;
      if (outcome.kind === "result") {
        return resultBody(outcome.response, state.artwork, preferred);
      }
      const [message, action] = ERRORS[outcome.code];
      const button = action
        ? actionButton(
            action,
            ACTION_LABELS[action],
            action === "retry" ? actions.onRetry : actions.onOpenOptions,
            { className: "action" },
          )
        : null;
      return ["error", [el("p", { className: "message" }, message), button]];
    }
  }
}

export function renderCard(
  state: CardState,
  preferred: Platform,
  actions: CardActions,
): HTMLElement {
  const [name, children] = body(state, preferred, actions);
  const close = actionButton("close", "×", actions.onClose, {
    className: "close",
    ariaLabel: "Close",
  });

  const card = el(
    "section",
    { className: "card", ariaLabel: "Song from Screenshot" },
    close,
    ...children,
  );
  card.setAttribute("role", "dialog");
  card.dataset.state = name;
  if (state.kind === "loading") card.setAttribute("aria-busy", "true");
  return card;
}
