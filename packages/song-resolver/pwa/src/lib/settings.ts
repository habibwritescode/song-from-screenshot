import { PLATFORMS, type Platform } from "../../../client/platforms";

export interface Settings {
  token: string;
  preferredPlatform: Platform;
  /** On a match, go straight to the preferred platform's link. */
  openDirectly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  token: "",
  preferredPlatform: "spotify",
  openDirectly: false,
};

/** The slice of `localStorage` used, so tests can pass a fake. */
export type KeyValueStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const KEY = "settings";

export function loadSettings(storage: KeyValueStorage): Settings {
  let stored: Partial<Record<keyof Settings, unknown>> = {};
  try {
    stored = JSON.parse(storage.getItem(KEY) ?? "{}") as typeof stored;
  } catch {
    // Blocked storage or damaged JSON: start from the defaults.
  }
  const { token, preferredPlatform, openDirectly } = stored ?? {};
  return {
    token: typeof token === "string" ? token : DEFAULT_SETTINGS.token,
    preferredPlatform: PLATFORMS.includes(preferredPlatform as Platform)
      ? (preferredPlatform as Platform)
      : DEFAULT_SETTINGS.preferredPlatform,
    openDirectly:
      typeof openDirectly === "boolean"
        ? openDirectly
        : DEFAULT_SETTINGS.openDirectly,
  };
}

/** Whether it was saved; private browsing can refuse storage. */
export function saveSettings(
  storage: KeyValueStorage,
  settings: Settings,
): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
