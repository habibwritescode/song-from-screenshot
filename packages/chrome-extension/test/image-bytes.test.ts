import { describe, expect, it } from "vitest";
import { cropRect } from "../src/lib/image-bytes";

describe("cropRect", () => {
  const viewport = { width: 1000, height: 800 };

  it("maps the image's on-screen box onto the screenshot at 1x", () => {
    expect(
      cropRect({ x: 100, y: 50, width: 400, height: 300 }, viewport, {
        width: 1000,
        height: 800,
      }),
    ).toEqual({ x: 100, y: 50, width: 400, height: 300 });
  });

  it("scales by screenshot size, so Retina and page zoom both work", () => {
    expect(
      cropRect({ x: 100, y: 50, width: 400, height: 300 }, viewport, {
        width: 2000,
        height: 1600,
      }),
    ).toEqual({ x: 200, y: 100, width: 800, height: 600 });
  });

  it("keeps only the visible part of an image partly off screen", () => {
    expect(
      cropRect({ x: -100, y: 700, width: 400, height: 300 }, viewport, {
        width: 1000,
        height: 800,
      }),
    ).toEqual({ x: 0, y: 700, width: 300, height: 100 });
  });

  it("returns null for an image that isn't on screen", () => {
    expect(
      cropRect({ x: 0, y: 900, width: 400, height: 300 }, viewport, {
        width: 1000,
        height: 800,
      }),
    ).toBeNull();
  });
});
