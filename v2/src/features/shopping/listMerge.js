// listMerge.js — Item-level last-writer-wins merge für einkaufsliste.json.
// Reine Funktion — kein I/O, keine Imports. Wird von listSync.js bei jedem pull/conflict aufgerufen.
// Merge-Regel: Union aller Items, nach id indiziert; das Item mit dem späteren `updated`-ISO-String gewinnt.
// Gelöschte Items behalten deleted:true als Tombstone — im Ergebnis enthalten, damit die Löschung
// an Partner propagiert wird. shopping.js filtert: items.filter(x => !x.deleted)

export function mergeList(local = [], remote = []) {
  const byId = new Map();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing || item.updated > existing.updated) byId.set(item.id, item);
  }
  return [...byId.values()];
}
// Gibt alle Items zurück, auch mit deleted:true.
// Aufrufende Stelle (shopping.js) filtert: items.filter(x => !x.deleted)
