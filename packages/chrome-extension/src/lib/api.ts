import type {
  ErrorCode,
  ErrorResponse,
  ResolveResponse,
} from "song-resolver/src/types";
import { isConfigured, type Settings } from "./settings";

export type Fetch = typeof fetch;

export type OutcomeError =
  | ErrorCode
  | "bad_response"
  | "image_unreadable"
  | "network"
  | "timeout"
  | "not_configured";

export type Outcome =
  | { kind: "result"; response: ResolveResponse }
  | { kind: "error"; code: OutcomeError };

export type ConnectionResult =
  | { kind: "ok"; version: string }
  | { kind: "bad_token"; version: string }
  | { kind: "unreachable" }
  | { kind: "not_song_resolver" };

// An uncached miss with the Sonnet retry takes about 8 s.
export const RESOLVE_TIMEOUT_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 10_000;

// A Record, so adding a code to the Worker's ErrorCode fails the typecheck here.
const KNOWN_ERROR_CODES: Record<ErrorCode, true> = {
  missing_image: true,
  unauthorized: true,
  image_too_large: true,
  unsupported_type: true,
  upstream_error: true,
  internal_error: true,
};
const STATUSES = new Set<string>(["matched", "uncertain", "not_found"]);

type Reply =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "network" }
  | { kind: "timeout" };

async function request(
  fetchFn: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Reply> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON: an HTML error page or some other site. Callers decide.
    }
    return { kind: "response", status: response.status, body };
  } catch {
    return { kind: timedOut ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

function errorCode(body: unknown): ErrorCode | null {
  const code = (body as Partial<ErrorResponse> | null)?.error?.code;
  return typeof code === "string" && Object.hasOwn(KNOWN_ERROR_CODES, code)
    ? (code as ErrorCode)
    : null;
}

function isResolveResponse(body: unknown): body is ResolveResponse {
  const status = (body as { status?: unknown } | null)?.status;
  return typeof status === "string" && STATUSES.has(status);
}

function post(token: string, form: FormData): RequestInit {
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  };
}

export async function resolve(
  image: Blob,
  settings: Settings,
  fetchFn: Fetch,
  timeoutMs = RESOLVE_TIMEOUT_MS,
): Promise<Outcome> {
  if (!isConfigured(settings)) return { kind: "error", code: "not_configured" };

  const form = new FormData();
  form.append("image", image, "screenshot");
  const reply = await request(
    fetchFn,
    `${settings.workerUrl}/api/resolve`,
    post(settings.token, form),
    timeoutMs,
  );
  if (reply.kind !== "response") return { kind: "error", code: reply.kind };

  const { status, body } = reply;
  if (status === 200 && isResolveResponse(body)) {
    return { kind: "result", response: body };
  }
  const code = errorCode(body);
  if (code) return { kind: "error", code };
  if (status >= 500) return { kind: "error", code: "upstream_error" };
  return { kind: "error", code: "bad_response" };
}

/**
 * Checks the URL with /api/health, then the token with an imageless resolve:
 * the Worker checks auth before the body, so a good token gets 400
 * missing_image and no Claude call is made.
 */
export async function testConnection(
  settings: Pick<Settings, "workerUrl" | "token">,
  fetchFn: Fetch,
): Promise<ConnectionResult> {
  const health = await request(
    fetchFn,
    `${settings.workerUrl}/api/health`,
    {},
    CONNECTION_TIMEOUT_MS,
  );
  if (health.kind !== "response") return { kind: "unreachable" };
  const { ok, version } = (health.body ?? {}) as {
    ok?: unknown;
    version?: unknown;
  };
  if (health.status !== 200 || ok !== true || typeof version !== "string") {
    return { kind: "not_song_resolver" };
  }

  const auth = await request(
    fetchFn,
    `${settings.workerUrl}/api/resolve`,
    post(settings.token, new FormData()),
    CONNECTION_TIMEOUT_MS,
  );
  if (auth.kind !== "response") return { kind: "unreachable" };
  switch (errorCode(auth.body)) {
    case "missing_image":
      return { kind: "ok", version };
    case "unauthorized":
      return { kind: "bad_token", version };
    default:
      return { kind: "not_song_resolver" };
  }
}
