import type { Platform } from "../../../client/platforms";
import type { ResolveResponse } from "../../../src/types";

// Where each platform's links live. Anyone can write a #result= link, so
// opening one without a tap must not go anywhere else.
const PLATFORM_HOSTS: Record<Platform, string[]> = {
  spotify: ["open.spotify.com"],
  appleMusic: ["music.apple.com"],
  youtubeMusic: ["music.youtube.com"],
  youtube: ["www.youtube.com", "youtube.com", "youtu.be"],
  deezer: ["www.deezer.com", "deezer.com"],
};

function onPlatform(link: string, platform: Platform): boolean {
  try {
    const url = new URL(link);
    return (
      url.protocol === "https:" &&
      PLATFORM_HOSTS[platform].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Where "Open my app directly" goes: the preferred platform's own link, only for a match. */
export function directLink(
  response: ResolveResponse,
  preferred: Platform,
): string | null {
  const link = response.links[preferred];
  return response.status === "matched" && link && onPlatform(link, preferred)
    ? link
    : null;
}
