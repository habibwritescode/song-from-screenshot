import { describe, expect, it, vi } from "vitest";
import type { Outcome, OutcomeError } from "song-resolver/client/api";
import { renderCard, type CardActions, type CardState } from "../src/ui/card";
import * as responses from "song-resolver/client/test/fixtures/responses";

const ARTWORK = "data:image/jpeg;base64,/9j/4AAQ";

function render(state: CardState) {
  const actions: CardActions = {
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onOpenOptions: vi.fn(),
  };
  const card = renderCard(state, "spotify", actions);
  const links = [...card.querySelectorAll<HTMLAnchorElement>("a")];
  const action = (name: string) =>
    card.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
  return { card, actions, links, action };
}

const done = (outcome: Outcome, artwork: string | null = null): CardState => ({
  kind: "done",
  outcome,
  artwork,
});
const result = (response: Extract<Outcome, { kind: "result" }>["response"]) =>
  done({ kind: "result", response }, ARTWORK);
const error = (code: OutcomeError) => done({ kind: "error", code });

describe("matched card", () => {
  it("has one button per link, preferred first, plus nothing else", () => {
    const { links } = render(result(responses.fein));
    expect(links.map((a) => a.href)).toEqual([
      responses.fein.links.spotify,
      responses.fein.links.appleMusic,
      responses.fein.links.youtubeMusic,
      responses.fein.links.youtube,
      responses.fein.links.deezer,
    ]);
  });

  it("opens links in a new tab without giving the page a handle on it", () => {
    const { links } = render(result(responses.fein));
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noopener noreferrer");
    }
  });

  it("shows the track and the artwork the background fetched", () => {
    const { card } = render(result(responses.fein));
    expect(card.textContent).toContain(responses.fein.track.title);
    expect(card.textContent).toContain(responses.fein.track.artist);
    expect(card.textContent).toContain(responses.fein.track.album);
    // Never the remote artwork URL: X's and Instagram's CSP block it.
    expect(card.querySelector("img")?.getAttribute("src")).toBe(ARTWORK);
  });

  it("leaves the artwork out when the background couldn't fetch it", () => {
    const { card } = render(
      done({ kind: "result", response: responses.fein }, null),
    );
    expect(card.querySelector("img")).toBeNull();
  });

  it("says when some platforms didn't answer", () => {
    const note = (state: CardState) =>
      render(state).card.querySelector(".note");
    expect(note(result(responses.igStoryPartial))).not.toBeNull();
    expect(note(result(responses.fein))).toBeNull();
  });

  it("drops any link that isn't a web URL", () => {
    const unsafe = "javascript:alert(1)";
    const matched = render(
      result({
        ...responses.fein,
        links: { ...responses.fein.links, spotify: unsafe },
        songLink: unsafe,
      }),
    );
    expect(matched.links.map((a) => a.href)).not.toContain(unsafe);
    expect(matched.links).toHaveLength(4);

    const unsure = render(
      result({
        ...responses.uncertainMisread,
        searchLinks: {
          spotify: unsafe,
          youtube: responses.uncertainMisread.searchLinks.youtube,
        },
      }),
    );
    expect(unsure.links.map((a) => a.href)).toEqual([
      responses.uncertainMisread.searchLinks.youtube,
    ]);
  });

  it("adds a song.link button when the Worker has one", () => {
    const songLink = "https://song.link/s/abc";
    const { links } = render(result({ ...responses.fein, songLink }));
    expect(links.at(-1)?.href).toBe(songLink);
  });
});

describe("cards without a confident match", () => {
  it("offers only search links when unsure", () => {
    const { card, links } = render(result(responses.uncertainMisread));
    expect(card.dataset.state).toBe("uncertain");
    expect(links.map((a) => a.href)).toEqual([
      responses.uncertainMisread.searchLinks.spotify,
      responses.uncertainMisread.searchLinks.youtube,
    ]);
  });

  it("has no links when there's no song", () => {
    const { card, links } = render(result(responses.noPlayer));
    expect(card.dataset.state).toBe("not_found");
    expect(links).toEqual([]);
  });
});

describe("loading and error cards", () => {
  it("shows progress while loading", () => {
    const { card, links } = render({ kind: "loading" });
    expect(card.dataset.state).toBe("loading");
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(links).toEqual([]);
  });

  it.each<OutcomeError>([
    "not_configured",
    "unauthorized",
    "network",
    "bad_response",
  ])("sends %s to the options page", (code) => {
    const { action, actions } = render(error(code));
    action("options")?.click();
    expect(actions.onOpenOptions).toHaveBeenCalled();
    expect(action("retry")).toBeNull();
  });

  it.each<OutcomeError>(["upstream_error", "internal_error", "timeout"])(
    "offers a retry after %s",
    (code) => {
      const { action, actions } = render(error(code));
      action("retry")?.click();
      expect(actions.onRetry).toHaveBeenCalled();
    },
  );

  it.each<OutcomeError>([
    "image_unreadable",
    "image_too_large",
    "unsupported_type",
    "missing_image",
  ])("offers no action that can't help for %s", (code) => {
    const { action } = render(error(code));
    expect(action("retry")).toBeNull();
    expect(action("options")).toBeNull();
  });

  it("closes from its × button", () => {
    const { action, actions } = render(result(responses.fein));
    action("close")?.click();
    expect(actions.onClose).toHaveBeenCalled();
  });
});
