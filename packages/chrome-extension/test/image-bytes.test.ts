import { describe, expect, it } from "vitest";
import { sniffImageType } from "../src/lib/image-bytes";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );

describe("sniffImageType", () => {
  it.each([
    ["image/png", bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ["image/jpeg", bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ["image/webp", bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ")],
    ["image/gif", bytes("GIF89a", [1, 0])],
    ["image/avif", bytes([0, 0, 0, 0x1c], "ftypavif", [0, 0])],
    ["image/avif", bytes([0, 0, 0, 0x1c], "ftypavis", [0, 0])],
  ])("recognises %s", (type, data) => {
    expect(sniffImageType(data)).toBe(type);
  });

  it("doesn't trust a RIFF file that isn't WebP", () => {
    expect(sniffImageType(bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt "))).toBe(
      null,
    );
  });

  it("returns null for HTML error pages and short files", () => {
    expect(sniffImageType(bytes("<!doctype html>"))).toBeNull();
    expect(sniffImageType(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
