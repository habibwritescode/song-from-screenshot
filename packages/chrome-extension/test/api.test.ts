import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve, testConnection, type Fetch } from "../src/lib/api";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import * as responses from "./fixtures/responses";

const settings = {
  ...DEFAULT_SETTINGS,
  workerUrl: "https://x.workers.dev",
  token: "secret",
};
const image = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
  type: "image/png",
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const workerError = (status: number, code: string) =>
  json({ error: { code, message: "…" } }, status);

function fetchReturning(...replies: (Response | Error)[]) {
  return vi.fn<Fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected fetch");
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

afterEach(() => void vi.useRealTimers());

describe("resolve", () => {
  it("sends the image as multipart with the bearer token", async () => {
    const fetch = fetchReturning(json(responses.xFeed));
    await resolve(image, settings, fetch);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://x.workers.dev/api/resolve");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
    expect((init?.body as FormData).get("image")).toBeInstanceOf(Blob);
  });

  it.each(Object.entries(responses))(
    "returns the Worker's response (%s)",
    async (_, response) => {
      const outcome = await resolve(
        image,
        settings,
        fetchReturning(json(response)),
      );
      expect(outcome).toEqual({ kind: "result", response });
    },
  );

  it.each([
    [401, "unauthorized"],
    [413, "image_too_large"],
    [415, "unsupported_type"],
    [500, "internal_error"],
    [502, "upstream_error"],
  ])("maps a %i error to %s", async (status, code) => {
    const outcome = await resolve(
      image,
      settings,
      fetchReturning(workerError(status, code)),
    );
    expect(outcome).toEqual({ kind: "error", code });
  });

  it("treats a 5xx without the Worker's error body as upstream_error", async () => {
    const page = new Response("<html>Worker threw exception</html>", {
      status: 500,
    });
    expect(await resolve(image, settings, fetchReturning(page))).toEqual({
      kind: "error",
      code: "upstream_error",
    });
  });

  it("reports a reply that isn't from song-resolver as bad_response", async () => {
    const notFound = new Response("Not found", { status: 404 });
    const htmlOk = new Response("<html></html>", { status: 200 });
    const wrongJson = json({ hello: "world" });

    for (const reply of [notFound, htmlOk, wrongJson]) {
      expect(await resolve(image, settings, fetchReturning(reply))).toEqual({
        kind: "error",
        code: "bad_response",
      });
    }
  });

  it("reports a failed request as network", async () => {
    const outcome = await resolve(
      image,
      settings,
      fetchReturning(new TypeError("Failed to fetch")),
    );
    expect(outcome).toEqual({ kind: "error", code: "network" });
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const hang = vi.fn<Fetch>(
      (_, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const pending = resolve(image, settings, hang, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ kind: "error", code: "timeout" });
  });

  it("makes no request until a Worker URL and token are set", async () => {
    const fetch = fetchReturning();
    const outcome = await resolve(image, { ...settings, token: "" }, fetch);
    expect(outcome).toEqual({ kind: "error", code: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("testConnection", () => {
  const health = () => json({ ok: true, version: "0.1.0" });

  it("accepts the token when the Worker asks for an image instead", async () => {
    const fetch = fetchReturning(health(), workerError(400, "missing_image"));
    expect(await testConnection(settings, fetch)).toEqual({
      kind: "ok",
      version: "0.1.0",
    });

    const [url, init] = fetch.mock.calls[1] ?? [];
    expect(url).toBe("https://x.workers.dev/api/resolve");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
    expect((init?.body as FormData).has("image")).toBe(false);
  });

  it("reports a rejected token", async () => {
    const fetch = fetchReturning(health(), workerError(401, "unauthorized"));
    expect(await testConnection(settings, fetch)).toEqual({
      kind: "bad_token",
      version: "0.1.0",
    });
  });

  it("reports an unreachable Worker without trying the token", async () => {
    const fetch = fetchReturning(new TypeError("Failed to fetch"));
    expect(await testConnection(settings, fetch)).toEqual({
      kind: "unreachable",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a site that isn't song-resolver", async () => {
    for (const reply of [
      new Response("<html>Example Domain</html>"),
      new Response("Not found", { status: 404 }),
      json({ ok: false }),
    ]) {
      expect(await testConnection(settings, fetchReturning(reply))).toEqual({
        kind: "not_song_resolver",
      });
    }
  });

  it("reports a health endpoint that answers but no resolve route", async () => {
    const fetch = fetchReturning(
      health(),
      new Response("Not found", { status: 404 }),
    );
    expect(await testConnection(settings, fetch)).toEqual({
      kind: "not_song_resolver",
    });
  });
});
