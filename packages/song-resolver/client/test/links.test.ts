import { describe, expect, it } from "vitest";
import { linkLabel, orderedLinks } from "../links";
import { xFeed } from "./fixtures/responses";

const keys = (links: { key: string }[]) => links.map((link) => link.key);

describe("orderedLinks", () => {
  it("puts the preferred platform first, then a fixed order", () => {
    expect(keys(orderedLinks(xFeed.links, "deezer"))).toEqual([
      "deezer",
      "spotify",
      "appleMusic",
      "youtubeMusic",
      "youtube",
    ]);
    expect(keys(orderedLinks(xFeed.links, "spotify"))).toEqual([
      "spotify",
      "appleMusic",
      "youtubeMusic",
      "youtube",
      "deezer",
    ]);
  });

  it("keeps platforms it doesn't know, after the known ones, in response order", () => {
    const links = {
      tidal: "https://tidal.com/track/1",
      spotify: "https://open.spotify.com/track/1",
      amazonMusic: "https://music.amazon.com/1",
    };
    expect(orderedLinks(links, "appleMusic")).toEqual([
      {
        key: "spotify",
        label: "Spotify",
        url: "https://open.spotify.com/track/1",
      },
      { key: "tidal", label: "Tidal", url: "https://tidal.com/track/1" },
      {
        key: "amazonMusic",
        label: "Amazon Music",
        url: "https://music.amazon.com/1",
      },
    ]);
  });
});

describe("linkLabel", () => {
  it("names unknown keys by splitting camelCase", () => {
    expect(linkLabel("amazonMusic")).toBe("Amazon Music");
    expect(linkLabel("soundcloud")).toBe("Soundcloud");
    expect(linkLabel("youtubeMusic")).toBe("YouTube Music");
  });
});
