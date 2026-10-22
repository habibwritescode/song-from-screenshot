// Smaller images are avatars, emoji and icons, never a Now Playing screenshot.
export const MIN_IMAGE_SIZE = 200;

/**
 * The first big enough `<img>` in a stack from `document.elementsFromPoint`.
 * Taking the stack rather than the event target sees through the transparent
 * layers Instagram puts over its photos.
 */
export function pickImage(stack: Iterable<Element>): HTMLImageElement | null {
  for (const element of stack) {
    if (!(element instanceof HTMLImageElement)) continue;
    const { width, height } = element.getBoundingClientRect();
    if (width >= MIN_IMAGE_SIZE && height >= MIN_IMAGE_SIZE) return element;
  }
  return null;
}
