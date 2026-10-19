// syncRules.js — P1: die austauschbaren Merge-Regeln für den Sync-Kern (syncCore.js).
// Jede Regel beschreibt nur, WIE lokal und Drive zusammengeführt werden; Finden/Anlegen/Lesen/
// Schreiben/Status/Warteschlange macht der Kern. Lokaler Speicher wird hineingereicht (testbar).
//
//  recipeSync → rezepte.json   (v2.15.1: prüfen + Drei-Wege-Merge pro Rezept, recipeMerge.js)
//  itemMerge  → einkaufsliste.json (pro Artikel; Tombstones; schreibt nur bei Änderung, CR-02)

import { toFileString } from "./migrate.js";
import { decideSync } from "./decideSync.js";
import { inspectRemote, mergeRecipes, sameCollection, suspiciousDrop, RemoteRejected } from "./recipeMerge.js";
import { mergeList, sameItems, syncStep } from "../features/shopping/listMerge.js";

/* ============================================================
   Rezepte: Drei-Wege-Merge gegen die Basis (T1) + Eingangsprüfung (T2)
   Status sind (wie bisher) fertige deutsche Texte — die Views zeigen sie direkt an.
   ============================================================ */

export const RECIPE_STATUS = Object.freeze({
  syncing: "Verbinde mit Drive…",
  synced: "Synchronisiert ✓",
  saving: "Speichere…",
  savedLocal: "Lokal gespeichert",
  savedPending: "Lokal gespeichert — Sync ausstehend",
  rejected: "Drive-Datei fehlerhaft — lokale Daten behalten",
  auth: "Anmeldung abgelaufen",
  offline: "Offline — lokale Daten",
});

/**
 * store = {
 *   readAll() → recipes[] · replaceAll(recipes)
 *   getBase() → recipes[] | null — letzter mit Drive geeinigter Stand
 *   setBase(recipes) · backup(recipes) — eine Sicherung des lokalen Stands vor dem Ersetzen
 * }
 * approveDrop({ count, total }) → bool — Rückfrage, bevor auffällig viele Rezepte lokal verschwinden
 * onRetry() — lokal wurde während des Abgleichs gespeichert → gleich nochmal abgleichen
 */
export function recipeSync({ store, approveDrop = async () => false, onRetry = () => {} }) {
  const S = RECIPE_STATUS;
  return {
    initialStatus: "",
    syncing: S.syncing,
    signedOut: undefined, // ohne Anmeldung bleibt die Statuszeile, wie sie ist
    readLocal: () => store.readAll(),
    errorStatus: (e) => (e && e.status === 401 ? S.auth
      : e && (e.rejected || e.name === "SyntaxError") ? S.rejected
        : S.offline),

    // Echter Erstlauf dieses Kontos: lokale Daten (meist der Snapshot) hochladen.
    create: ({ local, now }) => ({
      content: toFileString({ updated: now, recipes: local }),
      apply: async () => {
        await store.setBase(local);
        return { meta: { updated: now, dirty: false, lastSync: now, source: "drive" }, status: S.synced };
      },
    }),

    merge: async ({ local, remote, meta, now, currentMeta }) => {
      // T2: kaputte Dateien gar nicht erst übernehmen (wirft RemoteRejected → lokale Daten bleiben).
      const { collection, notes } = inspectRemote(remote);
      if (notes.length) console.warn("Drive-Datei repariert:", notes);

      // T1: Basis bestimmen. Seit v2.15.1 gespeichert; davor (Umstieg) aus dem Zustand ableiten.
      let base = await store.getBase();
      let prefer = "remote";
      let merged;
      if (!base && meta.source !== "drive" && !meta.dirty) {
        merged = collection.recipes;                  // nie abgeglichen, nichts geändert → Drive übernehmen
      } else {
        if (!base && meta.source === "drive" && !meta.dirty) base = local; // sauber = zuletzt geeinigt
        if (!base && meta.dirty) {
          // Ungespeicherte Änderung ohne bekannte Basis: Vereinigung, Konflikte nach der alten Regel.
          const old = decideSync({ hasRemote: true, localUpdated: meta.updated || "", remoteUpdated: collection.updated || "", dirty: true, source: meta.source });
          prefer = old === "push" ? "local" : "remote";
        }
        const out = mergeRecipes({ base, local, remote: collection.recipes, prefer });
        merged = out.merged;
        if (out.conflicts.length) console.info("Beidseitig geändert, feldweise zusammengeführt:", out.conflicts);
        // T2: Drive-Datei würde viele Rezepte löschen → erst fragen, sonst nichts übernehmen.
        if (base && suspiciousDrop(out.removedRemotely.length, base.length)
          && !(await approveDrop({ count: out.removedRemotely.length, total: base.length }))) {
          throw new RemoteRejected("bigDrop", `${out.removedRemotely.length} von ${base.length} Rezepten fehlen auf Drive`);
        }
      }

      const write = notes.length > 0 || !sameCollection(merged, collection.recipes);
      return {
        write: write ? toFileString({ updated: now, recipes: merged }) : null,
        apply: async () => {
          await store.setBase(merged);               // so steht es jetzt auf Drive
          const cur = await currentMeta();
          if ((cur.updated || "") !== (meta.updated || "")) {
            // Während des Roundtrips lokal gespeichert → lokal NICHT überschreiben, gleich nochmal.
            return { meta: { lastSync: now }, status: S.savedPending, after: onRetry };
          }
          const changed = !sameCollection(merged, local);
          if (changed) {
            await store.backup(local);               // T2: eine Sicherung des vorherigen Stands
            await store.replaceAll(merged);
          }
          return {
            meta: { version: collection.version, updated: write ? now : (collection.updated || now), dirty: false, lastSync: now, source: "drive" },
            status: S.synced,
            result: changed ? { changed: true, recipes: merged } : {},
          };
        },
      };
    },
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
