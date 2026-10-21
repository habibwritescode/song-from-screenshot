import { describe, expect, it, vi } from "vitest";
import spotifyEgo from "../fixtures/upstream/spotify-ego.json";
import spotifyFein from "../fixtures/upstream/spotify-fein.json";
import type { Env } from "../src/env";
import { isMatch } from "../src/match";
import { createSpotify } from "../src/providers/spotify";

const EGO = { title: "EGO", artist: "Naarly" };
const ENV = {
  COUNTRY: "US",
  SPOTIFY_CLIENT_ID: "id",
  SPOTIFY_CLIENT_SECRET: "secret",
} as Env;

function spotifyApi(
  opts: { search?: unknown; tokenStatus?: number[]; expiresIn?: number } = {},
) {
  const tokenStatus = [...(opts.tokenStatus ?? [])];
  let issued = 0;
  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.host === "accounts.spotify.com") {
      const status = tokenStatus.shift() ?? 200;
      if (status !== 200) return Promise.resolve(new Response("", { status }));
      issued += 1;
      return Promise.resolve(
        Response.json({
          access_token: `token-${issued}`,
          token_type: "Bearer",
          expires_in: opts.expiresIn ?? 3600,
        }),
      );
    }
    return Promise.resolve(Response.json(opts.search ?? spotifyEgo));
  });
  const tokenCalls = () =>
    fetch.mock.calls.filter(([input]) =>
      String(input).startsWith("https://accounts.spotify.com"),
    );
  const searchCalls = () =>
    fetch.mock.calls.filter(([input]) =>
      String(input).startsWith("https://api.spotify.com"),
    );
  return { fetch, tokenCalls, searchCalls };
}

function ctx(fetch: typeof globalThis.fetch, env = ENV) {
  return { env, fetch, signal: new AbortController().signal };
}

describe("spotify", () => {
  it("searches by title and primary artist in the configured market", async () => {
    const api = spotifyApi();

    const [first] = await createSpotify().search(EGO, ctx(api.fetch));

    const [input, init] = api.searchCalls()[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get("q")).toBe('track:"EGO" artist:"naarly"');
    expect(url.searchParams.get("market")).toBe("US");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer token-1",
    );
    expect(first).toEqual({
      title: "EGO",
      artist: "Naarly",
      album: expect.any(String),
      artworkUrl: expect.stringMatching(/^https:\/\//),
      links: {
        spotify: "https://open.spotify.com/track/3veGiQJuodUItZWeWyPaXA",
      },
    });
  });

  it("drops double quotes that would break the quoted field filters", async () => {
    const api = spotifyApi();

    await createSpotify().search(
      { title: 'Say "Hello"', artist: "Naarly" },
      ctx(api.fetch),
    );

    const url = new URL(String(api.searchCalls()[0]?.[0]));
    expect(url.searchParams.get("q")).toBe('track:"Say Hello" artist:"naarly"');
  });

  it("lists every credited artist so featured tracks still match, and remixes don't", async () => {
    const api = spotifyApi({ search: spotifyFein });
    const song = {
      title: "FE!N (feat. Playboi Carti)",
      artist: "Travis Scott",
    };

    const candidates = await createSpotify().search(song, ctx(api.fetch));

    const matches = candidates.filter((c) => isMatch(song, c));
    expect(matches[0]?.artist).toBe("Travis Scott, Playboi Carti");
    expect(matches.map((c) => c.title)).not.toContain("FE!N - CHASE B REMIX");
  });

  it("fetches one token for many searches, including concurrent ones", async () => {
    const api = spotifyApi();
    const spotify = createSpotify();

    await Promise.all([
      spotify.search(EGO, ctx(api.fetch)),
      spotify.search(EGO, ctx(api.fetch)),
    ]);
    await spotify.search(EGO, ctx(api.fetch));

    expect(api.tokenCalls()).toHaveLength(1);
    expect(api.searchCalls()).toHaveLength(3);
  });

  it("gets a new token once the old one is about to expire", async () => {
    const api = spotifyApi({ expiresIn: 3600 });
    let now = 0;
    const spotify = createSpotify(() => now);

    await spotify.search(EGO, ctx(api.fetch));
    now = 3_500_000;
    await spotify.search(EGO, ctx(api.fetch));
    now = 3_550_000;
    await spotify.search(EGO, ctx(api.fetch));

    expect(api.tokenCalls()).toHaveLength(2);
  });

  it("fails the search when the token is refused, then retries on the next one", async () => {
    const api = spotifyApi({ tokenStatus: [400] });
    const spotify = createSpotify();

    await expect(spotify.search(EGO, ctx(api.fetch))).rejects.toThrow(
      "HTTP 400",
    );
    await expect(spotify.search(EGO, ctx(api.fetch))).resolves.not.toHaveLength(
      0,
    );
    expect(api.tokenCalls()).toHaveLength(2);
  });

  it("is enabled only when both credentials are set", () => {
    const spotify = createSpotify();

    expect(spotify.isEnabled(ENV)).toBe(true);
    expect(spotify.isEnabled({ ...ENV, SPOTIFY_CLIENT_SECRET: "" })).toBe(
      false,
    );
    expect(spotify.isEnabled({ COUNTRY: "US" } as Env)).toBe(false);
  });
});
