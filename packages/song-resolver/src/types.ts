export interface SongText {
  title: string;
  artist: string;
}

export type Player = "spotify" | "apple_music" | "unknown";

export type Extraction =
  | { found: false }
  | {
      found: true;
      title: string;
      artist: string;
      player: Player;
      confidence: number;
    };

export type Links = Partial<
  Record<
    "appleMusic" | "deezer" | "spotify" | "youtube" | "youtubeMusic",
    string
  >
> &
  Record<string, string>;

export interface Candidate extends SongText {
  album?: string;
  artworkUrl?: string;
  links: Links;
}

export interface Track extends SongText {
  album: string | null;
  artworkUrl: string | null;
}

export type Status = "matched" | "uncertain" | "not_found";

export interface ResolveResponse {
  status: Status;
  partial: boolean;
  cached: boolean;
  extracted: {
    title: string;
    artist: string;
    player: Player;
    confidence: number;
  } | null;
  track: Track | null;
  links: Links;
  songLink: string | null;
  searchLinks: { spotify: string; youtube: string } | null;
}

export type ErrorCode =
  | "missing_image"
  | "unauthorized"
  | "image_too_large"
  | "unsupported_type"
  | "upstream_error"
  | "internal_error";

export interface ErrorResponse {
  error: { code: ErrorCode; message: string };
}
