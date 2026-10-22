import { describe, expect, it } from "vitest";
import { bestImageUrl } from "../src/lib/image-url";

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("bestImageUrl on X", () => {
  it.each(["small", "medium", "large", "900x900", "orig"])(
    "asks for the original size instead of name=%s",
    (name) => {
      const url = bestImageUrl(
        `https://pbs.twimg.com/media/GZx1abc?format=jpg&name=${name}`,
      );
      expect(params(url)).toEqual({ format: "jpg", name: "orig" });
    },
  );

  it("keeps a format the Worker accepts", () => {
    for (const format of ["png", "webp"]) {
      const url = bestImageUrl(
        `https://pbs.twimg.com/media/GZx1abc?format=${format}&name=small`,
      );
      expect(params(url).format).toBe(format);
    }
  });

  it("asks for JPEG when the format is one the Worker rejects or missing", () => {
    expect(
      params(
        bestImageUrl(
          "https://pbs.twimg.com/media/GZx1abc?format=avif&name=small",
        ),
      ).format,
    ).toBe("jpg");
    expect(
      params(bestImageUrl("https://pbs.twimg.com/media/GZx1abc?name=small"))
        .format,
    ).toBe("jpg");
  });

  it("leaves the format to the file extension on older URLs", () => {
    const url = bestImageUrl(
      "https://pbs.twimg.com/media/GZx1abc.png?name=small",
    );
    expect(new URL(url).pathname).toBe("/media/GZx1abc.png");
    expect(params(url)).toEqual({ name: "orig" });
  });

  it("ignores the srcset X sometimes adds", () => {
    const url = bestImageUrl(
      "https://pbs.twimg.com/media/GZx1abc?format=jpg&name=small",
      "https://pbs.twimg.com/media/GZx1abc?format=jpg&name=large 2x",
    );
    expect(params(url).name).toBe("orig");
  });

  it("leaves X avatars and other non-media images alone", () => {
    const avatar = "https://pbs.twimg.com/profile_images/1/abc_normal.jpg";
    expect(bestImageUrl(avatar)).toBe(avatar);
  });
});

describe("bestImageUrl from srcset", () => {
  // Instagram writes srcset with no space after the commas, and its URLs are
  // signed: any change to the query string makes the CDN refuse them.
  const ig = (w: number) =>
    `https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-15/1_n.jpg?stp=dst-jpg_e35_p${w}x${w}&_nc_ht=scontent&oh=00_AYB&oe=671A`;

  it("picks the widest Instagram candidate, URL untouched", () => {
    const srcset = `${ig(640)} 640w,${ig(1080)} 1080w,${ig(750)} 750w`;
    expect(bestImageUrl(ig(640), srcset)).toBe(ig(1080));
  });

  it("handles spaced srcsets and density descriptors", () => {
    expect(
      bestImageUrl(
        "https://example.com/a.jpg",
        "https://example.com/a.jpg 1x, https://example.com/a@3x.jpg 3x, https://example.com/a@2x.jpg 2x",
      ),
    ).toBe("https://example.com/a@3x.jpg");
  });

  it("keeps commas that are part of a URL", () => {
    const withComma = "https://cdn.example.com/w_1200,h_800/a.jpg";
    expect(
      bestImageUrl(
        "https://cdn.example.com/w_600,h_400/a.jpg",
        `https://cdn.example.com/w_600,h_400/a.jpg 600w, ${withComma} 1200w`,
      ),
    ).toBe(withComma);
  });

  it("falls back to src without a usable srcset", () => {
    expect(bestImageUrl("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg",
    );
    expect(bestImageUrl("https://example.com/a.jpg", "garbage")).toBe(
      "https://example.com/a.jpg",
    );
  });

  it("passes data: URLs through", () => {
    const data = "data:image/png;base64,iVBORw0KGgo=";
    expect(bestImageUrl(data)).toBe(data);
  });
});
