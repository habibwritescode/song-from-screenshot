import { describe, expect, it } from "vitest";
import {
  readShareParams,
  storeShared,
  takeShared,
  type ShareCaches,
} from "../src/lib/share-store";

function fakeCaches(): ShareCaches {
  const stores = new Map<string, Map<string, Response>>();
  return {
    async open(name) {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        put: async (key, response) => void store.set(String(key), response),
        match: async (key) => store.get(String(key)),
        delete: async (key) => store.delete(String(key)),
        keys: async () =>
          [...store.keys()].map(
            (key) => new Request(new URL(key, "https://w.test")),
          ),
      };
    },
  };
}

const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", {
  type: "image/png",
});

describe("shared screenshots", () => {
  it("hands the shared file to the page once", async () => {
    const caches = fakeCaches();
    const key = await storeShared(caches, png);

    const taken = await takeShared(caches, key);
    expect(taken?.type).toBe("image/png");
    expect(new Uint8Array(await (taken as Blob).arrayBuffer())).toEqual(
      new Uint8Array(await png.arrayBuffer()),
    );
    expect(await takeShared(caches, key)).toBeNull();
  });

  it("drops a share the page never picked up when the next one arrives", async () => {
    const caches = fakeCaches();
    const abandoned = await storeShared(caches, png);
    const latest = await storeShared(caches, png);
    expect(await takeShared(caches, abandoned)).toBeNull();
    expect(await takeShared(caches, latest)).not.toBeNull();
  });

  it("uses a fresh unguessable key each time", async () => {
    const caches = fakeCaches();
    const a = await storeShared(caches, png);
    const b = await storeShared(caches, png);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("readShareParams", () => {
  it("reads a share key from the redirect", () => {
    const key = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
    expect(readShareParams(`?shared=${key}`)).toEqual({ kind: "shared", key });
  });

  it("ignores keys that couldn't have come from the service worker", () => {
    expect(readShareParams("?shared=../../api")).toBeNull();
    expect(readShareParams("?shared=")).toBeNull();
  });

  it("notices a share that reached the Worker instead", () => {
    expect(readShareParams("?share=unavailable")).toEqual({
      kind: "unavailable",
    });
  });

  it("returns null for a plain visit", () => {
    expect(readShareParams("")).toBeNull();
  });
});
