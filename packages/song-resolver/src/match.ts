import type { SongText } from "./types";

const FEAT_PAREN = /\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi;
const FEAT_BARE = /\s+(?:feat\.?|ft\.?|featuring)\s.*$/i;
const SUFFIX =
  /\s+-\s+(?:single|ep|(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?)\s*$/i;
const ARTIST_SEPARATOR = /\s*(?:,|&|\sx\s|\sfeat\.?\s|\sft\.?\s)\s*/i;

// Keeps punctuation because search APIs rank `FE!N` above `fe n`; use normalize() only for comparing.
export function cleanTitle(s: string): string {
  return s
    .replace(FEAT_PAREN, "")
    .replace(FEAT_BARE, "")
    .replace(SUFFIX, "")
    .trim();
}

export function normalize(s: string): string {
  return cleanTitle(s)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function primaryArtist(artist: string): string {
  return normalize(artist.split(ARTIST_SEPARATOR)[0] ?? "");
}

function containsWords(haystack: string, needle: string): boolean {
  return needle !== "" && ` ${haystack} `.includes(` ${needle} `);
}

export function isMatch(want: SongText, got: SongText): boolean {
  const title = normalize(want.title);
  if (title === "" || title !== normalize(got.title)) return false;

  return (
    containsWords(normalize(got.artist), primaryArtist(want.artist)) ||
    containsWords(normalize(want.artist), primaryArtist(got.artist))
  );
}

export function searchQuery(song: SongText): string {
  return `${cleanTitle(song.title)} ${primaryArtist(song.artist)}`.trim();
}
