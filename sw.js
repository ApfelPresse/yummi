const APP_VERSION = "1.0.15";
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
  "./js/core/version.js",
  "./js/core/config.js",
  "./js/core/shared.js",
  "./js/auth/auth-ui.js",
  "./js/dav/webdav.js",
  "./js/ignore/ignore.js",
  "./js/recipes/app.js",
  "./js/recipes/loader.js",
  "./js/storage/db.js",
  "./js/storage/local.js",
  "./js/utils/helpers.js",
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

async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  
  const fetchPromise = fetch(req).then(async (res) => {
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);

  return cached || fetchPromise;
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
    const path = url.pathname;
    const isCodeOrStyle = path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css") || path === "/" || path === "/yummi/" || path === "/yummi";
    
    if (isCodeOrStyle) {
      event.respondWith(staleWhileRevalidate(req));
    } else {
      event.respondWith(cacheFirst(req));
    }
  }
});

