import { describe, expect, it, vi } from "vitest";
import { ExtractError, extractSong, type MessagesClient } from "../src/extract";

const IMAGE = new Uint8Array([137, 80, 78, 71]);

function fakeClient(response: { stop_reason: string; content: unknown[] }) {
  const create = vi.fn().mockResolvedValue(response);
  return {
    client: { messages: { create } } as unknown as MessagesClient,
    create,
  };
}

function textReply(json: unknown, stop_reason = "end_turn") {
  return {
    stop_reason,
    content: [{ type: "text", text: JSON.stringify(json) }],
  };
}

const EGO = {
  found: true,
  title: "EGO",
  artist: "Naarly",
  player: "spotify",
  confidence: 0.97,
};

describe("extractSong", () => {
  it("sends the image as base64 with a JSON schema and returns the parsed song", async () => {
    const { client, create } = fakeClient(textReply(EGO));

    const result = await extractSong(IMAGE, "image/png", {
      client,
      model: "claude-haiku-5-5",
    });

    expect(result).toEqual(EGO);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-5-5",
        output_config: expect.objectContaining({
          format: expect.objectContaining({ type: "json_schema" }),
        }),
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "iVBORw==",
                },
              },
            ]),
          }),
        ],
      }),
    );
  });

  it("reads the text block after any thinking blocks", async () => {
    const { client } = fakeClient({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: JSON.stringify(EGO) },
      ],
    });

    expect(
      await extractSong(IMAGE, "image/png", { client, model: "m" }),
    ).toEqual(EGO);
  });

  it("returns not found when the model finds no song", async () => {
    const { client } = fakeClient(
      textReply({
        found: false,
        title: "",
        artist: "",
        player: "unknown",
        confidence: 0,
      }),
    );

    expect(
      await extractSong(IMAGE, "image/png", { client, model: "m" }),
    ).toEqual({ found: false });
  });

  it("treats a found song with blank title or artist as not found", async () => {
    const { client } = fakeClient(textReply({ ...EGO, artist: "  " }));

    expect(
      await extractSong(IMAGE, "image/png", { client, model: "m" }),
    ).toEqual({ found: false });
  });

  it("trims text and clamps confidence to 0..1", async () => {
    const { client } = fakeClient(
      textReply({ ...EGO, title: " EGO ", confidence: 1.4 }),
    );

    expect(
      await extractSong(IMAGE, "image/png", { client, model: "m" }),
    ).toEqual({ ...EGO, confidence: 1 });
  });

  it.each([
    ["refusal", "refused"],
    ["max_tokens", "truncated"],
  ])("throws when stop_reason is %s", async (stopReason, reason) => {
    const { client } = fakeClient(textReply(EGO, stopReason));

    await expect(
      extractSong(IMAGE, "image/png", { client, model: "m" }),
    ).rejects.toMatchObject({
      name: "ExtractError",
      reason,
    });
  });

  it.each([
    ["no text block", { stop_reason: "end_turn", content: [] }],
    [
      "invalid JSON",
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "not json" }],
      },
    ],
    ["unknown player", textReply({ ...EGO, player: "tidal" })],
    ["missing field", textReply({ found: true, title: "EGO" })],
  ])("throws invalid_output for %s", async (_, response) => {
    const { client } = fakeClient(response);

    const error = await extractSong(IMAGE, "image/png", {
      client,
      model: "m",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractError);
    expect((error as ExtractError).reason).toBe("invalid_output");
  });
});
