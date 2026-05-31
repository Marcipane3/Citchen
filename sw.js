// Service Worker — cached die App-Hülle, damit sie installierbar & offline-fähig ist.
// Daten (rezepte.json) liegen in Drive und werden NICHT hier gecacht (immer frisch).
const CACHE = "kochbuch-v8";
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
  const req = e.request;
  const url = new URL(req.url);
  // Google-APIs & Auth nie cachen — immer live
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("google.com")) return;

  const isHTML = req.mode === "navigate" ||
    url.pathname.endsWith("/") || url.pathname.endsWith("index.html");

  if (isHTML) {
    // App-Hülle: NETWORK-FIRST — immer die neueste index.html holen, wenn online.
    // Cache dient nur als Offline-Fallback. Verhindert, dass alte Versionen "kleben".
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
  } else {
    // Statische Assets (Icons, Manifest): cache-first.
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});
