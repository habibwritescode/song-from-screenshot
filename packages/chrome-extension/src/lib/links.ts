import { PLATFORM_LABELS, PLATFORMS, type Platform } from "./settings";

export interface LinkButton {
  key: string;
  label: string;
  url: string;
}

export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function linkLabel(key: string): string {
  if (key in PLATFORM_LABELS) return PLATFORM_LABELS[key as Platform];
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Preferred platform first, then the known ones in a fixed order, then any others. */
export function orderedLinks(
  links: Record<string, string>,
  preferred: Platform,
): LinkButton[] {
  const known: string[] = [
    preferred,
    ...PLATFORMS.filter((p) => p !== preferred),
  ];
  const others = Object.keys(links).filter((key) => !known.includes(key));
  return [...known, ...others].flatMap((key) => {
    const url = links[key];
    return url ? [{ key, label: linkLabel(key), url }] : [];
  });
}
