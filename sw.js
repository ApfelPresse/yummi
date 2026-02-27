const APP_VERSION = "1.0.8";
const CACHE = `yummi-${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./recipe.html",
  "./edit.html",
  "./favicon.ico",
  "./logo.png",
  "./styles.css",
  "./js/tialwind_3.4.17.js",
  "./js/core/sw-register.js",
  "./manifest.webmanifest"
];

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) {
    const cache = await caches.open(CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("yummi-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req));
  }
});

