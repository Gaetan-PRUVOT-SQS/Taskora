/* Service worker minimal Taskora PWA */
const CACHE = "taskora-v3";
const ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.png",
  "/logo.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);
  // ne pas cacher l'API
  if (url.pathname.indexOf("/api/") === 0 || url.pathname.indexOf("/ws") === 0) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(event.request).catch(function () {
        return caches.match("/");
      });
    })
  );
});
