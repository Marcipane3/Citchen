// listMerge.js — Item-level last-writer-wins merge für einkaufsliste.json.
// Reine Funktionen — kein I/O, keine Imports. Wird von listSync.js bei JEDEM Sync aufgerufen.
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

/** Tombstones älter als `days` entfernen, damit die Datei nicht endlos wächst. */
export function pruneTombstones(items = [], now = new Date().toISOString(), days = 30) {
  const cutoff = new Date(Date.parse(now) - days * 86400000).toISOString();
  return items.filter((it) => !it.deleted || (it.updated || "") > cutoff);
}

/** Gleicher Inhalt im Sinne des Merges? (gleiche ids mit gleichen `updated`-Marken) */
export function sameItems(a = [], b = []) {
  if (a.length !== b.length) return false;
  const m = new Map(a.map((x) => [x.id, x.updated || ""]));
  return b.every((x) => m.has(x.id) && m.get(x.id) === (x.updated || ""));
}

/**
 * Ein Sync-Schritt als reine Funktion (von listSync.js genutzt, unit-getestet):
 * mischt lokal + Drive, entfernt alte Tombstones und sagt, wohin geschrieben werden muss.
 * Kein Schreiben, wenn sich nichts geändert hat → zwei Syncs hintereinander sind stabil (CR-02).
 */
export function syncStep(local = [], remote = [], now = new Date().toISOString()) {
  const merged = pruneTombstones(mergeList(local, remote), now);
  return { merged, writeRemote: !sameItems(remote, merged), writeLocal: !sameItems(local, merged) };
}
