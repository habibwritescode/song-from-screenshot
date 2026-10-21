import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import appleFein from "../fixtures/apple-music-android-fein.png?inline";
import appleSlideTackle from "../fixtures/apple-music-android-slide-tackle.png?inline";
import spotifyIgStory from "../fixtures/spotify-ig-story.png?inline";
import spotifyXFeed from "../fixtures/spotify-x-feed.png?inline";
import noPlayerTweet from "../fixtures/no-player-tweet.png?inline";
import spotifyXLightbox from "../fixtures/spotify-x-lightbox.png?inline";
import { createApp } from "../src/index";
import { isMatch } from "../src/match";
import type { ResolveResponse } from "../src/types";
import { executionContext } from "./helpers";

const FIXTURES = [
  {
    name: "spotify-x-feed",
    dataUrl: spotifyXFeed,
    title: "EGO",
    artist: "Naarly",
    player: "spotify",
  },
  {
    name: "spotify-ig-story",
    dataUrl: spotifyIgStory,
    title: "EGO",
    artist: "Naarly",
    player: "spotify",
  },
  {
    name: "spotify-x-lightbox",
    dataUrl: spotifyXLightbox,
    title: "EGO",
    artist: "Naarly",
    player: "spotify",
  },
  {
    name: "apple-music-android-fein",
    dataUrl: appleFein,
    title: "FE!N",
    artist: "Travis Scott",
    player: "apple_music",
  },
  {
    name: "apple-music-android-slide-tackle",
    dataUrl: appleSlideTackle,
    title: "Slide Tackle",
    artist: "Japanese Breakfast",
    player: "apple_music",
  },
];

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

describe("live: /api/resolve on fixtures", () => {
  const app = createApp();

  it.each(FIXTURES)("$name → $title / $artist", async (fixture) => {
    const body = new FormData();
    body.append(
      "image",
      new File([bytesFromDataUrl(fixture.dataUrl)], `${fixture.name}.png`),
    );

    const started = Date.now();
    const res = await app.request(
      "/api/resolve",
      {
        method: "POST",
        body,
        headers: { Authorization: `Bearer ${env.ACCESS_TOKEN}` },
      },
      env,
      executionContext(),
    );
    const result = await res.json<ResolveResponse>();

    console.log(
      fixture.name,
      `${Date.now() - started}ms`,
      JSON.stringify(result),
    );
    expect(result.status).toBe("matched");
    expect(result.partial).toBe(false);
    expect(result.extracted?.player).toBe(fixture.player);
    expect(result.extracted && isMatch(fixture, result.extracted)).toBe(true);
    expect(Object.keys(result.links)).toEqual(
      expect.arrayContaining([
        "appleMusic",
        "deezer",
        "spotify",
        ...(env.YOUTUBE_API_KEY ? ["youtube", "youtubeMusic"] : []),
      ]),
    );
  });

  it("no-player-tweet → not_found", async () => {
    const body = new FormData();
    body.append("image", new File([bytesFromDataUrl(noPlayerTweet)], "t.png"));

    const res = await app.request(
      "/api/resolve",
      {
        method: "POST",
        body,
        headers: { Authorization: `Bearer ${env.ACCESS_TOKEN}` },
      },
      env,
      executionContext(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "not_found" });
  });
});
