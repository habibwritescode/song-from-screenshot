import type { Env } from "../env";
import { cleanTitle, primaryArtist } from "../match";
import type { Candidate } from "../types";
import { getJson, ProviderError, type Provider } from "./provider";

const REFRESH_MARGIN_MS = 60_000;

interface SpotifySearch {
  tracks: {
    items: {
      name: string;
      artists: { name: string }[];
      album: { name: string; images: { url: string }[] };
      external_urls: { spotify: string };
    }[];
  };
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export function createSpotify(now: () => number = Date.now): Provider {
  let cached: { token: Promise<string>; expiresAt: number } | null = null;

  function getToken(env: Env, fetcher: typeof fetch): Promise<string> {
    if (cached && now() < cached.expiresAt) return cached.token;

    const entry = {
      expiresAt: Infinity,
      token: requestToken(env, fetcher).then(
        (body) => {
          entry.expiresAt = now() + body.expires_in * 1000 - REFRESH_MARGIN_MS;
          return body.access_token;
        },
        (err: unknown) => {
          if (cached === entry) cached = null;
          throw err;
        },
      ),
    };
    cached = entry;
    return entry.token;
  }

  return {
    name: "spotify",
    core: true,
    isEnabled: (env) => !!env.SPOTIFY_CLIENT_ID && !!env.SPOTIFY_CLIENT_SECRET,

    async search(song, ctx) {
      const token = await getToken(ctx.env, ctx.fetch);

      const url = new URL("https://api.spotify.com/v1/search");
      url.searchParams.set(
        "q",
        `track:"${unquote(cleanTitle(song.title))}" artist:"${unquote(primaryArtist(song.artist))}"`,
      );
      url.searchParams.set("type", "track");
      url.searchParams.set("market", ctx.env.COUNTRY);
      url.searchParams.set("limit", "10");

      const body = (await getJson(url, ctx, "Spotify", {
        Authorization: `Bearer ${token}`,
      })) as SpotifySearch;
      return body.tracks.items.map((t): Candidate => ({
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: t.album.name,
        artworkUrl: t.album.images[0]?.url,
        links: { spotify: t.external_urls.spotify },
      }));
    },
  };
}

// No abort signal: concurrent lookups share this request, so one of them
// timing out must not cancel the token for the rest.
async function requestToken(
  env: Env,
  fetcher: typeof fetch,
): Promise<TokenResponse> {
  const res = await fetcher("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok)
    throw new ProviderError(`Spotify token returned HTTP ${res.status}`);
  return res.json<TokenResponse>();
}

// A `"` inside a value would end Spotify's quoted field filter early.
function unquote(s: string): string {
  return s.replace(/"/g, "");
}

export const spotify = createSpotify();
