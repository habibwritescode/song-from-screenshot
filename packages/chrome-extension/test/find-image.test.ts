import { describe, expect, it } from "vitest";
import { pickImage } from "../src/lib/find-image";

// happy-dom doesn't lay out, so give elements the size a browser would.
function sized<T extends Element>(
  element: T,
  width: number,
  height: number,
): T {
  element.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
  return element;
}

const img = (width: number, height: number) =>
  sized(document.createElement("img"), width, height);
const div = () => sized(document.createElement("div"), 600, 600);

describe("pickImage", () => {
  it("finds a photo under Instagram-style transparent overlays", () => {
    const photo = img(600, 750);
    expect(pickImage([div(), div(), photo, div()])).toBe(photo);
  });

  it("skips avatars and icons stacked above the photo", () => {
    const photo = img(500, 500);
    expect(pickImage([img(40, 40), img(600, 120), photo])).toBe(photo);
  });

  it("returns null when there's no big enough image", () => {
    expect(pickImage([div(), img(199, 400)])).toBeNull();
    expect(pickImage([])).toBeNull();
  });

  it("accepts exactly the minimum size", () => {
    const photo = img(200, 200);
    expect(pickImage([photo])).toBe(photo);
  });
});
