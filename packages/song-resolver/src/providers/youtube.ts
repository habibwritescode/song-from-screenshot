import { cleanTitle, normalize, primaryArtist } from "../match";
import type { Candidate } from "../types";
import { getJson, type Provider } from "./provider";

const TOPIC_SUFFIX = / - Topic$/;
const UPLOAD_LABEL =
  /\s*[([](?:official\s+)?(?:music\s+|lyric\s+)?(?:audio|video|visuali[sz]er)[)\]]/gi;

interface YoutubeSearch {
  items: {
    id: { videoId: string };
    snippet: { title: string; channelTitle: string };
  }[];
}

export const youtube: Provider = {
  name: "youtube",
  core: false,
  isEnabled: (env) => !!env.YOUTUBE_API_KEY,

  async search(song, ctx) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoCategoryId", "10");
    // Same 100-unit quota cost as 5 results; rankings shift between calls and the
    // official upload sometimes falls below fifth.
    url.searchParams.set("maxResults", "10");
    url.searchParams.set(
      "q",
      `${primaryArtist(song.artist)} - ${cleanTitle(song.title)}`,
    );
    url.searchParams.set("regionCode", ctx.env.COUNTRY);

    // A header, not the `key` query parameter, keeps the key out of URLs.
    const body = (await getJson(url, ctx, "YouTube", {
      "X-Goog-Api-Key": ctx.env.YOUTUBE_API_KEY ?? "",
    })) as YoutubeSearch;
    const candidates = body.items.flatMap((item) => {
      const parsed = parseUpload(
        decodeEntities(item.snippet.title),
        decodeEntities(item.snippet.channelTitle),
      );
      if (!parsed) return [];
      const id = item.id.videoId;
      return [
        {
          ...parsed,
          links: {
            youtube: `https://www.youtube.com/watch?v=${id}`,
            youtubeMusic: `https://music.youtube.com/watch?v=${id}`,
          },
        },
      ];
    });
    return candidates
      .sort((a, b) => Number(b.topic) - Number(a.topic))
      .map(({ title, artist, links }): Candidate => ({ title, artist, links }));
  },
};

// Only official uploads are candidates: fan re-uploads and lyric channels
// often carry the right "Artist - Title" but get taken down or are edits.
function parseUpload(
  videoTitle: string,
  channel: string,
): { title: string; artist: string; topic: boolean } | null {
  if (TOPIC_SUFFIX.test(channel))
    return {
      title: videoTitle,
      artist: channel.replace(TOPIC_SUFFIX, ""),
      topic: true,
    };

  const dash = videoTitle.indexOf(" - ");
  if (dash === -1) return null;
  const artist = videoTitle.slice(0, dash);
  const title = videoTitle.slice(dash + 3);

  const compact = (s: string) => normalize(s).replace(/ /g, "");
  const official =
    /[([]official\b/i.test(title) ||
    compact(channel).startsWith(compact(primaryArtist(artist)));
  if (!official) return null;

  return { title: title.replace(UPLOAD_LABEL, ""), artist, topic: false };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
