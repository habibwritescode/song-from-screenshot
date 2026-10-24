import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";

describe("POST /share", () => {
  it("sends a share that reached the Worker back to the web app with a note", async () => {
    const res = await createApp().request("/share", {
      method: "POST",
      body: new FormData(),
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/?share=unavailable");
  });
});
