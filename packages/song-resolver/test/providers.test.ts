import { describe, expect, it, vi } from "vitest";
import deezerEgo from "../fixtures/upstream/deezer-ego.json";
import deezerError from "../fixtures/upstream/deezer-error.json";
import itunesEgo from "../fixtures/upstream/itunes-ego.json";
import type { Env } from "../src/env";
import { deezer } from "../src/providers/deezer";
import { itunes } from "../src/providers/itunes";
import type { ProviderContext } from "../src/providers/provider";

const EGO = { title: "EGO", artist: "Naarly" };

function ctx(
  body: unknown,
  status = 200,
): ProviderContext & { fetch: ReturnType<typeof vi.fn> } {
  return {
    env: { COUNTRY: "US" } as Env,
    fetch: vi.fn().mockResolvedValue(Response.json(body, { status })),
    signal: new AbortController().signal,
  };
}

describe("itunes", () => {
  it("searches the configured storefront and returns Apple Music candidates", async () => {
    const c = ctx(itunesEgo);

    const [first] = await itunes.search(EGO, c);

    const url = new URL(c.fetch.mock.calls[0]?.[0]);
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("term")).toBe("EGO naarly");
    expect(first).toEqual({
      title: "EGO",
      artist: "Naarly",
      album: "EGO - Single",
      artworkUrl: expect.stringContaining("600x600bb"),
      links: {
        appleMusic:
          "https://music.apple.com/us/album/ego/6812371750?i=6812371751",
      },
    });
  });

  it("throws on an HTTP error", async () => {
    await expect(itunes.search(EGO, ctx({}, 503))).rejects.toThrow("HTTP 503");
  });
});

describe("deezer", () => {
  it("returns Deezer candidates, decoys included, for the matcher to filter", async () => {
    const candidates = await deezer.search(EGO, ctx(deezerEgo));

    expect(candidates[0]).toEqual({
      title: "EGO",
      artist: "Naarly",
      album: "EGO",
      artworkUrl: expect.stringContaining("1000x1000"),
      links: { deezer: "https://www.deezer.com/track/4287819182" },
    });
    expect(candidates.map((c) => c.artist)).toContain("NAARI");
  });

  it("throws on Deezer's in-body error format", async () => {
    await expect(deezer.search(EGO, ctx(deezerError))).rejects.toThrow(
      "Quota limit exceeded",
    );
  });
});
