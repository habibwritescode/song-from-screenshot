import type { ResolveResponse } from "../src/types";

export const HISTORY_LIMIT = 10;
const KEY = "history";

/** Only the Worker's response and when it came: never the image or the page it was on. */
export interface HistoryEntry {
  response: ResolveResponse;
  savedAt: number;
}

export interface HistoryStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function songKey({ track, extracted }: ResolveResponse): string | null {
  const song = track ?? extracted;
  return song ? `${song.title}|${song.artist}`.toLowerCase() : null;
}

/** Puts a result first, replacing an older entry for the same song. */
export function addEntry(
  history: HistoryEntry[],
  response: ResolveResponse,
  savedAt: number,
): HistoryEntry[] {
  const key = songKey(response);
  if (response.status === "not_found" || !key) return history;
  return [
    { response, savedAt },
    ...history.filter((entry) => songKey(entry.response) !== key),
  ].slice(0, HISTORY_LIMIT);
}

function isEntry(value: unknown): value is HistoryEntry {
  const entry = value as Partial<HistoryEntry> | null;
  return (
    typeof entry?.savedAt === "number" &&
    typeof entry.response?.status === "string" &&
    typeof entry.response.links === "object" &&
    entry.response.links !== null
  );
}

export function createHistory(storage: HistoryStorage, now = Date.now) {
  const load = async (): Promise<HistoryEntry[]> => {
    const stored = (await storage.get([KEY]))[KEY];
    return Array.isArray(stored) ? stored.filter(isEntry) : [];
  };

  // Each change reads the list and writes it back, so two lookups finishing
  // together would otherwise drop one of the results.
  let queue: Promise<unknown> = Promise.resolve();
  const change = (update: (history: HistoryEntry[]) => HistoryEntry[]) => {
    const write = queue.then(async () =>
      storage.set({ [KEY]: update(await load()) }),
    );
    queue = write.catch(() => undefined);
    return write;
  };

  return {
    load,
    add: (response: ResolveResponse) =>
      change((history) => addEntry(history, response, now())),
    clear: () => change(() => []),
  };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(savedAt: number, now: number): string {
  const elapsed = now - savedAt;
  // A clock set back makes elapsed negative, which falls through to "just now".
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return relative.format(-Math.floor(elapsed / ms), unit);
  }
  return "just now";
}
