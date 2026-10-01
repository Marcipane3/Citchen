// listSync.js — Lokal-first Abgleich IndexedDB <-> Drive für die Einkaufsliste.
// Die Rezept-Datei wird hier NIEMALS berührt: createFile() immer mit LIST_FILE_NAME.
//
// Modell (I2 + I3A, überarbeitet v2.11): JEDER Sync liest die Drive-Datei, mischt sie
// item-weise mit der lokalen Liste (mergeList = Union + neuestes `updated` pro Item) und
// schreibt nur dorthin zurück, wo sich etwas geändert hat. Es gibt keinen Datei-Zeitstempel-
// Vergleich mehr — der war die Ursache von CR-02 (lokal alte Marke gespeichert, auf Drive eine
// neue geschrieben → jeder Sync sah „Remote ist neuer“ und lud/schrieb erneut).
// Speichern = lokal sofort + gebündelter (debounced) Sync, damit nie blind überschrieben wird.

import * as db from "./db.js";
import * as drive from "./drive.js";
import { mergeList, ensureItemMeta, sameItems, syncStep } from "../features/shopping/listMerge.js";

const META_KEY = "listMeta";           // { fileId, ownFileId, linked, dirty, lastSync }
const LIST_FILE_NAME = "einkaufsliste.json";
const LIST_DB_ID = "current";          // IndexedDB "lists" store key
const PUSH_DELAY = 1200;               // ms — bündelt schnelle Taps (+/+/+) zu einem Drive-Schreibvorgang

// Status als Code — die UI übersetzt ihn (i18n). "local" = nicht angemeldet.
let status = "local";
const statusListeners = new Set();
const changeListeners = new Set();
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
export function onChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
export function getStatus() { return status; }
function setStatus(s) { status = s; for (const fn of statusListeners) fn(s); }

export async function getMeta() { return db.kvGet(META_KEY, {}); }

/** Lokale Liste aus IndexedDB; fehlende Sync-Felder werden einmalig ergänzt. */
async function loadLocalList() {
  const row = await db.get("lists", LIST_DB_ID);
  const raw = row && Array.isArray(row.items) ? row.items : [];
  const items = ensureItemMeta(raw);
  if (items.some((it, i) => it !== raw[i])) await db.put("lists", { id: LIST_DB_ID, items, updated: new Date().toISOString() });
  return items;
}

let inflight = null;
let pushTimer = null;

/**
 * Sync mit Drive. Gibt {changed, items?, meta?, error?} zurück. Gleichzeitige Aufrufe teilen
 * sich denselben Lauf (WR-03: kein doppeltes Anlegen der Datei bei parallelem Start).
 */
export function syncListWithDrive() {
  if (!drive.isSignedIn()) { setStatus("local"); return Promise.resolve({ changed: false }); }
  if (inflight) return inflight;
  inflight = doSync().finally(() => { inflight = null; });
  return inflight;
}

async function doSync() {
  setStatus("syncing");
  let meta = await getMeta();
  // Altbestand (≤ v2.10): eigene Datei-ID noch nicht separat gemerkt.
  if (meta.fileId && !meta.linked && !meta.ownFileId) meta = { ...meta, ownFileId: meta.fileId };
  try {
    const local = await loadLocalList();
    let fileId = meta.fileId;

    if (!fileId) {
      // Zweites Gerät desselben Kontos? Dann existiert die Datei schon → wiederverwenden statt Duplikat.
      fileId = await drive.findOwnFileByName(LIST_FILE_NAME);
      if (!fileId) {
        const now = new Date().toISOString();
        fileId = await drive.createFile(JSON.stringify({ version: 1, updated: now, items: local }), LIST_FILE_NAME);
        meta = { ...meta, fileId, ownFileId: fileId, linked: false, dirty: false, lastSync: now };
        await db.kvSet(META_KEY, meta);
        setStatus("synced");
        return { changed: false, items: local, meta };
      }
      meta = { ...meta, fileId, ownFileId: fileId, linked: false };
    }

    const remote = await drive.readFile(fileId);
    const remoteItems = remote && Array.isArray(remote.items) ? remote.items : [];
    const now = new Date().toISOString();
    const { merged, writeRemote } = syncStep(local, remoteItems, now);

    // Ein einziger Zeitstempel für Datei UND Meta (CR-02); geschrieben wird nur bei Änderung.
    if (writeRemote) {
      await drive.updateFile(fileId, JSON.stringify({ version: 1, updated: now, items: merged }));
    }

    // Während des Netzwerk-Roundtrips kann lokal getippt worden sein → nochmal einmischen.
    const latest = await loadLocalList();
    const final = mergeList(merged, latest);
    const localChanged = !sameItems(local, final) || !sameItems(latest, final);
    if (localChanged) await db.put("lists", { id: LIST_DB_ID, items: final, updated: now });
    const stillDirty = !sameItems(final, merged);

    meta = { ...meta, fileId, dirty: stillDirty, lastSync: now };
    await db.kvSet(META_KEY, meta);
    setStatus("synced");
    if (localChanged) for (const fn of changeListeners) fn(final);
    if (stillDirty) schedulePush();
    return { changed: localChanged, items: final, meta };
  } catch (e) {
    console.warn("Listen-Sync fehlgeschlagen:", e);
    setStatus(e.status === 401 ? "auth"
      : (e.status === 404 || e.status === 403) ? "notFound"
      : (typeof navigator !== "undefined" && navigator.onLine === false) ? "offline" : "error");
    return { changed: false, error: e };
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; syncListWithDrive(); }, PUSH_DELAY);
}

/**
 * Liste speichern: IndexedDB sofort, Drive-Abgleich gebündelt im Hintergrund.
 * Bleibt dirty, bis ein Sync durchläuft (offline → beim nächsten Online-Sync).
 */
export async function saveList(items) {
  const now = new Date().toISOString();
  await db.put("lists", { id: LIST_DB_ID, items: ensureItemMeta(items, now), updated: now });
  const meta = await getMeta();
  await db.kvSet(META_KEY, { ...meta, dirty: true });
  if (drive.isSignedIn() && (typeof navigator === "undefined" || navigator.onLine !== false)) schedulePush();
}

/** Mit der geteilten Liste eines Partners verbinden (fileId kommt aus dem Google Picker). */
export async function linkToFile(fileId) {
  const meta = await getMeta();
  await db.kvSet(META_KEY, { ...meta, ownFileId: meta.ownFileId || meta.fileId || null, fileId, linked: true });
  return syncListWithDrive();
}

/** Verbindung trennen → zurück zur eigenen Datei (deine Liste behält die aktuellen Artikel). */
export async function unlink() {
  const meta = await getMeta();
  await db.kvSet(META_KEY, { ...meta, fileId: meta.ownFileId || null, linked: false });
  return syncListWithDrive();
}

if (typeof window !== "undefined") {
  // Wieder online → ausstehende Änderungen nachschieben.
  window.addEventListener("online", () => { getMeta().then((m) => { if (m.dirty) syncListWithDrive(); }).catch(() => {}); });
}
