import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../src/lib/history";
import { renderHistory } from "../src/ui/history-list";
import * as responses from "./fixtures/responses";

const NOW = Date.UTC(2026, 9, 22, 12);

function render(history: HistoryEntry[]) {
  const list = renderHistory(history, "appleMusic", NOW);
  const rows = [...list.querySelectorAll<HTMLElement>(".entry")];
  return { list, rows };
}

const hrefs = (root: Element, selector: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => a.href);

describe("renderHistory", () => {
  it("lists songs newest first with artist and how long ago", () => {
    const { rows } = render([
      { response: responses.fein, savedAt: NOW - 5 * 60_000 },
      { response: responses.xFeed, savedAt: NOW - 2 * 86_400_000 },
    ]);
    expect(rows.map((row) => row.querySelector(".title")?.textContent)).toEqual(
      [responses.fein.track.title, responses.xFeed.track.title],
    );
    expect(rows[0]?.textContent).toContain(responses.fein.track.artist);
    expect(rows[0]?.textContent).toContain("5 minutes ago");
  });

  it("offers the preferred platform without expanding the row", () => {
    const { rows } = render([{ response: responses.fein, savedAt: NOW }]);
    expect(hrefs(rows[0] as HTMLElement, "a.primary")).toEqual([
      responses.fein.links.appleMusic,
    ]);
  });

  it("shows every link when the row is opened, and hides them again", () => {
    const { rows } = render([{ response: responses.fein, savedAt: NOW }]);
    const row = rows[0] as HTMLElement;
    const toggle = row.querySelector<HTMLButtonElement>("button.row");
    const panel = row.querySelector<HTMLElement>(".all");
    expect(panel?.hidden).toBe(true);

    toggle?.click();
    expect(panel?.hidden).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(hrefs(panel as HTMLElement, "a")).toHaveLength(
      Object.keys(responses.fein.links).length,
    );

    toggle?.click();
    expect(panel?.hidden).toBe(true);
  });

  it("marks an uncertain result and offers searches instead of platforms", () => {
    const { rows } = render([
      { response: responses.uncertainMisread, savedAt: NOW },
    ]);
    const row = rows[0] as HTMLElement;
    expect(row.textContent).toContain("Not sure");
    expect(hrefs(row, "a.primary")).toEqual([
      responses.uncertainMisread.searchLinks.spotify,
    ]);
  });

  it("shows only web links and artwork from the stored response", () => {
    const tampered = {
      ...responses.fein,
      track: { ...responses.fein.track, artworkUrl: "javascript:alert(1)" },
      links: {
        spotify: "javascript:alert(1)",
        deezer: responses.fein.links.deezer,
      },
    };
    const { list } = render([{ response: tampered, savedAt: NOW }]);
    expect(list.querySelector("img")).toBeNull();
    expect(hrefs(list, "a")).toEqual([
      responses.fein.links.deezer,
      responses.fein.links.deezer,
    ]);
  });

  it("says how to start when there's nothing yet", () => {
    const { list, rows } = render([]);
    expect(rows).toHaveLength(0);
    expect(list.textContent).toContain("Find song");
  });
});
