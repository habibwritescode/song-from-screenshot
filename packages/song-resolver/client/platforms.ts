export const PLATFORMS = [
  "spotify",
  "appleMusic",
  "youtubeMusic",
  "youtube",
  "deezer",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtubeMusic: "YouTube Music",
  youtube: "YouTube",
  deezer: "Deezer",
};
