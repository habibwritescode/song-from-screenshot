import { cropRect, type Box } from "./lib/image-bytes";
import type { CaptureRequest } from "./lib/pipeline";

// Long enough for small player text; keeps the JPEG well under 5 MB.
const MAX_SIDE = 2048;

async function toJpeg(
  source: ImageBitmap,
  box: Box,
  scale = 1,
): Promise<Blob | null> {
  const width = Math.round(box.width * scale);
  const height = Math.round(box.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(
    source,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    width,
    height,
  );
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

/**
 * Crops the image out of a screenshot of the tab. Only works after a
 * right-click, which grants activeTab; used when the image host refuses
 * the download.
 */
export async function captureImage(
  windowId: number,
  { rect, viewport }: CaptureRequest,
): Promise<Blob | null> {
  let bitmap: ImageBitmap | undefined;
  try {
    const shot = await chrome.tabs.captureVisibleTab(windowId, {
      format: "png",
    });
    bitmap = await createImageBitmap(await (await fetch(shot)).blob());
    const crop = cropRect(rect, viewport, bitmap);
    return crop && (await toJpeg(bitmap, crop));
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * Re-encodes an image the Worker won't take (AVIF, GIF, over 5 MB) as a
 * JPEG, scaled down so its long side is at most 2048 px. GIFs keep their
 * first frame.
 */
export async function convertImage(image: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(image);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    return await toJpeg(
      bitmap,
      { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
      scale,
    );
  } catch {
    return null;
  } finally {
    // A decoded photo can be 100+ MB; don't leave it for the garbage collector.
    bitmap?.close();
  }
}
