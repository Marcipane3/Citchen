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
import { recipeSync, RECIPE_STATUS } from "./syncRules.js";
import { t } from "../i18n.js";

const META_KEY = "collection";       // { version, updated, fileId, dirty, lastSync, source }
const BASE_KEY = "recipesBase";      // T1: letzter mit Drive geeinigter Stand (Basis für den Drei-Wege-Merge)
const BACKUP_KEY = "recipesBackup";  // T2: eine Sicherung des lokalen Stands, bevor ein Abgleich ihn ersetzt
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
  rule: recipeSync({
    store: {
      readAll: () => db.getAll("recipes"),
      replaceAll: (r) => db.replaceAll("recipes", r),
      getBase: () => db.kvGet(BASE_KEY, null),
      setBase: (r) => db.kvSet(BASE_KEY, r),
      backup: (r) => db.kvSet(BACKUP_KEY, { at: new Date().toISOString(), recipes: r }),
    },
    // T2: würde Drive auffällig viele Rezepte löschen → fragen statt still übernehmen.
    approveDrop: async ({ count, total }) => typeof confirm === "function" && confirm(t("sync.confirmDrop", { n: count, total })),
    onRetry: () => engine.schedule(300),
  }),
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
      // Basis = Snapshot: so erkennt der erste Abgleich, was auf Drive gelöscht/geändert wurde.
      await db.kvSet(BASE_KEY, collection.recipes);
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
 * Abgleich mit Drive. Gibt {changed, recipes?, meta, error?} zurück.
 * Prüfen + Drei-Wege-Merge pro Rezept (syncRules.recipeSync, recipeMerge.js), Ablauf im Sync-Kern.
 */
export function syncWithDrive() {
  return engine.sync();
}

/**
 * Eine Änderung speichern: change(rezepte) → neue rezepte. Läuft in der Warteschlange des Sync-Kerns
 * auf dem AKTUELLEN lokalen Stand (IndexedDB) — nie auf einer veralteten Kopie im Speicher, die einen
 * gerade zusammengeführten Drive-Stand (z. B. Claudes neues Rezept) nicht kennt. Danach ein ABGLEICH:
 * erst Drive lesen, zusammenführen, dann schreiben — nie mehr blind überschreiben (T1, DG-01).
 * Gibt {meta, recipes, changed?, error?} zurück; recipes = maßgeblicher lokaler Stand danach.
 */
export function saveChange(change) {
  return engine.run(async ({ sync: syncNow, getMeta, patchMeta, setStatus }) => {
    const next = change(await db.getAll("recipes"));
    await db.replaceAll("recipes", next);
    const meta = await patchMeta({ updated: new Date().toISOString(), dirty: true });

    if (!(drive.isSignedIn() && engine.isOnline())) {
      setStatus(RECIPE_STATUS.savedLocal);
      return { meta, recipes: next };
    }
    const res = await syncNow({ label: RECIPE_STATUS.saving });
    // Netzfehler beim Speichern: lokal ist alles da, der nächste Abgleich holt es nach.
    if (res.error && !res.error.rejected && res.error.status !== 401) setStatus(RECIPE_STATUS.savedPending);
    return { ...res, meta: res.meta || await getMeta(), recipes: res.changed ? res.recipes : next };
  });
}
