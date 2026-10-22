import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  isConfigured,
  loadSettings,
  normalizeWorkerUrl,
  type SettingsStorage,
} from "../src/lib/settings";

function fakeStorage(items: Record<string, unknown> = {}): SettingsStorage {
  return {
    get: async () => items,
    set: async (next) => void Object.assign(items, next),
  };
}

describe("normalizeWorkerUrl", () => {
  it("keeps only the origin of an https URL", () => {
    expect(normalizeWorkerUrl(" https://x.workers.dev/api/ ")).toBe(
      "https://x.workers.dev",
    );
    expect(normalizeWorkerUrl("https://x.workers.dev/")).toBe(
      "https://x.workers.dev",
    );
  });

  it("allows plain http only for wrangler dev on this machine", () => {
    expect(normalizeWorkerUrl("http://localhost:8787")).toBe(
      "http://localhost:8787",
    );
    expect(normalizeWorkerUrl("http://127.0.0.1:8787/")).toBe(
      "http://127.0.0.1:8787",
    );
    expect(normalizeWorkerUrl("http://example.com")).toBeNull();
  });

  it("rejects things that aren't web URLs", () => {
    expect(normalizeWorkerUrl("")).toBeNull();
    expect(normalizeWorkerUrl("x.workers.dev")).toBeNull();
    expect(normalizeWorkerUrl("ftp://x.workers.dev")).toBeNull();
    expect(normalizeWorkerUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("loadSettings", () => {
  it("fills defaults on first run", async () => {
    expect(await loadSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("replaces stored values of the wrong kind with defaults", async () => {
    const settings = await loadSettings(
      fakeStorage({
        workerUrl: "http://example.com",
        token: 42,
        preferredPlatform: "napster",
        hoverButton: "yes",
      }),
    );
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid stored values", async () => {
    const stored = {
      workerUrl: "https://x.workers.dev",
      token: "secret",
      preferredPlatform: "appleMusic",
      hoverButton: false,
    };
    expect(await loadSettings(fakeStorage(stored))).toEqual(stored);
  });
});

describe("isConfigured", () => {
  it("needs both a Worker URL and a token", () => {
    const base = { ...DEFAULT_SETTINGS, workerUrl: "https://x.workers.dev" };
    expect(isConfigured(base)).toBe(false);
    expect(isConfigured({ ...base, token: "secret" })).toBe(true);
    expect(isConfigured({ ...DEFAULT_SETTINGS, token: "secret" })).toBe(false);
  });
});
