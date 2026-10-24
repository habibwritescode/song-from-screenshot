import { describe, expect, it } from "vitest";
import type { ResolveResponse } from "../../src/types";
import {
  addEntry,
  createHistory,
  HISTORY_LIMIT,
  timeAgo,
  type HistoryStorage,
} from "../history";
import * as responses from "./fixtures/responses";

const song = (title: string, artist = "Artist"): ResolveResponse => ({
  ...responses.fein,
  track: { title, artist, album: null, artworkUrl: null },
});
const titles = (history: { response: ResolveResponse }[]) =>
  history.map((entry) => entry.response.track?.title);

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  const storage: HistoryStorage = {
    get: async (keys) =>
      Object.fromEntries(
        keys.filter((k) => k in data).map((k) => [k, data[k]]),
      ),
    set: async (items) => {
      // Let concurrent writers interleave, as real storage can.
      await new Promise((resolve) => setTimeout(resolve, 0));
      Object.assign(data, items);
    },
  };
  return { storage, data };
}

describe("addEntry", () => {
  it("puts the newest result first", () => {
    const history = addEntry(addEntry([], song("A"), 1), song("B"), 2);
    expect(titles(history)).toEqual(["B", "A"]);
    expect(history[0]?.savedAt).toBe(2);
  });

  it("moves a song found again to the front instead of listing it twice", () => {
    let history = [song("A"), song("B"), song("C")].reduce(
      (list, response, i) => addEntry(list, response, i),
      addEntry([], song("X"), 0),
    );
    history = addEntry(history, song("a"), 9);
    expect(titles(history)).toEqual(["a", "C", "B", "X"]);
  });

  it("treats the same title by another artist as another song", () => {
    const history = addEntry(
      addEntry([], song("A", "One"), 1),
      song("A", "Two"),
      2,
    );
    expect(history).toHaveLength(2);
  });

  it(`keeps only the last ${HISTORY_LIMIT}`, () => {
    let history = addEntry([], song("first"), 0);
    for (let i = 1; i <= HISTORY_LIMIT; i++) {
      history = addEntry(history, song(`song ${i}`), i);
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(titles(history)).not.toContain("first");
  });

  it("keeps uncertain results, so the search links are there later", () => {
    expect(addEntry([], responses.uncertainMisread, 1)).toHaveLength(1);
  });

  it("skips not_found, which has nothing to get back to", () => {
    // The read named a song, but no platform had it.
    const notFound = { ...song("A"), status: "not_found" as const, links: {} };
    expect(addEntry([], notFound, 1)).toEqual([]);
    expect(addEntry([], responses.noPlayer, 1)).toEqual([]);
  });
});

describe("createHistory", () => {
  it("saves results and clears them", async () => {
    const { storage } = memoryStorage();
    const history = createHistory(storage, () => 5);
    await history.add(responses.fein);
    expect(await history.load()).toEqual([
      { response: responses.fein, savedAt: 5 },
    ]);
    await history.clear();
    expect(await history.load()).toEqual([]);
  });

  it("keeps both results when two lookups finish at the same time", async () => {
    const { storage } = memoryStorage();
    const history = createHistory(storage);
    await Promise.all([history.add(song("A")), history.add(song("B"))]);
    expect(titles(await history.load())).toEqual(["B", "A"]);
  });

  it("keeps working after a failed write", async () => {
    const { storage } = memoryStorage();
    const history = createHistory({
      ...storage,
      set: async (items) => {
        if (JSON.stringify(items).includes("broken")) throw new Error("quota");
        await storage.set(items);
      },
    });
    await expect(history.add(song("broken"))).rejects.toThrow("quota");
    await history.add(song("A"));
    expect(titles(await history.load())).toEqual(["A"]);
  });

  it("ignores stored data that isn't a history list", async () => {
    const valid = { response: responses.fein, savedAt: 1 };
    const { storage } = memoryStorage({
      history: [
        valid,
        { savedAt: "x" },
        null,
        { response: {} },
        { response: { ...responses.fein, links: null }, savedAt: 2 },
      ],
    });
    expect(await createHistory(storage).load()).toEqual([valid]);
    expect(
      await createHistory(memoryStorage({ history: "junk" }).storage).load(),
    ).toEqual([]);
  });
});

describe("timeAgo", () => {
  const now = Date.UTC(2026, 9, 22, 12);
  it.each([
    [10_000, "just now"],
    [5 * 60_000, "5 minutes ago"],
    [3 * 3_600_000, "3 hours ago"],
    [26 * 3_600_000, "yesterday"],
    [4 * 86_400_000, "4 days ago"],
  ])("%i ms ago reads %s", (elapsed, text) => {
    expect(timeAgo(now - elapsed, now)).toBe(text);
  });

  it("doesn't say 'in 2 minutes' when the clock went back", () => {
    expect(timeAgo(now + 120_000, now)).toBe("just now");
  });
});
