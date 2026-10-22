export type ImageType =
  "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif";

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** The image type from the file's first bytes; CDN Content-Type headers lie. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
    return "image/webp";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  const brand = ascii(bytes, 4, 12);
  if (brand === "ftypavif" || brand === "ftypavis") return "image/avif";
  return null;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * The image's on-screen box in screenshot pixels, clipped to what's visible.
 * Scaling by screenshot width over viewport width covers both Retina screens
 * and page zoom, which devicePixelRatio alone gets wrong.
 */
export function cropRect(
  rect: Box,
  viewport: Size,
  screenshot: Size,
): Box | null {
  const scale = screenshot.width / viewport.width;
  const left = Math.max(0, Math.round(rect.x * scale));
  const top = Math.max(0, Math.round(rect.y * scale));
  const right = Math.min(
    screenshot.width,
    Math.round((rect.x + rect.width) * scale),
  );
  const bottom = Math.min(
    screenshot.height,
    Math.round((rect.y + rect.height) * scale),
  );
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export async function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (!blob.type) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // Chunked: spreading a whole image into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}
