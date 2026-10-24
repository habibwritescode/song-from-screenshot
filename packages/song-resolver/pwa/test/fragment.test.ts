import { describe, expect, it } from "vitest";
import * as responses from "../../client/test/fixtures/responses";
import { readFragment } from "../src/lib/fragment";

describe("readFragment", () => {
  it("reads a token from the setup link", () => {
    expect(readFragment("#token=s3cr3t-Token_value")).toEqual({
      kind: "token",
      token: "s3cr3t-Token_value",
    });
  });

  it("decodes tokens that base64 made URL-unsafe", () => {
    expect(readFragment("#token=ab%2Bc%2Fd%3D%3D")).toEqual({
      kind: "token",
      token: "ab+c/d==",
    });
  });

  it("ignores a token that couldn't be one", () => {
    expect(readFragment("#token=")).toBeNull();
    expect(readFragment("#token=has%20space")).toBeNull();
    expect(readFragment(`#token=${"x".repeat(600)}`)).toBeNull();
  });

  it("returns null when there's nothing to hand over", () => {
    expect(readFragment("")).toBeNull();
    expect(readFragment("#settings")).toBeNull();
  });
});

describe("readFragment: hand-offs from the iPhone Shortcut", () => {
  const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));

  it("reads a Worker response", () => {
    expect(readFragment(`#result=${encode(responses.fein)}`)).toEqual({
      kind: "result",
      response: responses.fein,
    });
    expect(
      readFragment(`#result=${encode(responses.uncertainMisread)}`),
    ).toEqual({ kind: "result", response: responses.uncertainMisread });
  });

  it.each([
    { why: "not JSON", value: "%7Bnope" },
    {
      why: "an unknown status",
      value: encode({ ...responses.fein, status: "great" }),
    },
    {
      why: "links that aren't strings",
      value: encode({ ...responses.fein, links: { spotify: 1 } }),
    },
    {
      why: "a track without a title",
      value: encode({ ...responses.fein, track: { artist: "x" } }),
    },
    {
      why: "search links of the wrong shape",
      value: encode({ ...responses.noPlayer, searchLinks: "x" }),
    },
    { why: "an array", value: encode([responses.fein]) },
  ])("rejects a result that's $why", ({ value }) => {
    expect(readFragment(`#result=${value}`)).toEqual({
      kind: "error",
      code: "bad_response",
    });
  });

  it("reads a result encoded the way Shortcuts does, with = and & left in", () => {
    const response = {
      ...responses.xFeed,
      links: {
        ...responses.xFeed.links,
        youtube: "https://www.youtube.com/watch?v=MXNiK_WAeJk&list=RD1",
      },
    };
    // encodeURI, like Shortcuts' URL Encode, keeps = & ? / : as they are.
    const hash = `#result=${encodeURI(JSON.stringify(response))}`;
    expect(hash).toContain("&list=");
    expect(readFragment(hash)).toEqual({ kind: "result", response });
  });

  it("reads a result the Shortcut Base64-encoded, whatever the title holds", () => {
    // iOS link detection stops at "(" in a URL-encoded answer; Base64 has no brackets.
    const response = {
      ...responses.uncertainMisread,
      track: {
        ...responses.uncertainMisread.track,
        title: "SLICK Remix (feat. Don Toliver & Summer Walker) — Café's #1!",
      },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(response));
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(readFragment(`#result=${base64}`)).toEqual({
      kind: "result",
      response,
    });
    // Line breaks some Base64 encoders add, and URL-safe characters.
    const wrapped = base64.replace(/(.{76})/g, "$1%0A");
    expect(readFragment(`#result=${wrapped}`)?.kind).toBe("result");
    const urlSafe = base64
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(readFragment(`#result=${urlSafe}`)?.kind).toBe("result");
  });

  it("reads the Worker's error answer passed through #result=", () => {
    // The Shortcut hands over whatever the Worker answered, errors included.
    const answer = { error: { code: "unauthorized", message: "…" } };
    expect(readFragment(`#result=${encode(answer)}`)).toEqual({
      kind: "error",
      code: "unauthorized",
    });
    expect(
      readFragment(`#result=${encode({ error: { code: "nope" } })}`),
    ).toEqual({ kind: "error", code: "bad_response" });
  });

  it("treats a hand-off that arrived empty as unexpected, not as nothing", () => {
    // What Safari got when iOS cut the Shortcut's address short.
    for (const hash of ["#result", "#result=", "#error"]) {
      expect(readFragment(hash)).toEqual({
        kind: "error",
        code: "bad_response",
      });
    }
  });

  it("reads the Worker's error codes, and treats others as unexpected", () => {
    expect(readFragment("#error=unauthorized")).toEqual({
      kind: "error",
      code: "unauthorized",
    });
    expect(readFragment("#error=<script>")).toEqual({
      kind: "error",
      code: "bad_response",
    });
  });
});
