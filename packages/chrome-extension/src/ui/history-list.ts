import { timeAgo, type HistoryEntry } from "song-resolver/client/history";
import { isWebUrl, resultLinks } from "song-resolver/client/links";
import type { Platform } from "../lib/settings";
import { el, linkAnchor, linkList } from "./dom";

function entryRow(
  { response, savedAt }: HistoryEntry,
  index: number,
  preferred: Platform,
  now: number,
): HTMLElement {
  const song = response.track ?? response.extracted;
  const artworkUrl = response.track?.artworkUrl;
  const links = resultLinks(response, preferred).filter(({ url }) =>
    isWebUrl(url),
  );
  const uncertain = response.status === "uncertain";

  const panel = el("div", { className: "all", id: `entry-${index}` });
  panel.hidden = true;
  panel.append(
    ...(uncertain
      ? [el("p", { className: "note" }, "Not sure this is the song.")]
      : []),
    linkList(links),
  );

  const toggle = el(
    "button",
    { type: "button", className: "row" },
    artworkUrl && isWebUrl(artworkUrl)
      ? el("img", { src: artworkUrl, alt: "", className: "artwork" })
      : el("span", { className: "artwork" }),
    el(
      "span",
      { className: "text" },
      el("strong", { className: "title" }, song?.title ?? "Unknown song"),
      el("span", { className: "artist" }, song?.artist ?? ""),
      el(
        "span",
        { className: "when" },
        uncertain
          ? `Not sure · ${timeAgo(savedAt, now)}`
          : timeAgo(savedAt, now),
      ),
    ),
  );
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", panel.id);
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const [first] = links;
  const primary = first ? linkAnchor(first) : null;
  primary?.classList.add("primary");

  const row = el("li", { className: "entry" }, toggle, primary, panel);
  row.dataset.status = response.status;
  return row;
}

export function renderHistory(
  history: HistoryEntry[],
  preferred: Platform,
  now: number,
): HTMLElement {
  if (history.length === 0) {
    return el(
      "p",
      { className: "empty" },
      "Songs you find show up here. Hover an image on X or Instagram, or right-click any image, and choose Find song.",
    );
  }
  return el(
    "ul",
    { className: "history" },
    ...history.map((entry, i) => entryRow(entry, i, preferred, now)),
  );
}
