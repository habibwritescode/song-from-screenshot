import type { HistoryStorage } from "../../../client/history";
import type { KeyValueStorage } from "./settings";

/** Lets the shared history module, written for extension storage, use `localStorage`. */
export function historyStorage(storage: KeyValueStorage): HistoryStorage {
  return {
    async get(keys) {
      const items: Record<string, unknown> = {};
      for (const key of keys) {
        try {
          const raw = storage.getItem(key);
          if (raw !== null) items[key] = JSON.parse(raw);
        } catch {
          // Damaged or blocked: the history module treats it as empty.
        }
      }
      return items;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        storage.setItem(key, JSON.stringify(value));
      }
    },
  };
}
