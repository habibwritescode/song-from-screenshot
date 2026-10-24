import { PLATFORMS, type Platform } from "song-resolver/client/platforms";

export {
  PLATFORM_LABELS,
  PLATFORMS,
  type Platform,
} from "song-resolver/client/platforms";

export interface Settings {
  workerUrl: string;
  token: string;
  preferredPlatform: Platform;
  hoverButton: boolean;
}

/** The settings content scripts get; never the Worker URL or token. */
export type DisplaySettings = Pick<
  Settings,
  "preferredPlatform" | "hoverButton"
>;

export const DEFAULT_SETTINGS: Settings = {
  workerUrl: "",
  token: "",
  preferredPlatform: "spotify",
  hoverButton: true,
};

/** The slice of `chrome.storage.local` settings need, so tests can fake it. */
export interface SettingsStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Partial<Settings>): Promise<void>;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** The Worker's origin, or null if it isn't an https URL (http only for wrangler dev). */
export function normalizeWorkerUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const allowed =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  return allowed ? url.origin : null;
}

export function isConfigured(settings: Settings): boolean {
  return settings.workerUrl !== "" && settings.token !== "";
}

export async function loadSettings(
  storage: SettingsStorage,
): Promise<Settings> {
  const stored = await storage.get(Object.keys(DEFAULT_SETTINGS));
  const { workerUrl, token, preferredPlatform, hoverButton } = stored;
  return {
    workerUrl:
      typeof workerUrl === "string"
        ? (normalizeWorkerUrl(workerUrl) ?? "")
        : "",
    token: typeof token === "string" ? token : "",
    preferredPlatform: PLATFORMS.includes(preferredPlatform as Platform)
      ? (preferredPlatform as Platform)
      : DEFAULT_SETTINGS.preferredPlatform,
    hoverButton:
      typeof hoverButton === "boolean"
        ? hoverButton
        : DEFAULT_SETTINGS.hoverButton,
  };
}

export async function saveSettings(
  storage: SettingsStorage,
  settings: Settings,
): Promise<void> {
  await storage.set(settings);
}
