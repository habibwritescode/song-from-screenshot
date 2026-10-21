import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  isMatch,
  normalize,
  primaryArtist,
  searchQuery,
} from "../src/match";

describe("cleanTitle", () => {
  it.each([
    ["FE!N (feat. Playboi Carti)", "FE!N"],
    ["Song [ft. Someone]", "Song"],
    ["Song (with Other Artist)", "Song"],
    ["Song feat. Someone", "Song"],
    ["Here Comes the Sun - Remastered 2009", "Here Comes the Sun"],
    ["Here Comes the Sun - 2009 Remaster", "Here Comes the Sun"],
    ["EGO - Single", "EGO"],
    ["Slide Tackle", "Slide Tackle"],
  ])("%s → %s", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });

  it("keeps version markers that make a different recording", () => {
    expect(cleanTitle("FE!N (CHASE B REMIX)")).toBe("FE!N (CHASE B REMIX)");
  });
});

describe("normalize", () => {
  it.each([
    ["FE!N (feat. Playboi Carti)", "fe n"],
    ["Beyoncé", "beyonce"],
    ["  Slide   Tackle  ", "slide tackle"],
    ["Don't Stop Me Now - Remastered 2011", "don t stop me now"],
  ])("%s → %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("primaryArtist", () => {
  it.each([
    ["Naarly", "naarly"],
    ["Travis Scott, Playboi Carti", "travis scott"],
    ["Simon & Garfunkel", "simon"],
    ["Fred again.. x Skrillex", "fred again"],
    ["Travis Scott feat. Playboi Carti", "travis scott"],
    ["Beyoncé", "beyonce"],
  ])("%s → %s", (input, expected) => {
    expect(primaryArtist(input)).toBe(expected);
  });
});

describe("isMatch", () => {
  const ego = { title: "EGO", artist: "Naarly" };

  it("matches identical songs", () => {
    expect(isMatch(ego, { title: "EGO", artist: "Naarly" })).toBe(true);
  });

  it("matches when the candidate adds feat. or a release suffix", () => {
    expect(
      isMatch(
        { title: "FE!N (feat. Playboi Carti)", artist: "Travis Scott" },
        { title: "FE!N (feat. Playboi Carti)", artist: "Travis Scott" },
      ),
    ).toBe(true);
    expect(
      isMatch(
        { title: "FE!N", artist: "Travis Scott" },
        { title: "FE!N (feat. Playboi Carti)", artist: "Travis Scott" },
      ),
    ).toBe(true);
    expect(isMatch(ego, { title: "EGO - Single", artist: "Naarly" })).toBe(
      true,
    );
  });

  it("matches when artist strings list collaborators differently", () => {
    expect(
      isMatch(
        { title: "FE!N", artist: "Travis Scott" },
        { title: "FE!N", artist: "Travis Scott, Playboi Carti" },
      ),
    ).toBe(true);
    expect(
      isMatch(
        { title: "Song", artist: "Travis Scott & Playboi Carti" },
        { title: "Song", artist: "Travis Scott" },
      ),
    ).toBe(true);
  });

  it("ignores case and diacritics", () => {
    expect(
      isMatch(
        { title: "Halo", artist: "Beyonce" },
        { title: "HALO", artist: "Beyoncé" },
      ),
    ).toBe(true);
  });

  it("rejects remixes and other versions", () => {
    expect(
      isMatch(
        { title: "FE!N", artist: "Travis Scott" },
        { title: "FE!N (CHASE B REMIX)", artist: "Travis Scott" },
      ),
    ).toBe(false);
  });

  it("rejects same title by a different artist", () => {
    expect(isMatch(ego, { title: "EGO", artist: "Someone Else" })).toBe(false);
  });

  it("rejects different title by the same artist", () => {
    expect(isMatch(ego, { title: "Other Song", artist: "Naarly" })).toBe(false);
  });

  it("rejects empty text", () => {
    expect(isMatch({ title: "", artist: "" }, { title: "", artist: "" })).toBe(
      false,
    );
    expect(
      isMatch({ title: "EGO", artist: "" }, { title: "EGO", artist: "Naarly" }),
    ).toBe(false);
  });
});

describe("searchQuery", () => {
  it("keeps title punctuation but drops feat. and collaborators", () => {
    expect(
      searchQuery({
        title: "FE!N (feat. Playboi Carti)",
        artist: "Travis Scott, Playboi Carti",
      }),
    ).toBe("FE!N travis scott");
  });
});
