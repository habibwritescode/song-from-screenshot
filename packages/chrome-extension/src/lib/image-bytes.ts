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
