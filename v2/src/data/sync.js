// sync.js — Lokal-first Abgleich IndexedDB <-> Drive für die Rezepte.
// Seit v2.15 (P1) nur noch Konfiguration: der Ablauf steckt im Sync-Kern (syncCore.js), die
// Last-Write-Wins-Regel in syncRules.js. Ablauf (01_ARCHITECTURE §5):
//  1. Start: Rezepte SOFORT aus IndexedDB (offline, instant).
//     Leere DB → gebündelter Snapshot (data/rezepte.snapshot.json) als Erstbefüllung.
//  2. Online + angemeldet: Drive im Hintergrund lesen, Last-Write-Wins über `updated`.
//  3. Speichern: erst IndexedDB (instant), dann Drive-Push (in place); offline → dirty-Flag,
//     Push beim nächsten Sync.

import * as db from "./db.js";
import * as drive from "./drive.js";
import { loadCollection } from "./migrate.js";
import { createSyncEngine } from "./syncCore.js";
import { lastWriteWins, pushCollection, RECIPE_STATUS } from "./syncRules.js";

const META_KEY = "collection";       // { version, updated, fileId, dirty, lastSync, source }
const SNAPSHOT_URL = new URL("../../data/rezepte.snapshot.json", import.meta.url);

function langSnapshotUrl(lang) {
  return new URL(`../../data/rezepte.snapshot.${lang}.json`, import.meta.url);
}

/**
 * Lädt die ÜBERSETZTEN Basis-Rezepte einer Sprache (reine Anzeige-Quelle).
 * de oder fehlende Datei → null (Aufrufer nutzt dann das deutsche Original).
 * Schreibt NICHTS — der deutsche Snapshot bleibt die kanonische Quelle.
 */
export async function fetchLangRecipes(lang) {
  if (!lang || lang === "de") return null;
  try {
    const res = await fetch(langSnapshotUrl(lang));
    if (!res.ok) return null;
    const json = await res.json();
    const { collection } = loadCollection(json);
    return collection.recipes;
  } catch (e) {
    console.warn("Sprach-Snapshot nicht ladbar:", lang, e);
    return null;
  }
}

const engine = createSyncEngine({
  name: "rezepte",
  metaKey: META_KEY,
  fileName: "rezepte.json",
  drive,
  kv: { get: db.kvGet, update: db.kvUpdate },
  // Bekannte Datei-ID zuerst, dann Namenssuche (drive.findFile). Nie ein Duplikat anlegen.
  locate: async () => { const id = await drive.findFile(); return id ? { fileId: id } : null; },
  rule: lastWriteWins({ store: { readAll: () => db.getAll("recipes"), replaceAll: (r) => db.replaceAll("recipes", r) } }),
});

export const onStatus = engine.onStatus;
export const getStatus = engine.getStatus;

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
 * Hintergrund-Sync mit Drive. Gibt {changed, recipes?, meta, conflict?, error?} zurück.
 * Last-Write-Wins über `updated` (decideSync, K2): Regel in syncRules.js, Ablauf im Sync-Kern.
 */
export function syncWithDrive() {
  return engine.sync();
}

/**
 * Sammlung speichern: IndexedDB sofort, Drive-Push danach — in der Warteschlange des Sync-Kerns,
 * also nie mitten in einen laufenden Abgleich hinein. recipes = vollständiges Array.
 */
export async function saveCollection(recipes) {
  const updated = new Date().toISOString();
  await db.replaceAll("recipes", recipes);
  const meta = await engine.patchMeta({ updated, dirty: true });

  if (!(drive.isSignedIn() && engine.isOnline())) {
    engine.setStatus(RECIPE_STATUS.savedLocal);
    return meta;
  }
  return engine.run(pushCollection({ updated, recipes }));
}
