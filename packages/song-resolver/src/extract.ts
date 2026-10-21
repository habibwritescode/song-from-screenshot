import type Anthropic from "@anthropic-ai/sdk";
import type { Extraction, Player } from "./types";

export type MessagesClient = Pick<Anthropic, "messages">;
export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export class ExtractError extends Error {
  override readonly name = "ExtractError";

  constructor(
    readonly reason: "refused" | "truncated" | "invalid_output",
    message: string,
  ) {
    super(message);
  }
}

const PLAYERS: readonly Player[] = ["spotify", "apple_music", "unknown"];

const PROMPT = `This image is a screenshot that may contain a music player's "Now Playing" screen (Spotify, Apple Music, or similar), possibly re-shared inside a tweet or an Instagram story.

Read the currently playing track's title and artist from the player's track info area (the large title text with the artist name directly below it).

Ignore all other text, including:
- playlist or context names at the top of the player (e.g. "Release Radar", "Playing from album")
- output device names (e.g. "soundcore Liberty 4 NC", "AirPods")
- badges and labels (the explicit "E" badge, "Dolby Atmos", "Lossless")
- sections like "About the artist" or "Lyrics"
- phone status-bar text, tweet text, usernames, and captions

Copy the title exactly as shown, including any "(feat. ...)" part and punctuation. If several artists are listed, copy the full artist line.

Set player from the controls and layout, otherwise "unknown":
- "spotify": shuffle and repeat icons on either side of the play/pause row; a context header at the top such as "Release Radar" or "Playing from ..."; a "+" (add) or checkmark button beside the title; often a green connected-device line under the controls.
- "apple_music": a star or "..." button in a circle beside the title; no shuffle/repeat on the play/pause row; bottom row with lyrics (speech bubble), AirPlay/cast and queue icons; badges like "Dolby Atmos" or "Lossless". Set confidence from 0 to 1 for how sure you are that title and artist are read correctly. If no music player track is visible, set found to false and leave title and artist empty.`;

const SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    title: { type: "string" },
    artist: { type: "string" },
    player: { type: "string", enum: PLAYERS },
    confidence: { type: "number" },
  },
  required: ["found", "title", "artist", "player", "confidence"],
  additionalProperties: false,
};

export async function extractSong(
  image: Uint8Array,
  mediaType: ImageMediaType,
  deps: { client: MessagesClient; model: string },
): Promise<Extraction> {
  const response = await deps.client.messages.create({
    model: deps.model,
    max_tokens: 2048,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: toBase64(image),
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal")
    throw new ExtractError("refused", "Claude declined to read the image");
  if (response.stop_reason === "max_tokens")
    throw new ExtractError("truncated", "Claude's answer was cut off");

  const text = response.content.find((block) => block.type === "text");
  if (!text)
    throw new ExtractError("invalid_output", "Claude returned no text");

  return parseExtraction(text.text);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function parseExtraction(text: string): Extraction {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ExtractError("invalid_output", "Claude returned invalid JSON");
  }

  if (!isRawExtraction(value))
    throw new ExtractError(
      "invalid_output",
      "Claude's JSON doesn't match the schema",
    );

  const title = value.title.trim();
  const artist = value.artist.trim();
  if (!value.found || title === "" || artist === "") return { found: false };

  return {
    found: true,
    title,
    artist,
    player: value.player,
    confidence: Math.min(1, Math.max(0, value.confidence)),
  };
}

interface RawExtraction {
  found: boolean;
  title: string;
  artist: string;
  player: Player;
  confidence: number;
}

function isRawExtraction(v: unknown): v is RawExtraction {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.found === "boolean" &&
    typeof r.title === "string" &&
    typeof r.artist === "string" &&
    PLAYERS.includes(r.player as Player) &&
    typeof r.confidence === "number"
  );
}
