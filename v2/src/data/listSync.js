// listSync.js — Lokal-first Abgleich IndexedDB <-> Drive für die Einkaufsliste.
// Spiegelt sync.js exakt — gleicher Aufbau, angepasst für die Einkaufsliste.
// Die Rezept-Datei wird hier NIEMALS berührt: createFile() immer mit LIST_FILE_NAME.
// I2 + I3A: Konflikte werden per item-level merge (mergeList) aufgelöst, nie übersprungen.

import * as db from "./db.js";
import * as drive from "./drive.js";
import { decideSync } from "./decideSync.js";
import { mergeList } from "../features/shopping/listMerge.js";

const META_KEY = "listMeta";           // { fileId, updated, dirty, lastSync, source, linked }
const LIST_FILE_NAME = "einkaufsliste.json";
const LIST_DB_ID = "current";          // IndexedDB "lists" store key

let statusListeners = new Set();
let status = "";
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(msg) { status = msg; for (const fn of statusListeners) fn(msg); }
export function getStatus() { return status; }

/** Lädt die lokale Liste aus IndexedDB. Führt eine Einmal-Migration durch:
 *  Items ohne id-Feld bekommen eine stabile id zugewiesen. */
async function loadLocalList() {
  const row = await db.get("lists", LIST_DB_ID);
  let items = row && Array.isArray(row.items) ? row.items : [];
  let migrated = false;
  items = items.map((it, i) => {
    if (!it.id) {
      migrated = true;
      return { ...it, id: "li-" + (Date.now() + i), updated: new Date().toISOString(), author: "local", deleted: false };
    }
    return it;
  });
  if (migrated) await db.put("lists", { id: LIST_DB_ID, items, updated: new Date().toISOString() });
  return items;
}

/**
 * Hintergrund-Sync mit Drive. Gibt {changed, items?, meta} zurück.
 * Konflikte werden durch item-level merge aufgelöst (nicht bewahrt wie bei Rezepten).
 */
export async function syncListWithDrive() {
  if (!drive.isSignedIn()) return { changed: false };
  setStatus("Verbinde mit Drive…");

  let meta = await db.kvGet(META_KEY, {});
  let fileId = meta.fileId;
  try {
    if (!fileId) {
      // Erstlauf: lokale Liste als einkaufsliste.json anlegen
      const items = await loadLocalList();
      const updated = new Date().toISOString();
      const content = JSON.stringify({ version: 1, updated, items });
      fileId = await drive.createFile(content, LIST_FILE_NAME);
      meta = { ...meta, fileId, dirty: false, updated, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: false, meta };
    }

    const remote = await drive.readFile(fileId);
    const action = decideSync({
      hasRemote: true,
      localUpdated: meta.updated || "",
      remoteUpdated: remote.updated || "",
      dirty: meta.dirty || false,
      source: meta.source || "local",
    });

    if (action === "push") {
      const items = await loadLocalList();
      const updated = new Date().toISOString();
      await drive.updateFile(fileId, JSON.stringify({ version: 1, updated, items }));
      meta = { ...meta, fileId, dirty: false, updated, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: false, meta };
    }

    if (action === "pull" || action === "conflict") {
      // Für die Liste: Konflikt wird per item-level merge aufgelöst (nicht bewahrt)
      const localItems = await loadLocalList();
      const merged = mergeList(localItems, remote.items || []);
      const updated = remote.updated || new Date().toISOString();
      await db.put("lists", { id: LIST_DB_ID, items: merged, updated });
      meta = { ...meta, fileId, updated, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      // Merge-Ergebnis zurück zu Drive pushen, damit Partner die Union sieht
      await drive.updateFile(fileId, JSON.stringify({ version: 1, updated: new Date().toISOString(), items: merged }));
      setStatus("Synchronisiert ✓");
      return { changed: true, items: merged, meta };
    }

    // action === "noop"
    meta = { ...meta, fileId, lastSync: new Date().toISOString() };
    await db.kvSet(META_KEY, meta);
    setStatus("Synchronisiert ✓");
    return { changed: false, meta };
  } catch (e) {
    console.warn("Listen-Sync fehlgeschlagen:", e);
    setStatus(e.status === 401 ? "Anmeldung abgelaufen" : "Offline — lokale Daten");
    return { changed: false, error: e };
  }
}

/**
 * Liste speichern: IndexedDB sofort, Drive-Push im Hintergrund (wenn möglich).
 * Setzt dirty:true on failure — Push beim nächsten syncListWithDrive().
 */
export async function saveList(items) {
  const updated = new Date().toISOString();
  await db.put("lists", { id: LIST_DB_ID, items, updated });
  let meta = await db.kvGet(META_KEY, {});
  meta = { ...meta, updated, dirty: true };
  await db.kvSet(META_KEY, meta);

  if (drive.isSignedIn() && navigator.onLine !== false) {
    try {
      const fileId = meta.fileId;
      if (fileId) {
        await drive.updateFile(fileId, JSON.stringify({ version: 1, updated, items }));
        meta = { ...meta, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
        await db.kvSet(META_KEY, meta);
      }
    } catch (e) {
      console.warn("Drive-Push fehlgeschlagen (bleibt dirty):", e);
    }
  }
  return meta;
}
