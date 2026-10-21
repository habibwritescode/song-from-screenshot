import { describe, expect, it, vi } from "vitest";
import deezerEgo from "../fixtures/upstream/deezer-ego.json";
import itunesEgo from "../fixtures/upstream/itunes-ego.json";
import spotifyEgo from "../fixtures/upstream/spotify-ego.json";
import type { Env } from "../src/env";
import type { MessagesClient } from "../src/extract";
import { createApp } from "../src/index";
import type { ResolveResponse } from "../src/types";
import { executionContext } from "./helpers";

const TOKEN = "test-token";
const ENV = {
  ACCESS_TOKEN: TOKEN,
  ANTHROPIC_API_KEY: "k",
  MODEL: "m",
  COUNTRY: "US",
} as Env;

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const HEIC = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

const EGO_READ = {
  found: true,
  title: "EGO",
  artist: "Naarly",
  player: "spotify",
  confidence: 0.9,
};

function claudeReplying(json: unknown, stop_reason = "end_turn") {
  const create = vi.fn().mockResolvedValue({
    stop_reason,
    content: [{ type: "text", text: JSON.stringify(json) }],
  });
  return {
    client: { messages: { create } } as unknown as MessagesClient,
    create,
  };
}

function claudeReadingInTurn(...reads: (unknown | Error)[]) {
  const create = vi.fn();
  for (const read of reads) {
    if (read instanceof Error) create.mockRejectedValueOnce(read);
    else
      create.mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(read) }],
      });
  }
  return {
    client: { messages: { create } } as unknown as MessagesClient,
    create,
  };
}

function memoryKv(opts: { failing?: boolean } = {}) {
  const store = new Map<string, { value: string; ttl?: number }>();
  const kv = {
    get: vi.fn((key: string) => {
      if (opts.failing) return Promise.reject(new Error("KV down"));
      const entry = store.get(key);
      return Promise.resolve(entry ? JSON.parse(entry.value) : null);
    }),
    put: vi.fn(
      (key: string, value: string, options?: { expirationTtl?: number }) => {
        if (opts.failing) return Promise.reject(new Error("KV down"));
        store.set(key, { value, ttl: options?.expirationTtl });
        return Promise.resolve();
      },
    ),
  };
  const ttls = () =>
    Object.fromEntries(
      [...store].map(([key, { ttl }]) => [key.split(":")[0], ttl]),
    );
  return { kv: kv as unknown as KVNamespace, ttls };
}

function upstream(
  overrides: Record<string, () => Response | Promise<Response>> = {},
) {
  const routes: Record<string, () => Response | Promise<Response>> = {
    "itunes.apple.com": () => Response.json(itunesEgo),
    "api.deezer.com": () => Response.json(deezerEgo),
    "accounts.spotify.com": () =>
      Response.json({ access_token: "t", expires_in: 3600 }),
    "api.spotify.com": () => Response.json(spotifyEgo),
    ...overrides,
  };
  return vi.fn((input: RequestInfo | URL) => {
    const host = new URL(input instanceof Request ? input.url : input).host;
    const route = routes[host];
    return route
      ? Promise.resolve(route())
      : Promise.reject(new Error(`unexpected fetch to ${host}`));
  });
}

function setup(
  opts: {
    claude?: ReturnType<typeof claudeReplying>;
    fetch?: ReturnType<typeof upstream>;
    env?: Partial<Env>;
  } = {},
) {
  const claude = opts.claude ?? claudeReplying(EGO_READ);
  const fetch = opts.fetch ?? upstream();
  const app = createApp({ makeClient: () => claude.client, fetch });

  // Waits for the work the route hands to waitUntil (cache writes), so the
  // next request sees it.
  const resolve = async (
    body: FormData | null,
    {
      headers = { Authorization: `Bearer ${TOKEN}` },
      env = {},
    }: { headers?: Record<string, string>; env?: Partial<Env> } = {},
  ) => {
    const pending: Promise<unknown>[] = [];
    const res = await app.request(
      "/api/resolve",
      { method: "POST", body, headers },
      { ...ENV, ...opts.env, ...env },
      executionContext(pending),
    );
    await Promise.all(pending);
    return res;
  };

  return { claude, fetch, resolve, app };
}

function form(bytes: Uint8Array | null, type = "image/png") {
  const body = new FormData();
  if (bytes) body.append("image", new File([bytes], "shot", { type }));
  return body;
}

describe("POST /api/resolve", () => {
  it("returns verified links, track details and search links for a readable screenshot", async () => {
    const { resolve } = setup();

    const res = await resolve(form(PNG));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual<ResolveResponse>({
      status: "matched",
      partial: false,
      cached: false,
      extracted: {
        title: "EGO",
        artist: "Naarly",
        player: "spotify",
        confidence: 0.9,
      },
      track: {
        title: "EGO",
        artist: "Naarly",
        album: "EGO - Single",
        artworkUrl: expect.stringContaining("600x600"),
      },
      links: {
        appleMusic:
          "https://music.apple.com/us/album/ego/6812371750?i=6812371751",
        deezer: "https://www.deezer.com/track/4287819182",
      },
      songLink: null,
      searchLinks: {
        spotify: "https://open.spotify.com/search/EGO%20naarly",
        youtube: "https://www.youtube.com/results?search_query=EGO%20naarly",
      },
    });
  });

  it("adds the Spotify link when Spotify credentials are configured", async () => {
    const res = await setup().resolve(form(PNG), {
      env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    });

    expect(await res.json()).toMatchObject({
      status: "matched",
      partial: false,
      links: {
        appleMusic: expect.any(String),
        deezer: expect.any(String),
        spotify: "https://open.spotify.com/track/3veGiQJuodUItZWeWyPaXA",
      },
    });
  });

  it.each([
    ["JPEG labelled as PNG", JPEG, "image/png", "image/jpeg"],
    ["WebP with no label", WEBP, "", "image/webp"],
  ])(
    "sends Claude the media type detected from the bytes: %s",
    async (_, bytes, label, expected) => {
      const { resolve, claude } = setup();

      await resolve(form(bytes, label));

      const content = claude.create.mock.calls[0]?.[0].messages[0].content;
      expect(content[0].source.media_type).toBe(expected);
    },
  );

  it("is uncertain with the track but no links when the read was low-confidence", async () => {
    const { resolve } = setup({
      claude: claudeReplying({ ...EGO_READ, confidence: 0.4 }),
    });

    const body = await (await resolve(form(PNG))).json<ResolveResponse>();

    expect(body).toMatchObject({
      status: "uncertain",
      links: {},
      track: { title: "EGO", artist: "Naarly" },
    });
  });

  it("returns not_found without searching when the screenshot has no song", async () => {
    const { resolve, fetch } = setup({
      claude: claudeReplying({
        found: false,
        title: "",
        artist: "",
        player: "unknown",
        confidence: 0,
      }),
    });

    const body = await (await resolve(form(PNG))).json();

    expect(body).toMatchObject({
      status: "not_found",
      extracted: null,
      track: null,
      links: {},
      searchLinks: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still returns the other platform's links when one provider is down", async () => {
    const { resolve } = setup({
      fetch: upstream({
        "api.deezer.com": () => new Response("", { status: 500 }),
      }),
    });

    const body = await (await resolve(form(PNG))).json<ResolveResponse>();

    expect(body).toMatchObject({
      status: "matched",
      partial: true,
      links: { appleMusic: expect.any(String) },
    });
    expect(body.links).not.toHaveProperty("deezer");
  });

  describe("fallback read", () => {
    const MISREAD = { ...EGO_READ, artist: "Naarlly" };
    const env = { FALLBACK_MODEL: "fallback" };
    const modelsCalled = (create: ReturnType<typeof vi.fn>) =>
      create.mock.calls.map(([params]) => (params as { model: string }).model);

    it("re-reads with the fallback model when the first read doesn't match", async () => {
      const claude = claudeReadingInTurn(MISREAD, EGO_READ);
      const { resolve } = setup({ claude, env });

      const body = await (await resolve(form(PNG))).json<ResolveResponse>();

      expect(modelsCalled(claude.create)).toEqual(["m", "fallback"]);
      expect(body).toMatchObject({
        status: "matched",
        extracted: { artist: "Naarly" },
        links: { appleMusic: expect.any(String), deezer: expect.any(String) },
      });
    });

    it("doesn't retry when the first read matches", async () => {
      const claude = claudeReadingInTurn(EGO_READ);
      const { resolve } = setup({ claude, env });

      await resolve(form(PNG));

      expect(modelsCalled(claude.create)).toEqual(["m"]);
    });

    it("doesn't retry when FALLBACK_MODEL is empty", async () => {
      const claude = claudeReadingInTurn(MISREAD);
      const { resolve } = setup({ claude, env: { FALLBACK_MODEL: "" } });

      const body = await (await resolve(form(PNG))).json<ResolveResponse>();

      expect(body.status).toBe("uncertain");
      expect(claude.create).toHaveBeenCalledTimes(1);
    });

    it("returns the first result when the fallback call fails", async () => {
      const claude = claudeReadingInTurn(MISREAD, new Error("overloaded"));
      const { resolve } = setup({ claude, env });

      const res = await resolve(form(PNG));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        status: "uncertain",
        extracted: { artist: "Naarlly" },
        links: {},
      });
    });
  });

  describe("cache", () => {
    const DAY = 86_400;
    const OTHER_PNG = new Uint8Array([...PNG, 1]);

    it("answers a repeated screenshot from the cache without Claude or provider calls", async () => {
      const { kv } = memoryKv();
      const { resolve, claude, fetch } = setup({ env: { CACHE: kv } });

      const first = await (await resolve(form(PNG))).json<ResolveResponse>();
      const calls = fetch.mock.calls.length;
      const second = await (await resolve(form(PNG))).json<ResolveResponse>();

      expect(second).toEqual({ ...first, cached: true });
      expect(claude.create).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls.length).toBe(calls);
    });

    it("reuses links for the same song from a different screenshot, after one Claude read", async () => {
      const { kv } = memoryKv();
      const { resolve, claude, fetch } = setup({ env: { CACHE: kv } });

      await resolve(form(PNG));
      const calls = fetch.mock.calls.length;
      const body = await (
        await resolve(form(OTHER_PNG))
      ).json<ResolveResponse>();

      expect(body).toMatchObject({
        status: "matched",
        cached: true,
        links: { appleMusic: expect.any(String) },
      });
      expect(claude.create).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls.length).toBe(calls);
    });

    it("keeps full matches for 30 days", async () => {
      const { kv, ttls } = memoryKv();

      await setup({ env: { CACHE: kv } }).resolve(form(PNG));

      expect(ttls()).toEqual({ img: 30 * DAY, song: 30 * DAY });
    });

    it.each([
      ["uncertain", { ...EGO_READ, artist: "Naarlly" }, upstream()],
      [
        "partial",
        EGO_READ,
        upstream({ "api.deezer.com": () => new Response("", { status: 500 }) }),
      ],
    ])("keeps %s results for 1 day", async (_, read, fetch) => {
      const { kv, ttls } = memoryKv();

      await setup({
        claude: claudeReplying(read),
        fetch,
        env: { CACHE: kv },
      }).resolve(form(PNG));

      expect(ttls()).toEqual({ img: DAY, song: DAY });
    });

    it("starts a fresh cache when a provider is configured", async () => {
      const { kv } = memoryKv();
      const { resolve, claude } = setup({ env: { CACHE: kv } });

      await resolve(form(PNG));
      const body = await (
        await resolve(form(PNG), {
          env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
        })
      ).json<ResolveResponse>();

      expect(body).toMatchObject({
        cached: false,
        links: { spotify: expect.any(String) },
      });
      expect(claude.create).toHaveBeenCalledTimes(2);
    });

    it("doesn't let a low-confidence read hide links from a confident read of the same song", async () => {
      const { kv } = memoryKv();
      const claude = claudeReadingInTurn(
        { ...EGO_READ, confidence: 0.4 },
        { ...EGO_READ, confidence: 0.95 },
      );
      const { resolve } = setup({ claude, env: { CACHE: kv } });

      await resolve(form(PNG));
      const body = await (
        await resolve(form(OTHER_PNG))
      ).json<ResolveResponse>();

      expect(body).toMatchObject({
        status: "matched",
        cached: true,
        links: { appleMusic: expect.any(String), deezer: expect.any(String) },
      });
    });

    it("still resolves when KV is failing", async () => {
      const { kv } = memoryKv({ failing: true });

      const res = await setup({ env: { CACHE: kv } }).resolve(form(PNG));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        status: "matched",
        cached: false,
      });
    });
  });

  describe("errors", () => {
    it.each([
      ["no Authorization header", {}],
      ["wrong token", { Authorization: "Bearer nope" }],
      ["non-bearer scheme", { Authorization: `Basic ${TOKEN}` }],
    ])("rejects %s with 401 before calling Claude", async (_, headers) => {
      const { resolve, claude } = setup();

      const res = await resolve(form(PNG), { headers });

      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        error: { code: "unauthorized" },
      });
      expect(claude.create).not.toHaveBeenCalled();
    });

    it("rejects every request when ACCESS_TOKEN is not configured", async () => {
      const res = await setup().resolve(form(PNG), {
        headers: { Authorization: "Bearer " },
        env: { ACCESS_TOKEN: "" },
      });

      expect(res.status).toBe(401);
    });

    it("rejects a request without an image with 400", async () => {
      const res = await setup().resolve(form(null));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { code: "missing_image" },
      });
    });

    it("rejects an image over 5 MB with 413", async () => {
      const big = new Uint8Array(5 * 1024 * 1024 + 1);
      big.set(PNG);

      const res = await setup().resolve(form(big));

      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({
        error: { code: "image_too_large" },
      });
    });

    it("rejects a declared oversize upload before reading it", async () => {
      const { resolve, claude } = setup();

      const res = await resolve(form(PNG), {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Length": String(6 * 1024 * 1024),
        },
      });

      expect(res.status).toBe(413);
      expect(claude.create).not.toHaveBeenCalled();
    });

    it.each([
      ["HEIC", HEIC, "image/heic"],
      [
        "non-image bytes labelled as PNG",
        new TextEncoder().encode("hello"),
        "image/png",
      ],
    ])("rejects %s with 415", async (_, bytes, type) => {
      const res = await setup().resolve(form(bytes, type));

      expect(res.status).toBe(415);
      expect(await res.json()).toMatchObject({
        error: { code: "unsupported_type" },
      });
    });

    it("returns 502 when Claude refuses", async () => {
      const res = await setup({
        claude: claudeReplying(EGO_READ, "refusal"),
      }).resolve(form(PNG));

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({
        error: { code: "upstream_error" },
      });
    });

    it("returns 502 when every core provider fails", async () => {
      const down = () => new Response("", { status: 503 });
      const { resolve } = setup({
        fetch: upstream({ "itunes.apple.com": down, "api.deezer.com": down }),
      });

      const res = await resolve(form(PNG));

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({
        error: { code: "upstream_error" },
      });
    });
  });

  describe("CORS", () => {
    const preflight = (origin: string) =>
      setup().app.request(
        "/api/resolve",
        {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
          },
        },
        ENV,
      );

    it("allows the Chrome extension", async () => {
      const res = await preflight("chrome-extension://abcdefghijklmnop");

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "chrome-extension://abcdefghijklmnop",
      );
      expect(
        res.headers.get("Access-Control-Allow-Headers")?.toLowerCase(),
      ).toContain("authorization");
    });

    it("does not allow other websites", async () => {
      const res = await preflight("https://evil.example");

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
