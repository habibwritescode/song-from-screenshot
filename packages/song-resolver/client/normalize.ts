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

// What song-resolver accepts.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const WORKER_TYPES = new Set<string>(["image/png", "image/jpeg", "image/webp"]);

/** Whether the Worker takes this image as is; otherwise it must be converted. */
export const workerAccepts = (image: Blob) =>
  WORKER_TYPES.has(image.type) && image.size <= MAX_UPLOAD_BYTES;
