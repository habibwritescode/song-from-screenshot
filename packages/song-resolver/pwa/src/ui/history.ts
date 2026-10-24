import { timeAgo, type HistoryEntry } from "../../../client/history";
import { isWebUrl } from "../../../client/links";
import { el } from "./dom";

/** Recent songs; tapping one shows its result again. Null when there are none. */
export function renderHistory(
  entries: HistoryEntry[],
  now: number,
  onOpen: (entry: HistoryEntry) => void,
): HTMLElement | null {
  if (entries.length === 0) return null;
  return el(
    "section",
    { className: "history" },
    el("h2", {}, "Recent"),
    el(
      "ul",
      {},
      ...entries.map((entry) => {
        const { response, savedAt } = entry;
        const song = response.track ?? response.extracted;
        const artwork = response.track?.artworkUrl;
        const when = timeAgo(savedAt, now);
        return el(
          "li",
          {},
          el(
            "button",
            { type: "button", className: "row", onclick: () => onOpen(entry) },
            artwork && isWebUrl(artwork)
              ? el("img", { src: artwork, alt: "", className: "artwork" })
              : el("span", { className: "artwork" }),
            el(
              "span",
              { className: "text" },
              el(
                "strong",
                { className: "title" },
                song?.title ?? "Unknown song",
              ),
              el("span", { className: "artist" }, song?.artist ?? ""),
              el(
                "span",
                { className: "when" },
                response.status === "uncertain" ? `Not sure · ${when}` : when,
              ),
            ),
          ),
        );
      }),
    ),
  );
}
