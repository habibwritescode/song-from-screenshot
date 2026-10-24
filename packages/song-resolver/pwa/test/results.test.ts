import { describe, expect, it, vi } from "vitest";
import type { Outcome, OutcomeError } from "../../client/api";
import * as responses from "../../client/test/fixtures/responses";
import { renderResult, type ResultState } from "../src/ui/results";

function render(state: ResultState) {
  const onRetry = vi.fn();
  const view = renderResult(state, "appleMusic", { onRetry });
  const links = [...view.querySelectorAll<HTMLAnchorElement>("a.link")];
  return { view, onRetry, hrefs: links.map((a) => a.href) };
}
const result = (response: Extract<Outcome, { kind: "result" }>["response"]) =>
  render({ kind: "done", outcome: { kind: "result", response } });
const error = (code: OutcomeError) =>
  render({ kind: "done", outcome: { kind: "error", code } });

describe("results", () => {
  it("lists every platform for a match, preferred first", () => {
    const { view, hrefs } = result(responses.fein);
    expect(hrefs).toEqual([
      responses.fein.links.appleMusic,
      responses.fein.links.spotify,
      responses.fein.links.youtubeMusic,
      responses.fein.links.youtube,
      responses.fein.links.deezer,
    ]);
    expect(view.textContent).toContain(responses.fein.track.title);
    expect(view.querySelector("img")?.getAttribute("src")).toBe(
      responses.fein.track.artworkUrl,
    );
  });

  it("says when some platforms didn't answer", () => {
    expect(result(responses.igStoryPartial).view.textContent).toContain(
      "Some platforms didn't answer.",
    );
  });

  it("offers searches, not platform links, when unsure or not found", () => {
    const uncertain = result(responses.uncertainMisread);
    expect(uncertain.view.dataset.state).toBe("uncertain");
    expect(uncertain.hrefs).toEqual([
      responses.uncertainMisread.searchLinks.spotify,
      responses.uncertainMisread.searchLinks.youtube,
    ]);
    expect(result(responses.noPlayer).view.dataset.state).toBe("not_found");
  });

  it("opens links in a new tab without a handle back to the app", () => {
    for (const link of result(responses.fein).view.querySelectorAll("a.link")) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("shows only web links and artwork", () => {
    const tampered = {
      ...responses.fein,
      track: { ...responses.fein.track, artworkUrl: "javascript:alert(1)" },
      links: { spotify: "javascript:alert(1)", deezer: "https://deezer.com/1" },
    };
    const { view, hrefs } = result(tampered);
    expect(hrefs).toEqual(["https://deezer.com/1"]);
    expect(view.querySelector("img")).toBeNull();
  });

  it.each(["timeout", "upstream_error", "internal_error", "network"] as const)(
    "offers Try again after %s",
    (code) => {
      const { view, onRetry } = error(code);
      (view.querySelector("[data-action=retry]") as HTMLButtonElement).click();
      expect(onRetry).toHaveBeenCalled();
    },
  );

  it.each(["unauthorized", "not_configured"] as const)(
    "points to Settings after %s",
    (code) => {
      expect(
        error(code).view.querySelector("a[href='#settings']"),
      ).not.toBeNull();
    },
  );

  it.each(["share_missing", "share_unavailable"] as const)(
    "explains a share that can't be looked up (%s)",
    (kind) => {
      const { view } = render({ kind });
      expect(view.dataset.state).toBe(kind);
      expect(view.textContent).toMatch(/share/i);
    },
  );

  it("marks the loading state as busy", () => {
    expect(render({ kind: "loading" }).view.getAttribute("aria-busy")).toBe(
      "true",
    );
  });
});
