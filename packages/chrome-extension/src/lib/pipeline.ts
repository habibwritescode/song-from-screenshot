import { resolve, type Fetch, type Outcome } from "./api";
import { sniffImageType } from "./image-bytes";
import { bestImageUrl } from "./image-url";
import { isConfigured, type Settings } from "./settings";

/** What a content script sends the background for the image it found. */
export interface FindRequest {
  type: "find";
  src: string;
  srcset: string;
}

export interface FindResult {
  outcome: Outcome;
  /**
   * The track's artwork as a data: URL. X's and Instagram's CSP block images
   * from the artwork hosts, but allow data: URLs.
   */
  artwork: string | null;
}

export interface PipelineDeps {
  fetch: Fetch;
  loadSettings: () => Promise<Settings>;
}

const IMAGE_TIMEOUT_MS = 10_000;

async function download(url: string, fetchFn: Fetch): Promise<Blob | null> {
  try {
    const response = await fetchFn(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const type = sniffImageType(bytes);
    return new Blob([bytes], type ? { type } : {});
  } catch {
    return null;
  }
}

async function toDataUrl(blob: Blob): Promise<string | null> {
  if (!blob.type) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // Chunked: spreading a whole image into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function artworkFor(outcome: Outcome, fetchFn: Fetch) {
  const url = outcome.kind === "result" && outcome.response.track?.artworkUrl;
  if (!url) return null;
  const blob = await download(url, fetchFn);
  return blob && toDataUrl(blob);
}

export async function findSong(
  request: FindRequest,
  deps: PipelineDeps,
): Promise<FindResult> {
  const settings = await deps.loadSettings();
  if (!isConfigured(settings)) {
    return {
      outcome: { kind: "error", code: "not_configured" },
      artwork: null,
    };
  }

  const image = await download(
    bestImageUrl(request.src, request.srcset),
    deps.fetch,
  );
  if (!image) {
    return {
      outcome: { kind: "error", code: "image_unreadable" },
      artwork: null,
    };
  }
  const outcome = await resolve(image, settings, deps.fetch);
  return { outcome, artwork: await artworkFor(outcome, deps.fetch) };
}
