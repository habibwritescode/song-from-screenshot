// Long enough for small player text; keeps the JPEG well under 5 MB.
const MAX_SIDE = 2048;

type Source = { source: CanvasImageSource; width: number; height: number };

async function decode(image: Blob, url: string): Promise<Source> {
  try {
    const bitmap = await createImageBitmap(image);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    // Safari decodes some formats (HEIC) only through an <img>.
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  }
}

/** Re-encodes an image as a JPEG with the long side at most 2048 px, or null if the browser can't read it. */
export async function convertToJpeg(image: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(image);
  try {
    const { source, width, height } = await decode(image, url);
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas
      .getContext("2d")
      ?.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source instanceof ImageBitmap) source.close();
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
