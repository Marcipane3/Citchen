// syncRules.js — P1: die austauschbaren Merge-Regeln für den Sync-Kern (syncCore.js).
// Jede Regel beschreibt nur, WIE lokal und Drive zusammengeführt werden; Finden/Anlegen/Lesen/
// Schreiben/Status/Warteschlange macht der Kern. Lokaler Speicher wird hineingereicht (testbar).
//
//  threeWayMerge → rezepte.json   (pro Rezept und Feld gegen die gemerkte Basis; v2.15.1, T1/T12)
//  itemMerge     → einkaufsliste.json (pro Artikel; Tombstones; schreibt nur bei Änderung, CR-02)

import { toFileString } from "./migrate.js";
import { withDefaults } from "./schema.js";
import { checkInbound, mergeRecipes, isMassDelete, same, fingerprint } from "./recipeMerge.js";
import { mergeList, sameItems, syncStep } from "../features/shopping/listMerge.js";

/* ============================================================
   Rezepte: Drei-Wege-Merge (v2.15.1)
   Status sind (wie bisher) fertige deutsche Texte — die Views zeigen sie direkt an.
   ============================================================ */

export const RECIPE_STATUS = Object.freeze({
  syncing: "Verbinde mit Drive…",
  synced: "Synchronisiert ✓",
  repaired: "Synchronisiert ✓ — Drive-Datei repariert",
  invalid: "Drive-Datei fehlerhaft — lokale Daten behalten",
  saving: "Speichere…",
  savedLocal: "Lokal gespeichert",
  savedPending: "Lokal gespeichert — Sync ausstehend",
  auth: "Anmeldung abgelaufen",
  offline: "Offline — lokale Daten",
});

/**
 * store = {
 *   readAll() → recipes[]              lokaler Stand
 *   replaceAll(recipes)                lokal ersetzen — muss den Speicher-Zustand SYNCHRON (vor dem
 *                                      ersten await) übernehmen, sonst kann ein Tipp dazwischenrutschen
 *   rev() → Zahl                       steigt bei jedem lokalen Speichern (synchron beim Aufruf)
 *   readBase() / writeBase(recipes)    zuletzt mit Drive geeinigter Stand (Basis des Merges)
 *   writeBackup(recipes)               letzte lokale Kopie, bevor Drive-Inhalt sie ersetzt (T2)
 * }
 * ask({ kind: "broken"|"massDelete", … }) → Promise<bool>  — Rückfrage an den Nutzer.
 */
export function threeWayMerge({ store, ask = async () => false }) {
  const S = RECIPE_STATUS;
  let revAtRead = 0;
  // Alle drei Stände mit denselben v1-Defaults vergleichen wie die eingehende Datei (loadCollection) —
  // sonst sähe ein fehlendes `rating` auf einer Seite wie eine Änderung aus.
  const norm = (list) => (list ? list.map(withDefaults) : list);
  return {
    initialStatus: "",
    syncing: S.syncing,
    signedOut: undefined, // ohne Anmeldung bleibt die Statuszeile, wie sie ist
    readLocal: async () => { revAtRead = store.rev(); return norm(await store.readAll()); },
    errorStatus: (e) => (e && e.status === 401 ? S.auth : S.offline),

    // Echter Erstlauf dieses Kontos: lokale Daten (meist der Snapshot) hochladen.
    create: ({ local, now }) => ({
      content: toFileString({ updated: now, recipes: local }),
      apply: async () => {
        await store.writeBase(local);
        return { meta: { updated: now, dirty: false, lastSync: now, source: "drive" }, status: S.synced };
      },
    }),

    merge: async ({ local, remote, meta, now }) => {
      const rev = revAtRead;
      const checked = checkInbound(remote);

      // T2: strukturell kaputt → lokal NIE anfassen. Reparieren (= lokalen Stand schreiben) nur auf Nachfrage.
      if (!checked.ok) {
        console.warn("Drive-Datei fehlerhaft:", checked.errors);
        const fp = fingerprint(remote === undefined ? "undefined" : remote);
        const repair = meta.declinedRemote !== fp && await ask({ kind: "broken", errors: checked.errors, count: local.length });
        if (!repair) {
          return { write: null, apply: async () => ({ meta: { lastSync: now, declinedRemote: fp }, status: S.invalid, result: { invalid: true, errors: checked.errors } }) };
        }
        return finish({ merged: local, write: true, repaired: [{ id: null, why: "ganze Datei mit dem Stand dieses Geräts ersetzt" }] });
      }
      if (checked.errors.length) console.warn("Drive-Validierung:", checked.errors);
      if (checked.repaired.length) console.warn("Drive-Datei gerettet:", checked.repaired);

      const remoteRecipes = checked.collection.recipes;
      const base = norm(await store.readBase());
      // Ohne Basis und ohne lokale Änderung: Drive ist die Wahrheit (erstes Laden, Upgrade von ≤ v2.15).
      const res = !base && !meta.dirty
        ? { recipes: remoteRecipes, conflicts: [], removed: local.filter((r) => !remoteRecipes.some((x) => x.id === r.id)).map((r) => r.id) }
        : mergeRecipes({ base, local, remote: remoteRecipes });
      let merged = res.recipes;
      if (res.conflicts.length) console.info("Gleiche Felder lokal und auf Drive geändert — lokal behalten:", res.conflicts);

      // T2: würde Drive viele Rezepte löschen → fragen. Nein = Rezepte behalten und Drive reparieren.
      // Ein frisches Gerät (lokal nur der mitgelieferte Snapshot) fragt nicht — da geht nichts verloren.
      const ownData = meta.source === "drive" || meta.dirty;
      if (ownData && res.removed.length && isMassDelete(res.removed.length, local.length)) {
        const names = res.removed.map((id) => (local.find((r) => r.id === id) || {}).name).filter(Boolean);
        const ok = await ask({ kind: "massDelete", count: res.removed.length, total: local.length, names });
        if (!ok) {
          const back = new Set(res.removed);
          merged = [...merged, ...local.filter((r) => back.has(r.id))];
        }
      }
      return finish({
        merged, conflicts: res.conflicts, repaired: checked.repaired, remoteUpdated: checked.collection.updated,
        write: checked.repaired.length > 0 || !same(merged, remoteRecipes),
      });

      function finish({ merged, write, repaired = [], conflicts = [], remoteUpdated = null }) {
        return {
          write: write ? toFileString({ updated: now, recipes: merged }) : null,
          apply: async () => {
            // Während des Roundtrips lokal gespeichert? Dann lokal und Basis NICHT anfassen — der
            // wartende Speichern-Abgleich folgt direkt (Warteschlange im Kern) und führt erneut zusammen.
            if (store.rev() !== rev) return { meta: { lastSync: now }, status: S.synced };
            const changed = !same(merged, local);
            if (changed) {
              const replacing = store.replaceAll(merged); // übernimmt den Speicher-Zustand synchron
              await store.writeBackup(local);
              await replacing;
            }
            await store.writeBase(merged);
            return {
              meta: { updated: write ? now : (remoteUpdated || meta.updated || now), dirty: false, lastSync: now, source: "drive", declinedRemote: null },
              status: repaired.length ? S.repaired : S.synced,
              result: { changed, recipes: merged, conflicts, repaired },
            };
          },
        };
      }
    },
  };
}

/**
 * Speichern = sofort ein Abgleich in der Warteschlange: Drive lesen → zusammenführen → schreiben (T1).
 * Nie blind hochladen — sonst gehen Änderungen von Projekt-Claude, v1 oder dem 2. Gerät verloren.
 */
export function saveStep() {
  const S = RECIPE_STATUS;
  return async ({ sync, setStatus }) => {
    setStatus(S.saving);
    const res = await sync();
    if (res.error) setStatus(S.savedPending); // bleibt dirty → nächster Abgleich holt es nach
    return res;
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
