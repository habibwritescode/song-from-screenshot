/** The slice of the Cache API used, so tests can pass a fake. */
export interface ShareCaches {
  open(name: string): Promise<Pick<Cache, "put" | "match" | "delete" | "keys">>;
}

/** A separate cache, so app-shell updates never touch shared files. */
export const SHARE_CACHE = "shared";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const url = (key: string) => `/shared/${key}`;

/** Keeps a shared file until the page takes it; returns its one-time key. */
export async function storeShared(
  caches: ShareCaches,
  file: Blob,
): Promise<string> {
  const key = crypto.randomUUID();
  const cache = await caches.open(SHARE_CACHE);
  // Only one share is ever waiting. One the page never picked up (the app was
  // closed straight after sharing) goes now, so screenshots don't pile up.
  for (const old of await cache.keys()) {
    await cache.delete(new URL(old.url).pathname);
  }
  await cache.put(
    url(key),
    new Response(file, { headers: { "Content-Type": file.type } }),
  );
  return key;
}

/** The shared file, deleted as it's read; null if it's gone. */
export async function takeShared(
  caches: ShareCaches,
  key: string,
): Promise<Blob | null> {
  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(url(key));
  if (!response) return null;
  await cache.delete(url(key));
  return response.blob();
}

export type ShareParams =
  { kind: "shared"; key: string } | { kind: "unavailable" };

export function readShareParams(search: string): ShareParams | null {
  const params = new URLSearchParams(search);
  const key = params.get("shared");
  if (key && UUID.test(key)) return { kind: "shared", key };
  if (params.get("share") === "unavailable") return { kind: "unavailable" };
  return null;
}
