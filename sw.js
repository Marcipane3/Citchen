// Service Worker — cached die App-Hülle, damit sie installierbar & offline-fähig ist.
// Daten (rezepte.json) liegen in Drive und werden NICHT hier gecacht (immer frisch).
const CACHE = "kochbuch-v2";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Google-APIs & Auth nie cachen — immer live
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("google.com")) return;
  // App-Hülle: cache-first
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
