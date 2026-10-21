import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { lookup, LookupError } from "../src/lookup";
import type { Provider } from "../src/providers/provider";
import type { Candidate } from "../src/types";

const EGO = {
  found: true as const,
  title: "EGO",
  artist: "Naarly",
  player: "spotify" as const,
  confidence: 0.9,
};
const DEPS = { env: {} as Env, fetch: vi.fn(), timeoutMs: 50 };

const egoOn = (
  links: Candidate["links"],
  extra: Partial<Candidate> = {},
): Candidate => ({
  title: "EGO",
  artist: "Naarly",
  links,
  ...extra,
});

function provider(
  name: string,
  result: Candidate[] | Error | "hang",
  opts: Partial<Provider> = {},
): Provider {
  return {
    name,
    core: true,
    isEnabled: () => true,
    search: vi.fn(() => {
      if (result === "hang") return new Promise<Candidate[]>(() => {});
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
    }),
    ...opts,
  };
}

describe("lookup", () => {
  it("matches across providers, merging links and taking the track from the first provider", async () => {
    const result = await lookup(
      EGO,
      [
        provider("itunes", [
          egoOn(
            { appleMusic: "am" },
            { album: "EGO - Single", artworkUrl: "art" },
          ),
        ]),
        provider("deezer", [egoOn({ deezer: "dz" }, { album: "EGO" })]),
      ],
      DEPS,
    );

    expect(result).toEqual({
      status: "matched",
      partial: false,
      track: {
        title: "EGO",
        artist: "Naarly",
        album: "EGO - Single",
        artworkUrl: "art",
      },
      links: { appleMusic: "am", deezer: "dz" },
    });
  });

  it("skips decoys and links the candidate that matches", async () => {
    const decoy = { title: "Ego", artist: "NAARI", links: { deezer: "wrong" } };

    const result = await lookup(
      EGO,
      [provider("deezer", [decoy, egoOn({ deezer: "right" })])],
      DEPS,
    );

    expect(result.links).toEqual({ deezer: "right" });
  });

  it("is uncertain with no links when only other versions are found", async () => {
    const remix = {
      title: "EGO (Remix)",
      artist: "Naarly",
      links: { deezer: "remix" },
    };

    const result = await lookup(EGO, [provider("deezer", [remix])], DEPS);

    expect(result).toMatchObject({
      status: "uncertain",
      links: {},
      track: { title: "EGO (Remix)" },
    });
  });

  it("is not_found when no provider has candidates", async () => {
    const result = await lookup(
      EGO,
      [provider("itunes", []), provider("deezer", [])],
      DEPS,
    );

    expect(result).toEqual({
      status: "not_found",
      partial: false,
      track: null,
      links: {},
    });
  });

  it("keeps other providers' links and flags partial when one fails", async () => {
    const result = await lookup(
      EGO,
      [
        provider("itunes", new Error("down")),
        provider("deezer", [egoOn({ deezer: "dz" })]),
      ],
      DEPS,
    );

    expect(result).toMatchObject({
      status: "matched",
      partial: true,
      links: { deezer: "dz" },
    });
  });

  it("gives up on a provider that exceeds the timeout", async () => {
    const result = await lookup(
      EGO,
      [
        provider("itunes", "hang"),
        provider("deezer", [egoOn({ deezer: "dz" })]),
      ],
      DEPS,
    );

    expect(result).toMatchObject({
      status: "matched",
      partial: true,
      links: { deezer: "dz" },
    });
  });

  it("throws when every core provider fails", async () => {
    const optional = provider("youtube", [egoOn({ youtube: "yt" })], {
      core: false,
    });

    await expect(
      lookup(
        EGO,
        [
          provider("itunes", new Error("down")),
          provider("deezer", "hang"),
          optional,
        ],
        DEPS,
      ),
    ).rejects.toBeInstanceOf(LookupError);
  });

  it("skips disabled providers without flagging partial", async () => {
    const spotify = provider("spotify", [egoOn({ spotify: "sp" })], {
      isEnabled: () => false,
    });

    const result = await lookup(
      EGO,
      [provider("itunes", [egoOn({ appleMusic: "am" })]), spotify],
      DEPS,
    );

    expect(spotify.search).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      partial: false,
      links: { appleMusic: "am" },
    });
  });

  it("adds optional providers' links only when a core provider matched", async () => {
    const youtube = provider("youtube", [egoOn({ youtube: "yt" })], {
      core: false,
    });

    const matched = await lookup(
      EGO,
      [provider("itunes", [egoOn({ appleMusic: "am" })]), youtube],
      DEPS,
    );
    const unmatched = await lookup(
      EGO,
      [provider("itunes", []), youtube],
      DEPS,
    );

    expect(matched.links).toEqual({ appleMusic: "am", youtube: "yt" });
    expect(unmatched).toMatchObject({ status: "not_found", links: {} });
  });
});
