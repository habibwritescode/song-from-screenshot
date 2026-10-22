const X_MEDIA = /^https:\/\/pbs\.twimg\.com\/media\//;
const X_FORMATS = new Set(["jpg", "png", "webp"]);
// URLs may contain commas, so a candidate ends at whitespace + descriptor,
// not at the next comma. Instagram omits the space after each comma.
const SRCSET_CANDIDATE = /\s*([^\s,]\S*?)\s+(\d+(?:\.\d+)?)[wx]\s*(?:,|$)/g;

/** The largest version of an image the page offers, for the sharpest read. */
export function bestImageUrl(src: string, srcset = ""): string {
  if (X_MEDIA.test(src)) return xOriginal(src);
  return widestCandidate(srcset) ?? src;
}

function xOriginal(src: string): string {
  const url = new URL(src);
  url.pathname = url.pathname.replace(/:\w+$/, "");
  url.searchParams.set("name", "orig");
  const hasExtension = /\.\w+$/.test(url.pathname);
  const format = url.searchParams.get("format") ?? "";
  if (!hasExtension && !X_FORMATS.has(format)) {
    url.searchParams.set("format", "jpg");
  }
  return url.toString();
}

function widestCandidate(srcset: string): string | null {
  let best: { url: string; size: number } | null = null;
  for (const [, url, size] of srcset.matchAll(SRCSET_CANDIDATE)) {
    if (url && (!best || Number(size) > best.size)) {
      best = { url, size: Number(size) };
    }
  }
  return best?.url ?? null;
}
