// sync.js — Lokal-first Abgleich IndexedDB <-> Drive.
// Ablauf (01_ARCHITECTURE §5):
//  1. Start: Rezepte SOFORT aus IndexedDB (offline, instant).
//     Leere DB → gebündelter Snapshot (data/rezepte.snapshot.json) als Erstbefüllung.
//  2. Online + angemeldet: Drive im Hintergrund lesen, Last-Write-Wins über `updated`.
//  3. Speichern: erst IndexedDB (instant), dann Drive-Push (in place); offline → dirty-Flag,
//     Push beim nächsten Sync.

import * as db from "./db.js";
import * as drive from "./drive.js";
import { loadCollection, toFileString } from "./migrate.js";

const META_KEY = "collection";       // { version, updated, fileId, dirty, lastSync, source }
const SNAPSHOT_URL = new URL("../../data/rezepte.snapshot.json", import.meta.url);

let statusListeners = new Set();
let status = "";

export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(msg) { status = msg; for (const fn of statusListeners) fn(msg); }
export function getStatus() { return status; }

/** Rezepte + Meta aus IndexedDB laden; leere DB wird aus dem Snapshot befüllt. */
export async function loadLocal() {
  let recipes = await db.getAll("recipes");
  let meta = await db.kvGet(META_KEY, null);

  if (!recipes.length) {
    try {
      const res = await fetch(SNAPSHOT_URL);
      const json = await res.json();
      const { collection, report } = loadCollection(json);
      if (report.errors.length) console.warn("Snapshot-Validierung:", report.errors);
      await db.replaceAll("recipes", collection.recipes);
      meta = { version: collection.version, updated: collection.updated, fileId: null, dirty: false, lastSync: null, source: "snapshot" };
      await db.kvSet(META_KEY, meta);
      recipes = collection.recipes;
    } catch (e) {
      console.warn("Kein Snapshot ladbar:", e);
      meta = meta || { version: 3, updated: null, fileId: null, dirty: false, lastSync: null, source: "empty" };
    }
  }
  return { recipes, meta };
}

/**
 * Hintergrund-Sync mit Drive. Gibt {changed, recipes, meta} zurück.
 * Last-Write-Wins: neuere `updated`-Marke gewinnt. Lokale dirty-Änderungen
 * werden gepusht, wenn lokal neuer (oder Remote unverändert seit lastSync).
 */
export async function syncWithDrive() {
  if (!drive.isSignedIn()) return { changed: false };
  setStatus("Verbinde mit Drive…");

  let meta = await db.kvGet(META_KEY, {});
  let fileId = meta.fileId;
  try {
    if (!fileId) fileId = await drive.findFile();

    if (!fileId) {
      // Echter Erstlauf dieses Kontos: lokale Daten (Snapshot) hochladen.
      const recipes = await db.getAll("recipes");
      const content = toFileString({ updated: meta.updated, recipes }, { setUpdated: true });
      fileId = await drive.createFile(content);
      meta = { ...meta, fileId, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: false, meta };
    }

    const remote = await drive.readFile(fileId);
    const { collection, report } = loadCollection(remote);
    if (report.errors.length) console.warn("Drive-Validierung:", report.errors);

    const remoteUpdated = collection.updated || "";
    const localUpdated = meta.updated || "";

    if (meta.dirty && localUpdated > remoteUpdated) {
      // Lokal neuer → pushen (in place)
      const recipes = await db.getAll("recipes");
      const content = toFileString({ updated: localUpdated, recipes });
      await drive.updateFile(fileId, content);
      meta = { ...meta, fileId, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: false, meta };
    }

    if (remoteUpdated !== localUpdated || meta.source !== "drive") {
      // Remote gewinnt (neuer oder erstes echtes Drive-Laden)
      await db.replaceAll("recipes", collection.recipes);
      meta = { version: collection.version, updated: collection.updated, fileId, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: true, recipes: collection.recipes, meta };
    }

    meta = { ...meta, fileId, lastSync: new Date().toISOString() };
    await db.kvSet(META_KEY, meta);
    setStatus("Synchronisiert ✓");
    return { changed: false, meta };
  } catch (e) {
    console.warn("Sync fehlgeschlagen:", e);
    setStatus(e.status === 401 ? "Anmeldung abgelaufen" : "Offline — lokale Daten");
    return { changed: false, error: e };
  }
}

/**
 * Sammlung speichern: IndexedDB sofort, Drive-Push im Hintergrund (wenn möglich).
 * recipes = vollständiges Array (Quelle der Wahrheit im Speicher).
 */
export async function saveCollection(recipes) {
  const updated = new Date().toISOString();
  await db.replaceAll("recipes", recipes);
  let meta = await db.kvGet(META_KEY, {});
  meta = { ...meta, updated, dirty: true };
  await db.kvSet(META_KEY, meta);

  if (drive.isSignedIn() && navigator.onLine !== false) {
    setStatus("Speichere…");
    try {
      let fileId = meta.fileId || await drive.findFile();
      const content = toFileString({ updated, recipes });
      if (fileId) await drive.updateFile(fileId, content);
      else fileId = await drive.createFile(content);
      meta = { ...meta, fileId, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
    } catch (e) {
      console.warn("Drive-Push fehlgeschlagen (bleibt dirty):", e);
      setStatus("Lokal gespeichert — Sync ausstehend");
    }
  } else {
    setStatus("Lokal gespeichert");
  }
  return meta;
}
