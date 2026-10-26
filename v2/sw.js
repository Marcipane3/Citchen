// sw.js — Service Worker für /v2.
// Strategie (v1-bewährt + 01_ARCHITECTURE):
//  - index.html: NETWORK-FIRST (neue Builds "kleben" nicht), Cache als Offline-Fallback.
//  - Statische Assets (Styles, Module, Icons, Snapshot): CACHE-FIRST aus dem EIGENEN Cache.
//  - Google-Auth/Drive (accounts.google.com, www.googleapis.com): NIE cachen.
//  - Fonts (fonts.googleapis.com / fonts.gstatic.com): cache-first zur Laufzeit,
//    damit die Typo auch offline stimmt.
//
// Ein Build = ein Worker = ein Cache (v2.15c). Neue Module kommen NUR als Ganzes mit dem neuen
// Worker (addAll beim install, dann skipWaiting + Aktivierung) — deshalb muss jeder Release CACHE
// ändern. Bis v2.15b hat der laufende Worker Assets zusätzlich im Hintergrund nachgeladen und
// Stück für Stück in seinen Cache gelegt („stale-while-revalidate“). Das hatte drei Folgen:
//  1. gemischter Modul-Graph: lädt ein Teil nicht nach (Funkloch) oder öffnet man die App, bevor
//     alles da ist, laufen neue Module neben alten (fehlender Export = leere App);
//  2. das Schreiben lief außerhalb der Event-Lebenszeit und konnte NACH der Aktivierung des neuen
//     Workers ankommen — caches.open() legte den gerade gelöschten alten Cache wieder an;
//  3. gelesen wurde über ALLE Caches (caches.match ohne cacheName), also auch aus so einem
//     Überbleibsel.
// Jetzt: lesen nur aus CACHE, schreiben nur solange CACHE existiert und innerhalb des Events.

const CACHE = "koch-v2.15c-1";

// Bewusst NICHT im SHELL: add.html (Freundes-Seite des I3-Freunde-Links). Sie wird von Freunden
// ohne App geöffnet und braucht ohnehin Netz (Supabase); wird sie hier im Scope geladen, landet sie
// nur über den normalen Laufzeit-Cache unten im Cache (RC-01).
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
  "./src/data/decideSync.js",
  "./src/data/syncCore.js",
  "./src/data/syncRules.js",
  "./src/data/recipeMerge.js",
  "./src/data/listFile.js",
  "./src/data/baseLang.js",
  "./src/ui/sheet.js",
  "./src/ui/helpers.js",
  "./src/ui/tabs.js",
  "./src/ui/tabbar.js",
  "./src/features/menu.js",
  "./src/features/cookbook/cookbook.js",
  "./src/features/cookbook/filter.js",
  "./src/features/cookbook/detail.js",
  "./src/features/cookbook/form.js",
  "./src/features/cookbook/export.js",
  "./src/features/cooking/cooking.js",
  "./src/features/match/match.js",
  "./src/data/catalog.js",
  "./src/features/shopping/logic.js",
  "./src/features/shopping/shopping.js",
  "./src/features/shopping/listMerge.js",
  "./src/data/listSync.js",
  "./src/data/supabase.js",
  "./src/data/friendInbox.js",
  "./src/features/shopping/friendMerge.js",
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
  "./data/rezepte.snapshot.da.json",
  "./data/rezepte.snapshot.es.json",
  "./data/rezepte.snapshot.en.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Bei der Aktivierung gelöschte Caches der Vorgänger. Ein Worker bis v2.15b kann seinen noch kurz
// danach wieder anlegen (s. o., 2.) — beim nächsten Öffnen wird er erneut entfernt. Nur diese
// Namen, nie „alles außer CACHE“: sonst träfe es den Cache eines gerade installierenden Nachfolgers.
let retired = [];

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => { retired = keys.filter((k) => k !== CACHE); return Promise.all(retired.map((k) => caches.delete(k))); })
      .then(() => self.clients.claim())
  );
});

/** Nur aus dem eigenen Cache — nie aus dem eines anderen Builds. */
const fromCache = (req) => caches.match(req, { cacheName: CACHE });

/** In den eigenen Cache legen — aber nur, solange es ihn gibt: ein abgelöster Worker legt den
 *  Cache, den sein Nachfolger gerade gelöscht hat, nicht wieder an. */
const store = (req, res) =>
  caches.has(CACHE).then((ok) => ok && caches.open(CACHE).then((c) => c.put(req, res))).catch(() => {});

/** Aus dem Netz holen und ablegen — innerhalb der Lebenszeit des Events (waitUntil), damit der
 *  Browser einen Nachfolger erst aktiviert, wenn das Schreiben durch ist. */
const fetchAndStore = (e, req, keep = (res) => res.ok) =>
  fetch(req).then((res) => {
    if (keep(res)) e.waitUntil(store(req, res.clone()));
    return res;
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

  // Fonts: cache-first (offline-Typo); auch opake Antworten (Stylesheet ohne CORS) ablegen.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(fromCache(req).then((hit) => hit || fetchAndStore(e, req, (res) => res.ok || res.type === "opaque")));
    return;
  }

  // Nur eigener Scope ab hier
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");

  if (isHTML) {
    // Überbleibsel alter Caches wegräumen — nicht während ein Update installiert.
    if (retired.length && !self.registration.installing && !self.registration.waiting) {
      e.waitUntil(Promise.all(retired.map((k) => caches.delete(k))).catch(() => {}));
    }
    // Network-first: immer den neuesten Build holen, Cache nur offline.
    e.respondWith(
      fetchAndStore(e, req).catch(() => fromCache(req).then((r) => r || fromCache("./index.html")))
    );
  } else {
    // Assets: cache-first aus dem eigenen Cache. Neue Versionen bringt allein der nächste Worker
    // (s. o.); nicht Vorgecachtes (z. B. add.html-Ressourcen) wird beim ersten Abruf abgelegt.
    e.respondWith(fromCache(req).then((hit) => hit || fetchAndStore(e, req)));
  }
});
