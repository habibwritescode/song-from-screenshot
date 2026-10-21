export interface Env {
  ANTHROPIC_API_KEY: string;
  ACCESS_TOKEN: string;
  MODEL: string;
  FALLBACK_MODEL?: string;
  COUNTRY: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  YOUTUBE_API_KEY?: string;
  ODESLI_API_KEY?: string;
  CACHE?: KVNamespace;
}
