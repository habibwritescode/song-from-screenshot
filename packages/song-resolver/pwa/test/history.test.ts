import { describe, expect, it, vi } from "vitest";
import { createHistory } from "../../client/history";
import * as responses from "../../client/test/fixtures/responses";
import { historyStorage } from "../src/lib/history-storage";
import type { KeyValueStorage } from "../src/lib/settings";
import { renderHistory } from "../src/ui/history";

function memory(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("history on this device", () => {
  it("keeps songs across loads, newest first, and clears them", async () => {
    const storage = memory();
    await createHistory(historyStorage(storage), () => 1).add(responses.fein);
    await createHistory(historyStorage(storage), () => 2).add(responses.xFeed);

    const history = createHistory(historyStorage(storage));
    expect((await history.load()).map((e) => e.response.track?.title)).toEqual([
      responses.xFeed.track.title,
      responses.fein.track.title,
    ]);
    await history.clear();
    expect(await history.load()).toEqual([]);
  });

  it("starts empty when stored data is damaged", async () => {
    const storage = memory();
    storage.setItem("history", "{not json");
    expect(await createHistory(historyStorage(storage)).load()).toEqual([]);
  });
});

describe("history list", () => {
  it("lists songs with how long ago, and reopens one when tapped", () => {
    const onOpen = vi.fn();
    const entries = [
      { response: responses.fein, savedAt: 1_000_000 - 3 * 60_000 },
      { response: responses.xFeed, savedAt: 1_000_000 - 2 * 3_600_000 },
    ];
    const list = renderHistory(entries, 1_000_000, onOpen) as HTMLElement;
    const rows = [...list.querySelectorAll<HTMLButtonElement>("button")];
    expect(rows.map((row) => row.querySelector(".title")?.textContent)).toEqual(
      [responses.fein.track.title, responses.xFeed.track.title],
    );
    expect(rows[0]?.textContent).toContain("3 minutes ago");

    rows[1]?.click();
    expect(onOpen).toHaveBeenCalledWith(entries[1]);
  });

  it("renders nothing when there's no history", () => {
    expect(renderHistory([], 0, vi.fn())).toBeNull();
  });
});
