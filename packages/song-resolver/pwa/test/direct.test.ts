import { describe, expect, it } from "vitest";
import * as responses from "../../client/test/fixtures/responses";
import { directLink } from "../src/lib/direct";

describe("directLink", () => {
  it("is the preferred platform's link for a match", () => {
    expect(directLink(responses.fein, "deezer")).toBe(
      responses.fein.links.deezer,
    );
  });

  it("is null when the match has no link for that platform", () => {
    expect(
      directLink(
        { ...responses.fein, links: { deezer: "https://d.com/1" } },
        "spotify",
      ),
    ).toBeNull();
  });

  it("is null unless the song was matched", () => {
    expect(directLink(responses.uncertainMisread, "spotify")).toBeNull();
    expect(directLink(responses.noPlayer, "spotify")).toBeNull();
  });

  it("only goes to the platform's own site, so a crafted link can't redirect", () => {
    const crafted = (spotify: string) =>
      directLink({ ...responses.fein, links: { spotify } }, "spotify");
    expect(crafted("https://phishing.example/open.spotify.com")).toBeNull();
    expect(crafted("https://open.spotify.com.evil.example/track/1")).toBeNull();
    expect(crafted("http://open.spotify.com/track/1")).toBeNull();
    expect(crafted("https://open.spotify.com/track/1")).toBe(
      "https://open.spotify.com/track/1",
    );
  });

  it.each([
    ["spotify", responses.fein.links.spotify],
    ["appleMusic", responses.fein.links.appleMusic],
    ["youtubeMusic", responses.fein.links.youtubeMusic],
    ["youtube", responses.fein.links.youtube],
    ["deezer", responses.fein.links.deezer],
  ] as const)("opens real %s links from the Worker", (platform, link) => {
    expect(directLink(responses.fein, platform)).toBe(link);
  });

  it("never leaves the web", () => {
    expect(
      directLink(
        { ...responses.fein, links: { spotify: "javascript:alert(1)" } },
        "spotify",
      ),
    ).toBeNull();
  });
});
