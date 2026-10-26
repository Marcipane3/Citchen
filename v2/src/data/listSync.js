// listSync.js — Lokal-first Abgleich IndexedDB <-> Drive für die Einkaufsliste.
// Die Rezept-Datei wird hier NIEMALS berührt: der Sync-Kern legt nur LIST_FILE_NAME an.
//
// Modell (I2 + I3A, überarbeitet v2.11): JEDER Sync liest die Drive-Datei, mischt sie
// item-weise mit der lokalen Liste (mergeList = Union + neuestes `updated` pro Item) und
// schreibt nur dorthin zurück, wo sich etwas geändert hat (CR-02).
// Seit v2.15 (P1): Ablauf im Sync-Kern (syncCore.js), Merge-Regel in syncRules.js (itemMerge).
// Speichern = lokal sofort + gebündelter (debounced) Sync, damit nie blind überschrieben wird.
// Partner verbinden/trennen läuft in der Warteschlange des Kerns — nie mehr mitten in einen
// laufenden Abgleich (P2-Fund: die Verbindung ging dabei still verloren).

import * as db from "./db.js";
import * as drive from "./drive.js";
import { createSyncEngine } from "./syncCore.js";
import { itemMerge } from "./syncRules.js";
import { ensureItemMeta, adoptLegacy, countOpen, mergeList, sameItems } from "../features/shopping/listMerge.js";
import { applyFriendBatch } from "../features/shopping/friendMerge.js";

const META_KEY = "listMeta";           // { fileId, ownFileId, linked, dirty, lastSync, syncedFile }
const LIST_FILE_NAME = "einkaufsliste.json";
const LIST_DB_ID = "current";          // IndexedDB "lists" store key
const PUSH_DELAY = 1200;               // ms — bündelt schnelle Taps (+/+/+) zu einem Drive-Schreibvorgang

/* ---------- T9: dieses Gerät + „Neu seit deinem letzten Besuch“ ---------- */

const DEVICE_KEY = "deviceId";
const NEWS_KEY = "listNews";            // [{ name, who, at }] — who: "friend:Anna" | "friend" | "other"
const NEWS_MAX = 30;
let deviceIdCache = null;

/** Zufällige, dauerhafte Kennung dieses Geräts (nur für „von anderem Gerät“ in der Liste). */
export async function deviceId() {
  if (deviceIdCache) return deviceIdCache;
  const id = await db.kvUpdate(DEVICE_KEY, (cur) => cur || "d-" + Math.random().toString(36).slice(2, 10), null);
  deviceIdCache = id;
  return id;
}

const newsListeners = new Set();
export function onNews(fn) { newsListeners.add(fn); return () => newsListeners.delete(fn); }
export const getNews = () => db.kvGet(NEWS_KEY, []);
export async function clearNews() { await db.kvSet(NEWS_KEY, []); for (const fn of newsListeners) fn([]); }

/** Neues von außen merken (Freunde-Import, Partner-Abgleich) — bleibt, bis du die Liste ansiehst. */
export async function addNews(entries) {
  if (!entries.length) return;
  const all = await db.kvUpdate(NEWS_KEY, (cur) => [...(cur || []), ...entries].slice(-NEWS_MAX), []);
  for (const fn of newsListeners) fn(all);
}

const changeListeners = new Set();
export function onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }

// J2: Anzahl offener Artikel für das 🛒-Badge der Tab-Leiste (bei jedem Speichern + Partner-Sync).
const countListeners = new Set();
export function onCount(fn) { countListeners.add(fn); return () => countListeners.delete(fn); }
function emitCount(items) { const n = countOpen(items); for (const fn of countListeners) fn(n); }
export async function getOpenCount() { return countOpen(await loadLocalList()); }

// I3: jede gespeicherte/abgeglichene Liste → Freunde-Schaufenster (friendInbox.js hört hier zu).
const savedListeners = new Set();
export function onSaved(fn) { savedListeners.add(fn); return () => savedListeners.delete(fn); }
function emitSaved(items) { for (const fn of savedListeners) { try { fn(items); } catch (e) { /* egal */ } } }

/**
 * Lokale Liste aus IndexedDB; fehlende Sync-Felder werden einmalig ergänzt.
 * T4: Ein Artikel ohne id kann hier nur noch Altbestand von Drive sein (ein früherer Abgleich hat
 * ihn so gespeichert; die UI vergibt ids beim Speichern) → stabile id statt bei jedem Laden einer
 * neuen Zufalls-id (die war eine Zeile mehr pro Sync, FR-01).
 */
async function loadLocalList() {
  const row = await db.get("lists", LIST_DB_ID);
  const raw = row && Array.isArray(row.items) ? row.items : [];
  const items = ensureItemMeta(adoptLegacy(raw));
  if (items.some((it, i) => it !== raw[i])) await db.put("lists", { ...(row || {}), id: LIST_DB_ID, items, updated: new Date().toISOString() });
  return items;
}

/** Gespeicherte Liste eines IndexedDB-Datensatzes, mit Sync-Feldern (wie loadLocalList, ohne Schreiben). */
const itemsOf = (row, now) => ensureItemMeta(adoptLegacy(row && Array.isArray(row.items) ? row.items : []), now);

/**
 * AR-10: EIN Weg, die Liste zu ändern — atomar in IndexedDB (lesen + mischen + schreiben in einer
 * Transaktion). So überschreiben sich Antippen, Partner-Abgleich und Freunde-Import nie gegenseitig.
 * fn(aktuelleArtikel) → neue Artikel. Gibt die gespeicherten Artikel zurück.
 */
async function mutateList(fn, now = new Date().toISOString()) {
  // Andere Felder des Datensatzes (z. B. friendSeen, DG-12) bleiben erhalten.
  const row = await db.update("lists", LIST_DB_ID, (cur) => ({ ...(cur || {}), id: LIST_DB_ID, items: fn(itemsOf(cur, now)), updated: now }));
  return row.items;
}

/**
 * T9: `by` (Gerät, das die Zeile angelegt hat) erhalten bzw. für neue Zeilen setzen. Die Ansicht kennt
 * die Kennung nicht — sie wird hier beim Speichern ergänzt und von gespeicherten Zeilen übernommen.
 */
function stampBy(mine, current, dev) {
  const byId = new Map(current.map((x) => [x.id, x]));
  return mine.map((it) => {
    if (it.by) return it;
    const cur = byId.get(it.id);
    if (cur) return cur.by ? { ...it, by: cur.by } : it;
    return dev ? { ...it, by: dev } : it;
  });
}

/** T9: Was ein Abgleich NEU auf die Liste gebracht hat (nicht von diesem Gerät) → News. */
function newsFromMerge(final, before, dev) {
  const had = new Set(before.map((x) => x.id));
  const at = new Date().toISOString();
  return final
    .filter((x) => !x.deleted && !had.has(x.id) && !(x.by && x.by === dev))
    .map((x) => ({ name: x.name, who: typeof x.author === "string" && x.author.startsWith("friend") ? x.author : "other", at }));
}

/** Aktuelle lokale Liste (inkl. Tombstones) — für das Freunde-Schaufenster. */
export function getList() { return loadLocalList(); }

const engine = createSyncEngine({
  name: "einkaufsliste",
  metaKey: META_KEY,
  fileName: LIST_FILE_NAME,
  drive,
  kv: { get: db.kvGet, update: db.kvUpdate },
  // Zweites Gerät desselben Kontos? Dann existiert die Datei schon → wiederverwenden statt Duplikat.
  // Nur EIGENE Dateien — die geteilte eines Partners kommt ausschließlich über linkToFile (Picker).
  locate: async () => {
    const id = await drive.findOwnFileByName(LIST_FILE_NAME);
    return id ? { fileId: id, meta: { ownFileId: id, linked: false } } : null;
  },
  rule: itemMerge({
    store: {
      readAll: loadLocalList,
      write: (items, now) => mutateList(() => items, now),
      update: (fn, now) => mutateList(fn, now), // AR-10: Abgleich mischt atomar ein
    },
    onMerged: (items, { before = [] } = {}) => {
      for (const fn of changeListeners) fn(items);
      emitCount(items); emitSaved(items);
      deviceId().then((dev) => addNews(newsFromMerge(items, before, dev))).catch(() => {});
    },
    onDirty: () => engine.schedule(PUSH_DELAY),
  }),
});

// Status als Code — die UI übersetzt ihn (i18n). "local" = nicht angemeldet.
export const onStatus = engine.onStatus;
export const getStatus = engine.getStatus;
export const getMeta = engine.getMeta;

/**
 * Sync mit Drive. Gibt {changed, items?, meta?, error?} zurück. Gleichzeitige Aufrufe teilen
 * sich denselben Lauf (WR-03: kein doppeltes Anlegen der Datei bei parallelem Start).
 */
export function syncListWithDrive() {
  return engine.sync();
}

/**
 * Liste speichern: IndexedDB sofort, Drive-Abgleich gebündelt im Hintergrund.
 * Bleibt dirty, bis ein Sync durchläuft (offline → beim nächsten Online-Sync).
 * AR-10: gespeichert wird per Merge (neuestes `updated` pro Artikel), nicht als Überschreiben —
 * hat ein Abgleich inzwischen etwas eingemischt, das die Ansicht noch nicht kannte, bleibt es,
 * und die Ansicht bekommt den gemischten Stand über onChange. Gibt die gespeicherten Artikel zurück.
 */
export async function saveList(items) {
  const now = new Date().toISOString();
  const dev = await deviceId().catch(() => "");
  const mine = ensureItemMeta(items, now);
  const saved = await mutateList((current) => mergeList(current, stampBy(mine, current, dev)), now);
  emitCount(saved);
  emitSaved(saved);
  if (!sameItems(saved, mine)) for (const fn of changeListeners) fn(saved);
  await engine.patchMeta({ dirty: true });
  if (drive.isSignedIn() && engine.isOnline()) engine.schedule(PUSH_DELAY);
  return saved;
}

/**
 * I3 + DG-12 (v2.15b): Freundes-Vorschläge übernehmen — Artikel und „schon übernommen“-ids in EINER
 * IndexedDB-Transaktion (friendMerge.applyFriendBatch). Danach wie jede Änderung: Badge, Schaufenster,
 * offene Ansicht, Drive-Abgleich. seenFallback = altes `seen` aus dem kv (nur beim ersten Mal nach dem Update).
 * → { added, fresh, seen }
 */
export async function applyFriendSuggestions(pulled, { seenFallback = [] } = {}) {
  const now = new Date().toISOString();
  const dev = await deviceId().catch(() => "");
  let out = null;
  const row = await db.update("lists", LIST_DB_ID, (cur) => {
    const items = itemsOf(cur, now);
    out = applyFriendBatch({ ...(cur || {}), items }, pulled, { now, seenFallback });
    const next = out.added ? stampBy(ensureItemMeta(out.row.items, now), items, dev) : items;
    return { ...out.row, id: LIST_DB_ID, items: next, updated: now };
  });
  if (out.added) {
    emitCount(row.items);
    emitSaved(row.items);
    for (const fn of changeListeners) fn(row.items);
    await engine.patchMeta({ dirty: true });
    if (drive.isSignedIn() && engine.isOnline()) engine.schedule(PUSH_DELAY);
  }
  return { added: out.added, fresh: out.fresh, seen: out.row.friendSeen };
}

/** Mit der geteilten Liste eines Partners verbinden (fileId kommt aus dem Google Picker). */
export function linkToFile(fileId) {
  return engine.retarget((m) => ({ ownFileId: m.ownFileId || m.fileId || null, fileId, linked: true }));
}

/** Verbindung trennen → zurück zur eigenen Datei (deine Liste behält die aktuellen Artikel). */
export function unlink() {
  return engine.retarget((m) => ({ fileId: m.ownFileId || null, linked: false }));
}

if (typeof window !== "undefined") {
  // Wieder online → ausstehende Änderungen nachschieben.
  window.addEventListener("online", () => { getMeta().then((m) => { if (m.dirty) syncListWithDrive(); }).catch(() => {}); });
}
