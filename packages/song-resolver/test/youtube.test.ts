import { describe, expect, it, vi } from "vitest";
import youtubeEgo from "../fixtures/upstream/youtube-ego.json";
import youtubeFein from "../fixtures/upstream/youtube-fein.json";
import youtubeSlideTackle from "../fixtures/upstream/youtube-slide-tackle.json";
import type { Env } from "../src/env";
import { isMatch } from "../src/match";
import { youtube } from "../src/providers/youtube";
import type { SongText } from "../src/types";

const ENV = { COUNTRY: "US", YOUTUBE_API_KEY: "yt-key" } as Env;

function ctx(body: unknown) {
  return {
    env: ENV,
    fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
    signal: new AbortController().signal,
  };
}

async function firstMatch(song: SongText, body: unknown) {
  const candidates = await youtube.search(song, ctx(body));
  return candidates.find((c) => isMatch(song, c));
}

function video(id: string, title: string, channelTitle: string) {
  return { id: { videoId: id }, snippet: { title, channelTitle } };
}

describe("youtube", () => {
  it("searches music videos for 'artist - title' in the configured region", async () => {
    const c = ctx(youtubeEgo);

    await youtube.search(
      { title: "FE!N (feat. Playboi Carti)", artist: "Travis Scott" },
      c,
    );

    const url = new URL(String(c.fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("travis scott - FE!N");
    expect(url.searchParams.get("videoCategoryId")).toBe("10");
    expect(url.searchParams.get("regionCode")).toBe("US");
    expect(url.searchParams.has("key")).toBe(false);
    const init = c.fetch.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("X-Goog-Api-Key")).toBe("yt-key");
  });

  it("prefers the label's official audio over a fan re-upload listed above it", async () => {
    const match = await firstMatch(
      { title: "EGO", artist: "Naarly" },
      youtubeEgo,
    );

    expect(match?.links).toEqual({
      youtube: "https://www.youtube.com/watch?v=MXNiK_WAeJk",
      youtubeMusic: "https://music.youtube.com/watch?v=MXNiK_WAeJk",
    });
  });

  it.each([
    ["FE!N (feat. Playboi Carti)", "Travis Scott", youtubeFein, "P_X6JCMVMQ8"],
    ["Slide Tackle", "Japanese Breakfast", youtubeSlideTackle, "0-EMiEpXLJg"],
  ])(
    "prefers the artist's Topic channel for %s",
    async (title, artist, body, id) => {
      const match = await firstMatch({ title, artist }, body);

      expect(match?.links.youtube).toBe(
        `https://www.youtube.com/watch?v=${id}`,
      );
    },
  );

  it("matches official uploads with labels and featured artists in the title, but not lyric, clean or live versions", async () => {
    const song = { title: "FE!N", artist: "Travis Scott" };
    const candidates = await youtube.search(
      song,
      ctx({
        items: [
          video("lyrics", "Travis Scott - FE!N (Lyrics)", "Travis Scott"),
          video(
            "clean",
            "Travis Scott - FE!N (Clean) [Official Audio]",
            "Some Label",
          ),
          video("live", "Travis Scott - FE!N (Live)", "TravisScottVEVO"),
          video(
            "vevo",
            "Travis Scott - FE!N (Official Audio) ft. Playboi Carti",
            "TravisScottVEVO",
          ),
        ],
      }),
    );

    expect(
      candidates.filter((c) => isMatch(song, c)).map((c) => c.links.youtube),
    ).toEqual(["https://www.youtube.com/watch?v=vevo"]);
  });

  it("decodes HTML entities in titles and channel names", async () => {
    const song = { title: "The Boxer", artist: "Simon & Garfunkel" };

    const match = await firstMatch(song, {
      items: [video("box", "The Boxer", "Simon &amp; Garfunkel - Topic")],
    });

    expect(match).toBeDefined();
  });

  it("is enabled only with an API key", () => {
    expect(youtube.isEnabled(ENV)).toBe(true);
    expect(youtube.isEnabled({ ...ENV, YOUTUBE_API_KEY: "" })).toBe(false);
  });
});
