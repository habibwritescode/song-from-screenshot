import { normalize, primaryArtist } from "./match";
import type { SongText, Status } from "./types";

const DAY_SECONDS = 86_400;

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: { status: Status; partial: boolean }): Promise<void>;
}

// A broken cache must never fail a lookup, so KV errors are logged and treated as misses.
export function createCache(kv: KVNamespace | undefined): Cache {
  return {
    async get<T>(key: string) {
      if (!kv) return null;
      try {
        return await kv.get<T>(key, "json");
      } catch (err) {
        logKvError("get", err);
        return null;
      }
    },
    async put(key, value) {
      if (!kv) return;
      try {
        await kv.put(key, JSON.stringify(value), {
          expirationTtl: ttlSeconds(value),
        });
      } catch (err) {
        logKvError("put", err);
      }
    },
  };
}

// Anything short of a full match is kept briefly, so a misread or a provider
// outage doesn't pin missing links for a month.
function ttlSeconds(value: { status: Status; partial: boolean }): number {
  return value.status === "matched" && !value.partial
    ? 30 * DAY_SECONDS
    : DAY_SECONDS;
}

/**
 * `scope` names the enabled providers, so adding or removing a key (say,
 * YouTube) starts a fresh cache instead of serving results without its links.
 */
export async function imageKey(
  scope: string,
  bytes: Uint8Array,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `img:${scope}:${hex}`;
}

export function songKey(scope: string, song: SongText): string {
  return `song:${scope}:${normalize(song.title)}|${primaryArtist(song.artist)}`;
}

function logKvError(op: string, err: unknown) {
  console.error(
    `cache ${op} failed:`,
    err instanceof Error ? err.message : String(err),
  );
}
