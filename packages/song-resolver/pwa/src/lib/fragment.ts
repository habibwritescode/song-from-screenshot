import { isErrorCode, type OutcomeError } from "../../../client/api";
import type { ResolveResponse } from "../../../src/types";

/** Something handed to the page in the URL fragment, which browsers never send to servers. */
export type Handoff =
  | { kind: "token"; token: string }
  /** From the iPhone Shortcut, which calls the Worker itself. */
  | { kind: "result"; response: ResolveResponse }
  | { kind: "error"; code: OutcomeError };

// Base64 (standard or URL-safe), hex, or similar; never whitespace.
const TOKEN = /^[\w+/=.~-]{1,512}$/;
const STATUSES = new Set(["matched", "uncertain", "not_found"]);

function decode(value: string): string {
  try {
    // Not URLSearchParams: it reads "+" as a space, and tokens contain "+".
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function params(hash: string): Map<string, string> {
  const body = hash.replace(/^#/, "");
  // A result is the rest of the fragment: as plain JSON its links can hold
  // "=" and "&", which would otherwise split it.
  if (body.startsWith("result=")) {
    return new Map([["result", decode(body.slice("result=".length))]]);
  }
  const entries = body.split("&").flatMap((pair): [string, string][] => {
    const at = pair.indexOf("=");
    // A key with no "=" still counts, as an empty value: "#result" is a
    // hand-off that arrived cut short, not a plain visit.
    if (at < 0) return pair ? [[pair, ""]] : [];
    return at > 0 ? [[pair.slice(0, at), decode(pair.slice(at + 1))]] : [];
  });
  return new Map(entries);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown) =>
  value === null || typeof value === "string";
const isSong = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  typeof value.title === "string" &&
  typeof value.artist === "string";

/**
 * A response the page can render safely. Anyone can write a link with
 * #result=, so every field the page reads is checked, not just the status.
 */
function toResponse(value: unknown): ResolveResponse | null {
  if (!isRecord(value)) return null;
  const { status, track, extracted, links, songLink, searchLinks } = value;
  const ok =
    typeof status === "string" &&
    STATUSES.has(status) &&
    (track === null ||
      (isSong(track) &&
        stringOrNull(track.album) &&
        stringOrNull(track.artworkUrl))) &&
    (extracted === null || isSong(extracted)) &&
    isRecord(links) &&
    Object.values(links).every((link) => typeof link === "string") &&
    stringOrNull(songLink ?? null) &&
    (searchLinks === null ||
      (isRecord(searchLinks) &&
        typeof searchLinks.spotify === "string" &&
        typeof searchLinks.youtube === "string"));
  return ok ? (value as unknown as ResolveResponse) : null;
}

/**
 * The answer as JSON text. The Shortcut sends Base64: Shortcuts turns the
 * address into a link with iOS link detection, which stops at "(" and other
 * characters URL Encode leaves alone, cutting a URL-encoded answer short.
 * Plain JSON is still read, as tests and other clients may send it.
 */
function answerText(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("{")) return value;
  const base64 = value
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readResult(raw: string): Handoff {
  try {
    const value: unknown = JSON.parse(answerText(raw));
    // The Shortcut passes on whatever the Worker answered, errors included.
    if (isRecord(value) && isRecord(value.error)) {
      const { code } = value.error;
      return { kind: "error", code: isErrorCode(code) ? code : "bad_response" };
    }
    const response = toResponse(value);
    if (response) return { kind: "result", response };
  } catch {
    // Not JSON: same as any other unreadable answer.
  }
  return { kind: "error", code: "bad_response" };
}

export function readFragment(hash: string): Handoff | null {
  const values = params(hash);
  const result = values.get("result");
  if (result !== undefined) return readResult(result);
  const error = values.get("error");
  if (error !== undefined) {
    return { kind: "error", code: isErrorCode(error) ? error : "bad_response" };
  }
  const token = values.get("token");
  return token && TOKEN.test(token) ? { kind: "token", token } : null;
}
