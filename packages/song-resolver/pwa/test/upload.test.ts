import { describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "../../client/normalize";
import { prepareUpload } from "../src/lib/upload";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const AVIF = [0, 0, 0, 0x1c, ...[..."ftypavif"].map((c) => c.charCodeAt(0))];

const file = (header: number[], size = 64, type = "") => {
  const bytes = new Uint8Array(size);
  bytes.set(header);
  return new Blob([bytes], { type });
};
const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
  type: "image/jpeg",
});

describe("prepareUpload", () => {
  it("sends a small PNG as it is, typed by its bytes rather than its label", async () => {
    const convert = vi.fn();
    const upload = await prepareUpload(
      file(PNG, 64, "application/octet-stream"),
      convert,
    );
    expect(convert).not.toHaveBeenCalled();
    expect(upload?.type).toBe("image/png");
    expect(upload?.size).toBe(64);
  });

  it("converts what the Worker can't take", async () => {
    const convert = vi.fn(async () => jpeg);
    expect(await prepareUpload(file(AVIF), convert)).toBe(jpeg);
    expect(await prepareUpload(file(PNG, MAX_UPLOAD_BYTES + 1), convert)).toBe(
      jpeg,
    );
    expect(convert).toHaveBeenCalledTimes(2);
  });

  it("lets the browser try formats it doesn't recognise, like HEIC", async () => {
    const convert = vi.fn(async () => jpeg);
    expect(await prepareUpload(file([1, 2, 3]), convert)).toBe(jpeg);
  });

  it("returns null when the image can't be converted", async () => {
    expect(await prepareUpload(file(AVIF), async () => null)).toBeNull();
  });
});
