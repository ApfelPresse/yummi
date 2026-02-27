const APP_VERSION = "1.0.1";
const CACHE = `yummi-${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./recipe.html",
  "./edit.html",
  "./styles.css",
  "./js/tialwind_3.4.17.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (new URL(req.url).origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});

