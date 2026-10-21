import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";

describe("GET /api/health", () => {
  it("reports ok with a version for clients' connection check", async () => {
    const res = await createApp().request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: expect.any(String) });
  });
});
