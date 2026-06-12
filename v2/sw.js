// sw.js — Service Worker für /v2.
// Strategie (v1-bewährt + 01_ARCHITECTURE):
//  - index.html: NETWORK-FIRST (neue Builds "kleben" nicht), Cache als Offline-Fallback.
//  - Statische Assets (Styles, Module, Icons, Snapshot): CACHE-FIRST mit Hintergrund-Update.
//  - Google-Auth/Drive (accounts.google.com, www.googleapis.com): NIE cachen.
//  - Fonts (fonts.googleapis.com / fonts.gstatic.com): cache-first zur Laufzeit,
//    damit die Typo auch offline stimmt.

const CACHE = "koch-v2.1-1";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/app.css",
  "./src/app.js",
  "./src/version.js",
  "./src/router.js",
  "./src/store.js",
  "./src/data/db.js",
  "./src/data/schema.js",
  "./src/data/derive.js",
  "./src/data/migrate.js",
  "./src/data/drive.js",
  "./src/data/sync.js",
  "./src/ui/sheet.js",
  "./src/ui/helpers.js",
  "./src/features/menu.js",
  "./src/features/cookbook/cookbook.js",
  "./src/features/cookbook/filter.js",
  "./src/features/cookbook/detail.js",
  "./src/features/cookbook/form.js",
  "./src/features/cookbook/export.js",
  "./src/features/cooking/cooking.js",
  "./src/features/match/match.js",
  "./src/features/shopping/catalog.js",
  "./src/features/shopping/logic.js",
  "./src/features/shopping/shopping.js",
  "./src/features/planner/logic.js",
  "./src/features/planner/planner.js",
  "./src/features/assistant/assistant.js",
  "./src/features/settings/settings.js",
  "./src/data/settings.js",
  "./src/ai/gate.js",
  "./src/ai/client.js",
  "./src/ai/prompts.js",
  "./src/ai/parse.js",
  "./src/flags.js",
  "./src/i18n.js",
  "./src/features/capture/capture.js",
  "./src/features/capture/parse.js",
  "./src/features/onboarding/language.js",
  "./src/features/lager/lager.js",
  "./src/features/lager/logic.js",
  "./src/data/lager.js",
  "./src/features/guide/guide.js",
  "./data/rezepte.snapshot.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Auth & Drive: immer live, nie cachen.
  if (url.hostname === "accounts.google.com" || url.hostname.endsWith("googleapis.com")) {
    // Ausnahme: Fonts-CSS kommt von fonts.googleapis.com → cachen erlaubt.
    if (url.hostname !== "fonts.googleapis.com") return;
  }

  // Fonts: cache-first (offline-Typo)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // Nur eigener Scope ab hier
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");

  if (isHTML) {
    // Network-first: immer den neuesten Build holen, Cache nur offline.
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
  } else {
    // Assets: cache-first, im Hintergrund aktualisieren (stale-while-revalidate light).
    e.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || refresh;
      })
    );
  }
});
