// listMerge.js — Item-level last-writer-wins merge für einkaufsliste.json.
// Reine Funktionen — kein I/O. Wird von syncRules.itemMerge bei JEDEM Sync aufgerufen.
// Seit v2.15.3 (T5): danach werden offene Zeilen desselben Artikels zusammengefasst (foldSameItems).
// Merge-Regel: Union aller Items, nach id indiziert; das Item mit dem späteren `updated`-ISO-String gewinnt.
// Gelöschte Items behalten deleted:true als Tombstone — im Ergebnis enthalten, damit die Löschung
// an Partner propagiert wird. Die Anzeige filtert: items.filter(x => !x.deleted)
// Voraussetzung, dass das funktioniert: JEDE Änderung an einem Item setzt `updated` neu (touch()).

export function mergeList(local = [], remote = []) {
  const byId = new Map();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    // WR-06: fehlendes `updated` zählt als ältestmöglich ("") statt undefined-Vergleich.
    if (!existing || (item.updated || "") > (existing.updated || "")) byId.set(item.id, item);
  }
  return [...byId.values()];
}

import { sameKey, mergeQuantity } from "./logic.js";

/** Kollisionsfreie Item-ID (WR-02: Date.now() allein kollidiert bei schnellen Adds). */
export function newItemId() {
  return "li-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/** Markiert ein Item als geändert — Pflicht vor jedem Speichern, sonst gewinnt beim Merge die alte Version. */
export function touch(item, now = new Date().toISOString()) {
  item.updated = now;
  return item;
}

/** Ergänzt fehlende Sync-Felder (id/updated/author/deleted), z. B. für Artikel aus Rezepten. */
export function ensureItemMeta(items = [], now = new Date().toISOString()) {
  return items.map((it) => (it.id && it.updated && typeof it.deleted === "boolean")
    ? it
    : { author: "local", ...it, id: it.id || newItemId(), updated: it.updated || now, deleted: !!it.deleted });
}

/* ============================================================
   T4 (DG-04, FR-01): Altbestand ohne id
   Builds vor v2.11 schrieben Artikel ohne `id` nach Drive. Früher bekam die lokale Kopie bei
   JEDEM Laden eine neue Zufalls-id, das Original blieb auf Drive → eine Zeile mehr pro Sync.
   Jetzt: deterministische id (gleicher Artikel → überall dieselbe id) und älteste Marke.
   ============================================================ */

/** „Älteste mögliche“ Marke für Altbestand: jede echte Änderung (auch eine Löschung) gewinnt. */
export const LEGACY_STAMP = "2000-01-01T00:00:00.000Z";

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** FNV-1a (32 Bit) → base36. Kurz, stabil, ohne Abhängigkeiten. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Deterministische id für einen Artikel ohne id: Hash aus Name + Einheit. */
export function stableItemId(it) {
  return "li-x-" + hash(norm(it.nameDe || it.name) + "|" + norm(it.unit));
}

/** Artikel ohne id → stabile id + älteste Marke. Artikel mit id bleiben dasselbe Objekt. */
export function adoptLegacy(items = []) {
  return items.map((it) => (it && !it.id
    ? { author: "local", ...it, id: stableItemId(it), updated: it.updated || LEGACY_STAMP, deleted: !!it.deleted }
    : it));
}

/** Was eine Kopie des Altbestands-Artikels ausmacht (id/Marken/Häkchen/Menge zählen nicht). */
const copySig = (it) => JSON.stringify([norm(it.nameDe || it.name), norm(it.unit), it.amount ?? null, it.cat ?? "", it.sources ?? null]);

/**
 * Einmalige Aufräumung der Kopien, die der alte Fehler erzeugt hat: zu jedem Altbestands-Artikel
 * (`legacy`, schon mit stabiler id) werden alle inhaltsgleichen Zeilen mit anderer id zu EINER
 * Zeile mit der stabilen id. Ihr Zustand (offen/abgehakt/gelöscht, Menge) kommt von der zuletzt
 * geänderten Zeile der Gruppe; die übrigen werden Tombstones (erreichen so auch den Partner).
 */
export function collapseLegacyCopies(items = [], legacy = [], now = new Date().toISOString()) {
  let out = items;
  for (const leg of legacy) {
    const sig = copySig(leg);
    const group = out.filter((it) => it.id === leg.id || copySig(it) === sig);
    const copies = group.filter((it) => it.id !== leg.id);
    if (!copies.length) continue;
    const latest = group.reduce((a, b) => ((b.updated || "") > (a.updated || "") ? b : a));
    const own = group.find((it) => it.id === leg.id) || leg;
    const merged = { ...own, done: !!latest.done, qty: latest.qty ?? own.qty, deleted: !!latest.deleted, updated: now };
    const copyIds = new Set(copies.map((c) => c.id));
    out = out.filter((it) => it.id !== leg.id).map((it) => (copyIds.has(it.id) && !it.deleted ? { ...it, deleted: true, updated: now } : it));
    out.push(merged);
  }
  return out;
}

/**
 * T5 / BH-08: Zwei Geräte (oder Partner) fügen denselben Artikel unabhängig hinzu → zwei ids, die der
 * Merge pro id nie zusammenführt. Danach: offene Zeilen mit gleichem Schlüssel (sameKey) und gleichem
 * Häkchen-Stand werden EINE — die mit der kleinsten id bleibt (deterministisch: jedes Gerät wählt
 * dieselbe), Mengen werden summiert, die anderen werden Tombstones (erreichen so den Partner).
 */
export function foldSameItems(items = [], now = new Date().toISOString()) {
  const groups = new Map();
  for (const it of items) {
    if (it.deleted) continue;
    const k = sameKey(it.nameDe || it.name) + (it.done ? "|done" : "|open");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  let out = items;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const keep = { ...first, updated: now };
    for (const o of rest) {
      mergeQuantity(keep, o);
      if (Array.isArray(o.sources)) keep.sources = [...new Set([...(keep.sources || []), ...o.sources])];
    }
    const drop = new Set(rest.map((o) => o.id));
    out = out.map((it) => (it.id === keep.id ? keep : drop.has(it.id) ? { ...it, deleted: true, updated: now } : it));
  }
  return out;
}

/* ============================================================
   Tombstones aufräumen (T7: AR-09, DG-13, BH-11)
   ============================================================ */

/** Grenze, ab der Tombstones entfernt werden (älter als `days` Tage). */
export function pruneCutoff(now = new Date().toISOString(), days = 30) {
  return new Date(Date.parse(now) - days * 86400000).toISOString();
}

/** Tombstones älter als `days` entfernen, damit die Datei nicht endlos wächst. */
export function pruneTombstones(items = [], now = new Date().toISOString(), days = 30) {
  const cutoff = pruneCutoff(now, days);
  return items.filter((it) => !it.deleted || (it.updated || "") > cutoff);
}

/**
 * T7: „Fehlt auf Drive“ heißt nach dem Aufräumen nicht mehr „neu“. Ein Artikel, den die Datei nicht
 * (mehr) hat und der zuletzt VOR dem Aufräum-Horizont geändert wurde, war dort und ist längst
 * gelöscht + aufgeräumt — er wird verworfen statt wiederbelebt (Gerät war > 30 Tage offline).
 */
export function dropBeyondHorizon(items = [], keepIds = new Set(), horizon = "") {
  if (!horizon) return items;
  return items.filter((it) => keepIds.has(it.id) || (it.updated || "") > horizon);
}

/** Gleicher Inhalt im Sinne des Merges? (gleiche ids mit gleichen `updated`-Marken) */
export function sameItems(a = [], b = []) {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((x) => [x.id, x.updated || ""]));
  return b.every((x) => m.has(x.id) && m.get(x.id) === (x.updated || ""));
}

/**
 * Ein Sync-Schritt als reine Funktion (von syncRules.itemMerge genutzt, unit-getestet):
 * mischt lokal + Drive, entfernt alte Tombstones und sagt, wohin geschrieben werden muss.
 * Kein Schreiben, wenn sich nichts geändert hat → zwei Syncs hintereinander sind stabil (CR-02).
 * opts.legacy  — Altbestands-Artikel der Datei (T4): deren Kopien werden zusammengefasst.
 * opts.horizon — `prunedBefore` der Datei (T7): lokale Artikel jenseits davon gelten als gelöscht.
 * Danach (T5) werden doppelte offene Zeilen desselben Artikels zusammengefasst (foldSameItems).
 * → prunedBefore: neuer Horizont für die Datei (rückt vor, sobald hier etwas aufgeräumt wurde).
 */
export function syncStep(local = [], remote = [], now = new Date().toISOString(), { legacy = [], horizon = "" } = {}) {
  const remoteIds = new Set(remote.map((it) => it.id));
  let merged = mergeList(dropBeyondHorizon(local, remoteIds, horizon), remote);
  if (legacy.length) merged = collapseLegacyCopies(merged, legacy, now);
  merged = foldSameItems(merged, now);
  const kept = pruneTombstones(merged, now);
  const cutoff = pruneCutoff(now);
  const prunedBefore = kept.length < merged.length && cutoff > (horizon || "") ? cutoff : (horizon || "");
  merged = kept;
  return { merged, prunedBefore, writeRemote: !sameItems(remote, merged), writeLocal: !sameItems(local, merged) };
}

/** J2-Badge: offene Artikel = nicht gelöscht und nicht abgehakt. */
export function countOpen(items = []) {
  return items.filter((it) => !it.deleted && !it.done).length;
}
