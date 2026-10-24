import { sniffImageType, workerAccepts } from "../../../client/normalize";

/** Re-encodes an image as a JPEG the Worker takes, or null if the browser can't read it. */
export type Convert = (image: Blob) => Promise<Blob | null>;

export async function prepareUpload(
  file: Blob,
  convert: Convert,
): Promise<Blob | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniffImageType(head);
  // Picker and clipboard labels can be wrong or missing; the bytes decide.
  const image = type ? file.slice(0, file.size, type) : file;
  return workerAccepts(image) ? image : convert(image);
}
