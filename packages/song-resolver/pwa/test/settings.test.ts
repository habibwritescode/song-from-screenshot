import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type KeyValueStorage,
} from "../src/lib/settings";

function memory(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("settings", () => {
  it("round-trips what was saved", () => {
    const storage = memory();
    const settings = {
      token: "abc123",
      preferredPlatform: "deezer" as const,
      openDirectly: true,
    };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("starts from defaults on a new device", () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back field by field when stored data is damaged", () => {
    const storage = memory({
      settings: JSON.stringify({
        token: 42,
        preferredPlatform: "napster",
        openDirectly: "yes",
      }),
    });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ settings: "{not json" }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("works when the browser blocks storage", () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      removeItem: () => undefined,
    };
    expect(loadSettings(blocked)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(blocked, DEFAULT_SETTINGS)).toBe(false);
  });
});
