import { describe, expect, it, vi } from "vitest";
import type { Fetch } from "../src/lib/api";
import { findSong, type FindRequest } from "../src/lib/pipeline";
import { DEFAULT_SETTINGS, type Settings } from "../src/lib/settings";
import { xFeed } from "./fixtures/responses";

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  workerUrl: "https://x.workers.dev",
  token: "secret",
};
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const request: FindRequest = {
  type: "find",
  src: "https://pbs.twimg.com/media/GZx1abc?format=jpg&name=small",
  srcset: "",
};

/** Answers image requests from `images` and Worker requests with `worker`. */
function fakeFetch(
  images: Record<string, Response | Error>,
  worker: () => Response = () => Response.json(xFeed),
) {
  return vi.fn<Fetch>(async (input) => {
    const url = String(input);
    if (url.startsWith(settings.workerUrl)) return worker();
    const image = images[url];
    if (!image) throw new TypeError(`no fake for ${url}`);
    if (image instanceof Error) throw image;
    return image;
  });
}

const orig = "https://pbs.twimg.com/media/GZx1abc?format=jpg&name=orig";

describe("findSong", () => {
  it("sends the original-size image to the Worker and returns its answer", async () => {
    const fetch = fakeFetch({
      [orig]: new Response(jpeg),
      [xFeed.track.artworkUrl]: new Response(jpeg),
    });
    const { outcome, artwork } = await findSong(request, {
      fetch,
      loadSettings: async () => settings,
    });

    expect(outcome).toEqual({ kind: "result", response: xFeed });
    expect(artwork).toBe(
      `data:image/jpeg;base64,${btoa(String.fromCharCode(...jpeg))}`,
    );
    const [, init] =
      fetch.mock.calls.find(([url]) =>
        String(url).startsWith(settings.workerUrl),
      ) ?? [];
    const sent = (init?.body as FormData).get("image") as Blob;
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(jpeg);
    expect(sent.type).toBe("image/jpeg");
  });

  it("reports an image it can't download without calling the Worker", async () => {
    for (const reply of [
      new Response("Forbidden", { status: 403 }),
      new TypeError("Failed to fetch"),
    ]) {
      const fetch = fakeFetch({ [orig]: reply });
      const { outcome } = await findSong(request, {
        fetch,
        loadSettings: async () => settings,
      });
      expect(outcome).toEqual({ kind: "error", code: "image_unreadable" });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("makes no request at all until the extension is configured", async () => {
    const fetch = fakeFetch({});
    const { outcome } = await findSong(request, {
      fetch,
      loadSettings: async () => DEFAULT_SETTINGS,
    });
    expect(outcome).toEqual({ kind: "error", code: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still returns the song when the artwork can't be fetched", async () => {
    const fetch = fakeFetch({
      [orig]: new Response(jpeg),
      [xFeed.track.artworkUrl]: new Response("nope", { status: 404 }),
    });
    const { outcome, artwork } = await findSong(request, {
      fetch,
      loadSettings: async () => settings,
    });
    expect(outcome).toEqual({ kind: "result", response: xFeed });
    expect(artwork).toBeNull();
  });
});
