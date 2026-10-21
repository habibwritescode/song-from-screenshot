import { imageKey, songKey, type Cache } from "./cache";
import type { Env } from "./env";
import {
  extractSong,
  type ImageMediaType,
  type MessagesClient,
} from "./extract";
import { lookup, type LookupResult } from "./lookup";
import { searchQuery } from "./match";
import type { Provider } from "./providers/provider";
import type { Extraction, ResolveResponse } from "./types";

const MIN_CONFIDENCE = 0.6;

const NOTHING_FOUND: ResolveResponse = {
  status: "not_found",
  partial: false,
  cached: false,
  extracted: null,
  track: null,
  links: {},
  songLink: null,
  searchLinks: null,
};

export interface ResolveDeps {
  env: Env;
  client: MessagesClient;
  fetch: typeof fetch;
  cache: Cache;
  providers: Provider[];
  timeoutMs: number;
  /** Runs a cache write after the response is sent (the Worker's `waitUntil`). */
  defer(work: Promise<void>): void;
}

type Song = Extract<Extraction, { found: true }>;

interface Attempt {
  song: Song;
  result: LookupResult;
  cached: boolean;
}

export async function resolveScreenshot(
  bytes: Uint8Array,
  mediaType: ImageMediaType,
  deps: ResolveDeps,
): Promise<ResolveResponse> {
  const scope = deps.providers
    .filter((p) => p.isEnabled(deps.env))
    .map((p) => p.name)
    .join(",");
  const imgKey = await imageKey(scope, bytes);
  const hit = await deps.cache.get<ResolveResponse>(imgKey);
  if (hit) return { ...hit, cached: true };

  const attempt = async (model: string): Promise<Attempt | null> => {
    const song = await extractSong(bytes, mediaType, {
      client: deps.client,
      model,
    });
    if (!song.found) return null;

    const key = songKey(scope, song);
    const cachedResult = await deps.cache.get<LookupResult>(key);
    if (cachedResult) return { song, result: cachedResult, cached: true };

    const result = await lookup(song, deps.providers, {
      env: deps.env,
      fetch: deps.fetch,
      timeoutMs: deps.timeoutMs,
    });
    deps.defer(deps.cache.put(key, result));
    return { song, result, cached: false };
  };

  let resolved = await attempt(deps.env.MODEL);
  const fallback = deps.env.FALLBACK_MODEL;
  if (resolved && confidentResult(resolved).status !== "matched" && fallback) {
    try {
      resolved = (await attempt(fallback)) ?? resolved;
    } catch (err) {
      console.error(
        "fallback read failed:",
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
  }

  const response = resolved ? toResponse(resolved) : NOTHING_FOUND;
  deps.defer(deps.cache.put(imgKey, response));
  return response;
}

// The song cache holds what the platforms said, which doesn't depend on how
// sure one read was; the confidence rule is applied per request on top.
function confidentResult({ song, result }: Attempt): LookupResult {
  if (result.status !== "matched" || song.confidence >= MIN_CONFIDENCE)
    return result;
  return { ...result, status: "uncertain", links: {} };
}

function toResponse(attempt: Attempt): ResolveResponse {
  const { song, cached } = attempt;
  const query = encodeURIComponent(searchQuery(song));
  return {
    ...confidentResult(attempt),
    cached,
    extracted: {
      title: song.title,
      artist: song.artist,
      player: song.player,
      confidence: song.confidence,
    },
    songLink: null,
    searchLinks: {
      spotify: `https://open.spotify.com/search/${query}`,
      youtube: `https://www.youtube.com/results?search_query=${query}`,
    },
  };
}
