const CACHE_NAME = "wishlist-offline-v1";
const WISHLIST_PATH = "/wishlist";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("wishlist-offline-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

function isCacheableAsset(request) {
  return ["script", "style", "font", "image"].includes(request.destination);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) {
      await cache.put(WISHLIST_PATH, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(WISHLIST_PATH);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (
    request.mode === "navigate" &&
    url.origin === self.location.origin &&
    url.pathname === WISHLIST_PATH
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  if (isCacheableAsset(request)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "WARM_WISHLIST_CACHE") return;

  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const pageResponse = await fetch(WISHLIST_PATH, {
        credentials: "include",
        cache: "reload",
      });
      if (!pageResponse.ok || pageResponse.redirected) return;
      await cache.put(WISHLIST_PATH, pageResponse.clone());

      const results = await Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok || response.type === "opaque") {
            await cache.put(url, response);
            return;
          }
          throw new Error(`Could not cache ${url}`);
        }),
      );
      const criticalAssetFailed = results.some(
        (result, index) =>
          result.status === "rejected" &&
          new URL(urls[index]).origin === self.location.origin,
      );
      if (!criticalAssetFailed) {
        event.source?.postMessage({ type: "WISHLIST_CACHE_READY" });
      }
    }),
  );
});
