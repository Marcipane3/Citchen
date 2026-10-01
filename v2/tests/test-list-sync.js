// Tests: Partner-Sync der Einkaufsliste (v2.11) — Regressionen für CR-01/CR-02 aus
// .planning/phases/01-shared-shopping-list/01-REVIEW.md, simuliert mit zwei Geräten A/B und
// einer In-Memory-„Drive-Datei“. Rein: nur listMerge.js + logic.js, kein DOM/IndexedDB/Netz.
import { test, assert, assertEqual } from "./runner.js";
import { syncStep, ensureItemMeta, pruneTombstones, sameItems, newItemId, touch } from "../src/features/shopping/listMerge.js";
import { mergeItems, aggregateIngredients } from "../src/features/shopping/logic.js";

const T = (min) => new Date(Date.UTC(2026, 9, 1, 10, min)).toISOString();
const item = (id, name, min, extra = {}) => ({ id, name, qty: 1, done: false, updated: T(min), author: "a", deleted: false, ...extra });
const visible = (items) => items.filter((x) => !x.deleted).map((x) => x.name).sort();

/** Ein Gerät synct gegen die gemeinsame Datei: gibt [neueLokale, neueDatei] zurück. */
function sync(local, file, min) {
  const { merged, writeRemote } = syncStep(local, file, T(min));
  return [merged, writeRemote ? merged : file];
}

test("CR-01: Löschung auf A (Tombstone) erreicht B — Artikel taucht nicht wieder auf", () => {
  let file = [item("1", "Milch", 0), item("2", "Feta", 0)];
  let A = file.map((x) => ({ ...x })), B = file.map((x) => ({ ...x }));
  // A löscht Feta als Tombstone (statt splice) und synct.
  A = A.map((x) => x.id === "2" ? { ...x, deleted: true, updated: T(5) } : x);
  [A, file] = sync(A, file, 6);
  // B (noch mit Feta) synct → Feta verschwindet, statt von B wiederbelebt zu werden.
  [B, file] = sync(B, file, 7);
  assertEqual(visible(B).join(), "Milch");
  // A synct erneut → bleibt weg.
  [A, file] = sync(A, file, 8);
  assertEqual(visible(A).join(), "Milch");
});

test("CR-01 (Gegenprobe): ohne Tombstone (alter splice) belebt B den Artikel wieder", () => {
  let file = [item("1", "Milch", 0), item("2", "Feta", 0)];
  let A = file.map((x) => ({ ...x })), B = file.map((x) => ({ ...x }));
  A = A.filter((x) => x.id !== "2");             // altes Verhalten
  [A, file] = sync(A, file, 6);
  [B, file] = sync(B, file, 7);
  [A, file] = sync(A, file, 8);
  assertEqual(visible(A).join(), "Feta,Milch");   // genau der gemeldete Bug
});

test("CR-02: zweiter Sync ohne Änderungen schreibt nichts (keine Endlosschleife)", () => {
  const local = [item("1", "Milch", 0)], remote = [item("2", "Brot", 1)];
  const first = syncStep(local, remote, T(2));
  assert(first.writeRemote && first.writeLocal, "erster Sync muss beide Seiten angleichen");
  const second = syncStep(first.merged, first.merged, T(3));
  assert(!second.writeRemote && !second.writeLocal, "zweiter Sync darf nichts schreiben");
});

test("Abhaken auf A mit touch() erreicht B; ohne touch() nicht", () => {
  const base = [item("1", "Milch", 0)];
  const A = base.map((x) => ({ ...x, done: true }));
  touch(A[0], T(4));
  const [, file] = sync(A, base, 5);
  const [B] = sync(base.map((x) => ({ ...x })), file, 6);
  assertEqual(B[0].done, true);
});

test("Gleichzeitige Adds beider Partner bleiben beide erhalten", () => {
  let file = [];
  let A = [item(newItemId(), "Äpfel", 1)], B = [item(newItemId(), "Brot", 2)];
  [A, file] = sync(A, file, 3);
  [B, file] = sync(B, file, 4);
  [A, file] = sync(A, file, 5);
  assertEqual(visible(A).join(), "Brot,Äpfel".split(",").sort().join());
  assertEqual(visible(B).join(), visible(A).join());
});

test("newItemId: 1000 schnelle Aufrufe ohne Kollision (WR-02)", () => {
  const ids = new Set(Array.from({ length: 1000 }, newItemId));
  assertEqual(ids.size, 1000);
});

test("ensureItemMeta ergänzt id/updated/deleted, lässt vollständige Items unverändert", () => {
  const full = item("x", "Salz", 0);
  const [a, b] = ensureItemMeta([full, { name: "Reis", qty: 1 }], T(9));
  assert(a === full, "vollständiges Item soll dasselbe Objekt bleiben");
  assert(b.id && b.updated === T(9) && b.deleted === false, "fehlende Felder ergänzt");
});

test("pruneTombstones entfernt nur alte Tombstones (>30 Tage)", () => {
  const now = "2026-10-01T00:00:00.000Z";
  const items = [
    { id: "a", deleted: true, updated: "2026-08-01T00:00:00.000Z" },
    { id: "b", deleted: true, updated: "2026-09-25T00:00:00.000Z" },
    { id: "c", deleted: false, updated: "2026-01-01T00:00:00.000Z" },
  ];
  assertEqual(pruneTombstones(items, now).map((x) => x.id).join(), "b,c");
});

test("sameItems vergleicht ids + updated, nicht Reihenfolge", () => {
  assert(sameItems([item("1", "a", 1), item("2", "b", 2)], [item("2", "b", 2), item("1", "a", 1)]), "gleich");
  assert(!sameItems([item("1", "a", 1)], [item("1", "a", 2)]), "andere Marke");
});

test("mergeItems belebt gelöschten Artikel wieder (gleiche id) und setzt updated", () => {
  const existing = [{ id: "k1", name: "Kichererbsen", unit: "g", amount: 400, qty: 1, deleted: true, updated: T(0), author: "a" }];
  const out = mergeItems(existing, [{ name: "Kichererbsen", unit: "g", amount: 200, qty: 1 }], T(9));
  assertEqual(out.length, 1);
  assertEqual(out[0].id, "k1");
  assertEqual(out[0].deleted, false);
  assertEqual(out[0].amount, 200);
  assertEqual(out[0].updated, T(9));
});

test("S3: aggregateIngredients zeigt Namen in UI-Sprache, matcht Gang/Icon deutsch", () => {
  const de = { id: "r1", ingredients: ["🛒 2 Zitronen", "🛒 200g Feta"] };
  const en = { id: "r1", ingredients: ["🛒 2 lemons", "🛒 200g feta cheese"] };
  const { items } = aggregateIngredients([de], { displayById: { r1: en } });
  const lemon = items.find((x) => x.nameDe === "Zitronen");
  assert(lemon, "deutscher Schlüssel bleibt erhalten");
  assertEqual(lemon.name, "lemons");
  assert(lemon.cat !== "Aus Rezepten", "Gang kommt aus dem deutschen Katalog-Match");
});

test("S3: ohne Übersetzung bzw. bei abweichender Länge bleibt der deutsche Name", () => {
  const de = { id: "r1", ingredients: ["🛒 2 Zitronen"] };
  const bad = { id: "r1", ingredients: ["🛒 2 lemons", "extra"] };
  assertEqual(aggregateIngredients([de]).items[0].name, "Zitronen");
  assertEqual(aggregateIngredients([de], { displayById: { r1: bad } }).items[0].name, "Zitronen");
});
