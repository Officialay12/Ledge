// sw.js — Ledger service worker
//
// Strategy:
// - Core app shell (html/css/js) -> NETWORK-FIRST, falling back to cache when
//   offline. This is deliberate: a stale cached script.js/styles.css after a
//   deploy is worse than one extra network round trip when online, and this
//   app has previously hit a cache-staleness bug from a cache-first shell.
// - Icons/fonts (rarely change, safe to serve instantly) -> CACHE-FIRST,
//   refreshed in the background (stale-while-revalidate).
// - /api/* (household sync) -> NETWORK-ONLY, never cached. This is live,
//   possibly-shared data; serving a cached copy would be actively wrong.
// - Navigation requests when fully offline -> fall back to cached index.html
//   so the app still opens instead of showing the browser's offline page.

const CACHE_VERSION = "ledger-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// Files that make up the installable app shell. Kept small and explicit —
// bump CACHE_VERSION whenever this list or its contents change.
const SHELL_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/storage-shim.js",
  "/manifest.json",
];

const ASSET_FILES = [
  "/icon/favicon-32.png",
  "/icon/favicon-48.png",
  "/icon/icon-192.png",
  "/icon/icon-512.png",
  "/icon/icon-maskable-192.png",
  "/icon/icon-maskable-512.png",
  "/icon/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      // addAll fails the whole install if any single request 404s, so add
      // shell files individually — one missing file shouldn't block install.
      await Promise.all(
        SHELL_FILES.map((url) =>
          shellCache.add(url).catch((err) => {
            console.warn("[sw] shell precache skipped:", url, err);
          }),
        ),
      );
      const assetCache = await caches.open(ASSET_CACHE);
      await Promise.all(
        ASSET_FILES.map((url) =>
          assetCache.add(url).catch((err) => {
            console.warn("[sw] asset precache skipped:", url, err);
          }),
        ),
      );
      // Activate this SW as soon as it finishes installing, instead of
      // waiting for all tabs of the old version to close.
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("ledger-") && !key.startsWith(CACHE_VERSION),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isShellRequest(url) {
  return (
    SHELL_FILES.some((path) => url.pathname === path) ||
    url.pathname === "/" ||
    url.pathname === "/index.html"
  );
}

function isAssetRequest(url) {
  return url.pathname.startsWith("/icon/") || url.hostname.includes("fonts.g");
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("/index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept POST/DELETE (household API writes)

  const url = new URL(request.url);

  // Never intercept the admin panel or its API — no caching, no offline
  // fallback, just pass straight through to the network every time.
  if (url.pathname.startsWith("/admin/") || url.pathname === "/api/admin") {
    return;
  }

  // Never cache API/household sync traffic — always hit the network.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Only handle same-origin app shell + Google Fonts; let everything else
  // (analytics, unknown third parties, etc.) pass straight through.
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && isShellRequest(url)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (
    (sameOrigin && isAssetRequest(url)) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});
