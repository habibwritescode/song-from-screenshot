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

  describe("when the image can't be downloaded", () => {
    const capture = {
      rect: { x: 0, y: 0, width: 400, height: 400 },
      viewport: { width: 1000, height: 800 },
    };
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    it("sends a crop of the screen instead, when one is allowed", async () => {
      const fetch = fakeFetch({
        [orig]: new Response("Forbidden", { status: 403 }),
      });
      const captureImage = vi.fn(
        async () => new Blob([png], { type: "image/png" }),
      );
      const { outcome } = await findSong(
        { ...request, capture },
        { fetch, loadSettings: async () => settings, captureImage },
      );

      expect(captureImage).toHaveBeenCalledWith(capture);
      expect(outcome).toEqual({ kind: "result", response: xFeed });
      const [, init] =
        fetch.mock.calls.find(([url]) =>
          String(url).startsWith(settings.workerUrl),
        ) ?? [];
      const sent = (init?.body as FormData).get("image") as Blob;
      expect(new Uint8Array(await sent.arrayBuffer())).toEqual(png);
    });

    it("crops the screen when the image URL answers with a web page", async () => {
      const fetch = fakeFetch({
        [orig]: new Response("<!doctype html><title>Log in</title>"),
      });
      const captureImage = vi.fn(
        async () => new Blob([png], { type: "image/png" }),
      );
      const { outcome } = await findSong(
        { ...request, capture },
        { fetch, loadSettings: async () => settings, captureImage },
      );
      expect(captureImage).toHaveBeenCalledWith(capture);
      expect(outcome).toEqual({ kind: "result", response: xFeed });
    });

    it("reports it unreadable when the crop fails too", async () => {
      const fetch = fakeFetch({ [orig]: new TypeError("Failed to fetch") });
      const { outcome } = await findSong(
        { ...request, capture },
        {
          fetch,
          loadSettings: async () => settings,
          captureImage: async () => null,
        },
      );
      expect(outcome).toEqual({ kind: "error", code: "image_unreadable" });
    });

    it("doesn't capture the screen when the download works", async () => {
      const fetch = fakeFetch({
        [orig]: new Response(jpeg),
        [xFeed.track.artworkUrl]: new Response(jpeg),
      });
      const captureImage = vi.fn(async () => null);
      await findSong(
        { ...request, capture },
        { fetch, loadSettings: async () => settings, captureImage },
      );
      expect(captureImage).not.toHaveBeenCalled();
    });
  });

  describe("images the Worker can't take", () => {
    const MB = 1024 * 1024;
    const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const png = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(pngHeader);
      return bytes;
    };
    const gif = new TextEncoder().encode("GIF89a\x01\x00");
    const avif = new Uint8Array([
      0,
      0,
      0,
      0x1c,
      ...new TextEncoder().encode("ftypavif"),
      0,
      0,
    ]);
    const converted = new Blob([jpeg], { type: "image/jpeg" });

    async function run(
      image: Response,
      convertImage = vi.fn<(image: Blob) => Promise<Blob | null>>(
        async () => converted,
      ),
    ) {
      const fetch = fakeFetch({
        [orig]: image,
        [xFeed.track.artworkUrl]: new Response(jpeg),
      });
      const result = await findSong(request, {
        fetch,
        loadSettings: async () => settings,
        convertImage,
      });
      const [, init] =
        fetch.mock.calls.find(([url]) =>
          String(url).startsWith(settings.workerUrl),
        ) ?? [];
      const sent = init ? ((init.body as FormData).get("image") as Blob) : null;
      return { ...result, sent, convertImage };
    }

    it("sends a small PNG byte for byte", async () => {
      const { sent, convertImage } = await run(new Response(png(1000)));
      expect(convertImage).not.toHaveBeenCalled();
      expect(new Uint8Array(await (sent as Blob).arrayBuffer())).toEqual(
        png(1000),
      );
    });

    it.each([
      ["AVIF", avif],
      ["GIF", gif],
      ["a PNG over 5 MB", png(6 * MB)],
    ])("converts %s to JPEG first", async (_, bytes) => {
      const { sent, convertImage } = await run(new Response(bytes));
      expect(convertImage).toHaveBeenCalled();
      expect(sent?.type).toBe("image/jpeg");
      expect(new Uint8Array(await (sent as Blob).arrayBuffer())).toEqual(jpeg);
    });

    it("reports the image unreadable when conversion fails", async () => {
      const { outcome, sent } = await run(
        new Response(avif),
        vi.fn(async () => null),
      );
      expect(outcome).toEqual({ kind: "error", code: "image_unreadable" });
      expect(sent).toBeNull();
    });

    it("refuses a download over 25 MB without reading it", async () => {
      const huge = new Response(png(1000), {
        headers: { "Content-Length": String(30 * MB) },
      });
      const { outcome, sent } = await run(huge);
      expect(outcome).toEqual({ kind: "error", code: "image_unreadable" });
      expect(sent).toBeNull();
    });

    it("refuses an image over 25 MB that didn't say its size", async () => {
      const { outcome } = await run(new Response(png(26 * MB)));
      expect(outcome).toEqual({ kind: "error", code: "image_unreadable" });
    });
  });
});
