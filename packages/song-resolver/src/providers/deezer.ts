import { searchQuery } from "../match";
import type { Candidate } from "../types";
import { getJson, ProviderError, type Provider } from "./provider";

interface DeezerResponse {
  data?: {
    title: string;
    link: string;
    artist: { name: string };
    album: { title: string; cover_xl?: string };
  }[];
  error?: { message: string };
}

export const deezer: Provider = {
  name: "deezer",
  core: true,
  isEnabled: () => true,

  async search(song, ctx) {
    const url = new URL("https://api.deezer.com/search");
    url.searchParams.set("q", searchQuery(song));
    url.searchParams.set("limit", "10");

    // Deezer reports errors (e.g. quota) as HTTP 200 with an `error` body.
    const body = (await getJson(url, ctx, "Deezer")) as DeezerResponse;
    if (body.error)
      throw new ProviderError(`Deezer error: ${body.error.message}`);

    return (body.data ?? []).map((r): Candidate => ({
      title: r.title,
      artist: r.artist.name,
      album: r.album.title,
      artworkUrl: r.album.cover_xl,
      links: { deezer: r.link },
    }));
  },
};
