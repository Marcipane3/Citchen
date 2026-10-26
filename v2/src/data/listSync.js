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

const META_KEY = "listMeta";           // { fileId, ownFileId, linked, dirty, lastSync, syncedFile }
const LIST_FILE_NAME = "einkaufsliste.json";
const LIST_DB_ID = "current";          // IndexedDB "lists" store key
const PUSH_DELAY = 1200;               // ms — bündelt schnelle Taps (+/+/+) zu einem Drive-Schreibvorgang

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
  if (items.some((it, i) => it !== raw[i])) await db.put("lists", { id: LIST_DB_ID, items, updated: new Date().toISOString() });
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
  const row = await db.update("lists", LIST_DB_ID, (cur) => ({ id: LIST_DB_ID, items: fn(itemsOf(cur, now)), updated: now }));
  return row.items;
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
      write: (items, now) => db.put("lists", { id: LIST_DB_ID, items, updated: now }),
      update: (fn, now) => mutateList(fn, now), // AR-10: Abgleich mischt atomar ein
    },
    onMerged: (items) => { for (const fn of changeListeners) fn(items); emitCount(items); emitSaved(items); },
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
  const mine = ensureItemMeta(items, now);
  const saved = await mutateList((current) => mergeList(current, mine), now);
  emitCount(saved);
  emitSaved(saved);
  if (!sameItems(saved, mine)) for (const fn of changeListeners) fn(saved);
  await engine.patchMeta({ dirty: true });
  if (drive.isSignedIn() && engine.isOnline()) engine.schedule(PUSH_DELAY);
  return saved;
}

/**
 * I3: Änderung von außen (Freundes-Artikel) auf die lokale Liste anwenden. `fn(items)` gibt die
 * neue Liste zurück (oder null = nichts zu tun). Gespeichert wird wie jede Änderung über saveList
 * → Drive → Partner; offene Ansichten bekommen onChange.
 */
export async function applyExternal(fn) {
  const items = await loadLocalList();
  const next = fn(items);
  if (!next) return items;
  const saved = await saveList(next);
  for (const l of changeListeners) l(saved);
  return saved;
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
