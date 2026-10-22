import { resolve, type Fetch, type Outcome } from "./api";
import {
  blobToDataUrl,
  sniffImageType,
  type Box,
  type Size,
} from "./image-bytes";
import { bestImageUrl } from "./image-url";
import { isConfigured, type Settings } from "./settings";

/** What a content script sends the background for the image it found. */
export interface FindRequest {
  type: "find";
  src: string;
  srcset: string;
  /** Where the image is on screen, when a screen capture is allowed as a fallback. */
  capture?: CaptureRequest;
}

export interface CaptureRequest {
  rect: Box;
  viewport: Size;
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
  /** Crops the image out of a screenshot of the tab; absent where not allowed. */
  captureImage?: (capture: CaptureRequest) => Promise<Blob | null>;
  /** Re-encodes an image as a JPEG the Worker accepts, or null if it can't. */
  convertImage?: (image: Blob) => Promise<Blob | null>;
}

const IMAGE_TIMEOUT_MS = 10_000;
// Bigger files aren't screenshots, and reading them would stall the worker.
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
// What song-resolver accepts.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const WORKER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const workerAccepts = (image: Blob) =>
  WORKER_TYPES.has(image.type) && image.size <= MAX_UPLOAD_BYTES;

async function download(url: string, fetchFn: Fetch): Promise<Blob | null> {
  try {
    const response = await fetchFn(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    const declared = Number(response.headers.get("Content-Length"));
    if (!response.ok || declared > MAX_DOWNLOAD_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) return null;
    // Hosts answer expired or private links with a web page, not an error.
    const type = sniffImageType(bytes);
    return type && new Blob([bytes], { type });
  } catch {
    return null;
  }
}

async function artworkFor(outcome: Outcome, fetchFn: Fetch) {
  const url = outcome.kind === "result" && outcome.response.track?.artworkUrl;
  if (!url) return null;
  const blob = await download(url, fetchFn);
  return blob && blobToDataUrl(blob);
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

  const image =
    (await download(bestImageUrl(request.src, request.srcset), deps.fetch)) ??
    (request.capture && deps.captureImage
      ? await deps.captureImage(request.capture)
      : null);
  const upload =
    image && !workerAccepts(image)
      ? ((await deps.convertImage?.(image)) ?? null)
      : image;
  if (!upload) {
    return {
      outcome: { kind: "error", code: "image_unreadable" },
      artwork: null,
    };
  }
  const outcome = await resolve(upload, settings, deps.fetch);
  return { outcome, artwork: await artworkFor(outcome, deps.fetch) };
}
