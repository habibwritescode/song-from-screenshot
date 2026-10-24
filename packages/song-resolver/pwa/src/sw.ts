import { SHARE_CACHE, storeShared } from "./lib/share-store";

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL_CACHE = "shell";
const SHELL = [
  "/",
  "/app.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/icons/192.png",
];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL_CACHE && name !== SHARE_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

/** Android's share sheet posts the screenshot here; the page picks it up after the redirect. */
async function receiveShare(request: Request): Promise<Response> {
  try {
    const image = (await request.formData()).get("image");
    if (!(image instanceof File) || image.size === 0) {
      return Response.redirect("/", 303);
    }
    const key = await storeShared(caches, image);
    return Response.redirect(`/?shared=${key}`, 303);
  } catch {
    return Response.redirect("/", 303);
  }
}

/** Fresh when online, so updates show at once; the cached copy when offline. */
async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE);
  // One entry per path: "/?shared=…" is still "/".
  const key = new URL(request.url).pathname;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch {
    return (await cache.match(key)) ?? Response.error();
  }
}

sw.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Album covers and other sites: the browser handles them as usual.
  if (url.origin !== location.origin) return;
  if (event.request.method === "POST" && url.pathname === "/share") {
    event.respondWith(receiveShare(event.request));
    return;
  }
  // Lookups always go to the Worker, never to a cache.
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }
  event.respondWith(networkFirst(event.request));
});
