import { searchQuery } from "../match";
import type { Candidate } from "../types";
import { getJson, type Provider } from "./provider";

interface ItunesResponse {
  results: {
    trackName: string;
    artistName: string;
    collectionName?: string;
    artworkUrl100?: string;
    trackViewUrl: string;
  }[];
}

export const itunes: Provider = {
  name: "itunes",
  core: true,
  isEnabled: () => true,

  async search(song, ctx) {
    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", searchQuery(song));
    url.searchParams.set("entity", "song");
    url.searchParams.set("country", ctx.env.COUNTRY);
    url.searchParams.set("limit", "10");

    const body = (await getJson(url, ctx, "iTunes")) as ItunesResponse;
    return body.results.map((r): Candidate => ({
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      artworkUrl: r.artworkUrl100?.replace("100x100bb", "600x600bb"),
      links: { appleMusic: withoutTracking(r.trackViewUrl) },
    }));
  },
};

function withoutTracking(link: string): string {
  const url = new URL(link);
  url.searchParams.delete("uo");
  return url.toString();
}
