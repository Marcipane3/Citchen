// sync.js — Lokal-first Abgleich IndexedDB <-> Drive für die Rezepte.
// Seit v2.15 (P1) nur noch Konfiguration: der Ablauf steckt im Sync-Kern (syncCore.js), die
// Merge-Regel in syncRules.js (seit v2.15.1 Drei-Wege-Merge, recipeMerge.js). Ablauf:
//  1. Start: Rezepte SOFORT aus IndexedDB (offline, instant).
//     Leere DB → gebündelter Snapshot (data/rezepte.snapshot.json) als Erstbefüllung.
//  2. Online + angemeldet: Drive lesen und pro Rezept/Feld gegen die gemerkte Basis zusammenführen.
//     Auch bei Rückkehr in die App (visibilitychange) und wenn das Netz zurückkommt (app.js).
//  3. Speichern: erst IndexedDB (instant), dann derselbe Abgleich (lesen → zusammenführen →
//     schreiben); offline → dirty-Flag, Abgleich beim nächsten Sync. Nie blind hochladen (T1).

import * as db from "./db.js";
import * as drive from "./drive.js";
import { loadCollection } from "./migrate.js";
import { createSyncEngine } from "./syncCore.js";
import { threeWayMerge, saveStep, RECIPE_STATUS } from "./syncRules.js";
import { t } from "../i18n.js";

const META_KEY = "collection";       // { version, updated, fileId, dirty, lastSync, source, declinedRemote }
const BASE_KEY = "collectionBase";   // zuletzt mit Drive geeinigter Stand (Merge-Basis), recipes[]
const BACKUP_KEY = "recipesBackup";  // { at, recipes } — lokaler Stand, bevor Drive-Inhalt ihn ersetzte (T2)
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

// Steigt SYNCHRON bei jedem lokalen Speichern — der Abgleich erkennt daran, dass während seines
// Roundtrips getippt wurde, und lässt den lokalen Stand dann in Ruhe.
let localRev = 0;

// Der Store (store.js) übernimmt Drive-Inhalt hierüber — synchron, bevor IndexedDB geschrieben wird.
const appliedListeners = new Set();
/** fn(recipes) — Drive-Inhalt wurde lokal übernommen (zusammengeführt). */
export function onRemoteApplied(fn) { appliedListeners.add(fn); return () => appliedListeners.delete(fn); }

/** Rückfrage bei kaputter Drive-Datei oder Massen-Löschung (T2). */
async function ask(q) {
  if (typeof confirm !== "function") return false;
  if (q.kind === "broken") return confirm(t("recipeSync.askBroken", { e: q.errors.join("; "), n: q.count }));
  const names = q.names.slice(0, 3).map((n) => `„${n}“`).join(", ") + (q.names.length > 3 ? " …" : "");
  return confirm(t("recipeSync.askMassDelete", { n: q.count, total: q.total, names }));
}

/** Der mitgelieferte deutsche Snapshot (Originale der Übersetzungen) — null, wenn nicht ladbar. */
export async function fetchBaseRecipesDe() {
  try {
    const res = await fetch(SNAPSHOT_URL);
    if (!res.ok) return null;
    return loadCollection(await res.json()).collection.recipes;
  } catch (e) {
    console.warn("Basis-Snapshot nicht ladbar:", e);
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
  rule: threeWayMerge({
    ask,
    store: {
      readAll: () => db.getAll("recipes"),
      replaceAll: (r) => {
        for (const fn of appliedListeners) {
          try { fn(r); } catch (e) { console.warn("onRemoteApplied-Listener warf", e); }
        }
        return db.replaceAll("recipes", r);
      },
      rev: () => localRev,
      readBase: () => db.kvGet(BASE_KEY, null),
      writeBase: (r) => db.kvSet(BASE_KEY, r),
      writeBackup: (r) => db.kvSet(BACKUP_KEY, { at: new Date().toISOString(), recipes: r }),
    },
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
 * Hintergrund-Sync mit Drive. Gibt {changed, recipes?, meta, invalid?, error?} zurück.
 * Übernommener Drive-Inhalt kommt zusätzlich über onRemoteApplied beim Store an.
 */
export function syncWithDrive() {
  return engine.sync();
}

/** Letzte lokale Sicherung (T2) — { at, recipes } oder null. */
export function getBackup() {
  return db.kvGet(BACKUP_KEY, null);
}

/**
 * Sammlung speichern: IndexedDB sofort, danach ein Abgleich in der Warteschlange des Sync-Kerns
 * (Drive lesen → zusammenführen → schreiben), nie mitten in einen laufenden Abgleich hinein.
 * recipes = vollständiges Array. Gibt die Meta zurück.
 */
export async function saveCollection(recipes) {
  localRev++; // synchron, VOR dem ersten await (siehe localRev)
  const updated = new Date().toISOString();
  await db.replaceAll("recipes", recipes);
  const meta = await engine.patchMeta({ updated, dirty: true });

  if (!(drive.isSignedIn() && engine.isOnline())) {
    engine.setStatus(RECIPE_STATUS.savedLocal);
    return meta;
  }
  const res = await engine.run(saveStep());
  return res.meta || engine.getMeta();
}
