// syncRules.js — P1: die austauschbaren Merge-Regeln für den Sync-Kern (syncCore.js).
// Jede Regel beschreibt nur, WIE lokal und Drive zusammengeführt werden; Finden/Anlegen/Lesen/
// Schreiben/Status/Warteschlange macht der Kern. Lokaler Speicher wird hineingereicht (testbar).
//
//  lastWriteWins → rezepte.json   (ganze Datei; Entscheidung = decideSync, K2-Konfliktschutz)
//  itemMerge     → einkaufsliste.json (pro Artikel; Tombstones; schreibt nur bei Änderung, CR-02)

import { loadCollection, toFileString } from "./migrate.js";
import { decideSync } from "./decideSync.js";
import { mergeList, sameItems, syncStep } from "../features/shopping/listMerge.js";

/* ============================================================
   Rezepte: Datei-weites Last-Write-Wins
   Status sind (wie bisher) fertige deutsche Texte — die Views zeigen sie direkt an.
   ============================================================ */

export const RECIPE_STATUS = Object.freeze({
  syncing: "Verbinde mit Drive…",
  synced: "Synchronisiert ✓",
  conflict: "Konflikt — lokale Änderung behalten, Sync ausstehend",
  saving: "Speichere…",
  savedLocal: "Lokal gespeichert",
  savedPending: "Lokal gespeichert — Sync ausstehend",
  auth: "Anmeldung abgelaufen",
  offline: "Offline — lokale Daten",
});

/** store = { readAll() → recipes[], replaceAll(recipes) } */
export function lastWriteWins({ store }) {
  const S = RECIPE_STATUS;
  return {
    initialStatus: "",
    syncing: S.syncing,
    signedOut: undefined, // ohne Anmeldung bleibt die Statuszeile, wie sie ist
    readLocal: () => store.readAll(),
    errorStatus: (e) => (e && e.status === 401 ? S.auth : S.offline),

    // Echter Erstlauf dieses Kontos: lokale Daten (meist der Snapshot) hochladen.
    create: ({ local, meta, now }) => ({
      content: toFileString({ updated: meta.updated, recipes: local }, { setUpdated: true }),
      apply: async () => ({ meta: { dirty: false, lastSync: now, source: "drive" }, status: S.synced }),
    }),

    merge: async ({ local, remote, meta, now, currentMeta }) => {
      const { collection, report } = loadCollection(remote);
      if (report.errors.length) console.warn("Drive-Validierung:", report.errors);
      const localUpdated = meta.updated || "";
      const action = decideSync({
        hasRemote: true, localUpdated, remoteUpdated: collection.updated || "", dirty: meta.dirty, source: meta.source,
      });

      if (action === "push") {
        // Lokal neuer → Drive überschreiben (in place).
        return {
          write: toFileString({ updated: localUpdated, recipes: local }),
          apply: async () => ({ meta: { dirty: false, lastSync: now, source: "drive" }, status: S.synced }),
        };
      }
      if (action === "conflict") {
        // K2: lokale ungepushte Änderung UND Drive gleich/neuer → nichts still überschreiben.
        return { write: null, apply: async () => ({ meta: { lastSync: now }, status: S.conflict, result: { conflict: true } }) };
      }
      if (action === "pull") {
        return {
          write: null,
          apply: async () => {
            // Während des Roundtrips lokal gespeichert? Dann NICHT mit dem Drive-Stand überschreiben —
            // der wartende Speichern-Push folgt direkt danach (Warteschlange im Kern).
            const cur = await currentMeta();
            if ((cur.updated || "") !== localUpdated) return { meta: { lastSync: now }, status: S.synced };
            await store.replaceAll(collection.recipes);
            return {
              meta: { version: collection.version, updated: collection.updated, dirty: false, lastSync: now, source: "drive" },
              status: S.synced,
              result: { changed: true, recipes: collection.recipes },
            };
          },
        };
      }
      // noop
      return { write: null, apply: async () => ({ meta: { lastSync: now }, status: S.synced }) };
    },
  };
}

/**
 * Speichern bei Datei-LWW: lokalen Stand blind hochladen (Datei finden/anlegen). Als Schritt für
 * engine.run(), also nie mitten in einem Abgleich. `updated` = Marke dieses Speicherns: nur wenn
 * lokal inzwischen nichts Neueres gespeichert wurde, gilt der Stand als sauber (dessen Push folgt).
 */
export function pushCollection({ updated, recipes }) {
  const S = RECIPE_STATUS;
  return async ({ upload, getMeta, patchMeta, setStatus }) => {
    setStatus(S.saving);
    try {
      const fileId = await upload(toFileString({ updated, recipes }));
      const now = new Date().toISOString();
      const meta = await patchMeta((m) => (m.updated === updated
        ? { fileId, dirty: false, lastSync: now, source: "drive" }
        : { fileId, lastSync: now }));
      setStatus(S.synced);
      return meta;
    } catch (e) {
      console.warn("Drive-Push fehlgeschlagen (bleibt dirty):", e);
      setStatus(S.savedPending);
      return getMeta();
    }
  };
}

/* ============================================================
   Einkaufsliste: Merge pro Artikel (Union, neuestes `updated` gewinnt, Tombstones)
   Status als Code — die UI übersetzt ihn (i18n). "local" = nicht angemeldet.
   ============================================================ */

/**
 * store = { readAll() → items[] (inkl. Tombstones), write(items, now) }
 * onMerged(items, { stillDirty }) — nach einem Abgleich, der lokal etwas geändert hat
 * onDirty() — Abgleich hat nicht alles untergebracht (lokal währenddessen getippt) → später nochmal.
 */
export function itemMerge({ store, onMerged = () => {}, onDirty = () => {} }) {
  return {
    initialStatus: "local",
    syncing: "syncing",
    signedOut: "local",
    readLocal: () => store.readAll(),
    errorStatus: (e, { online }) =>
      e && e.status === 401 ? "auth"
        : e && (e.status === 404 || e.status === 403) ? "notFound"
          : online === false ? "offline" : "error",

    // Altbestand (≤ v2.10): eigene Datei-ID noch nicht separat gemerkt.
    migrateMeta: (meta) => (meta.fileId && !meta.linked && !meta.ownFileId ? { ownFileId: meta.fileId } : null),

    create: ({ local, now }) => ({
      content: JSON.stringify({ version: 1, updated: now, items: local }),
      apply: async (fileId) => ({
        meta: { ownFileId: fileId, linked: false, dirty: false, lastSync: now },
        status: "synced",
        result: { items: local },
      }),
    }),

    merge: async ({ local, remote, now }) => {
      const remoteItems = remote && Array.isArray(remote.items) ? remote.items : [];
      const { merged, writeRemote } = syncStep(local, remoteItems, now);
      return {
        // Ein Zeitstempel für Datei UND Meta (CR-02); geschrieben wird nur bei Änderung.
        write: writeRemote ? JSON.stringify({ version: 1, updated: now, items: merged }) : null,
        apply: async () => {
          // Während des Roundtrips lokal getippt? → nochmal einmischen.
          const latest = await store.readAll();
          const final = mergeList(merged, latest);
          const localChanged = !sameItems(local, final) || !sameItems(latest, final);
          if (localChanged) await store.write(final, now);
          const stillDirty = !sameItems(final, merged);
          return {
            meta: { dirty: stillDirty, lastSync: now },
            status: "synced",
            result: { changed: localChanged, items: final },
            after: () => { if (localChanged) onMerged(final); if (stillDirty) onDirty(); },
          };
        },
      };
    },
  };
}
