// Tests: v2.15.3 — Einkaufsliste: EINE Regel „derselbe Artikel?“ (T5) + Lager schlägt 🛒 (T6).
// FR-01 („Ingwer taucht von selbst und mehrfach auf“) mit echten Zeilen aus den Basis-Rezepten.
// Rein: shopping/logic.js, listMerge.js, friendMerge.js — kein DOM/IndexedDB/Netz.
// Namen der Fälle wie in qa/findings/test-warden.md (TW-09, TW-10, FR01.*) und bug-hunter.md (BH-04…10).
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  needsBuying, inStockMatch, aggregateIngredients, mergeItems, itemLabel, sameKey, findSame,
  addOne, addAmount, badgeOf, splitLine, stripNote,
} from "../src/features/shopping/logic.js";
import { syncStep, foldSameItems } from "../src/features/shopping/listMerge.js";
import { applyFriendItems } from "../src/features/shopping/friendMerge.js";
import { parseIngredient } from "../src/data/derive.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(join(__dirname, "..", "data", "rezepte.snapshot.json"), "utf8")).recipes;

const NOW = "2026-10-26T10:00:00.000Z";
const at = (min) => new Date(Date.parse(NOW) + min * 60000).toISOString();
const recipe = (id, ingredients) => ({ id, name: id, category: "Vegetarische Hauptgerichte", ingredients });
const live = (items, name) => items.filter((x) => !x.deleted && (!name || sameKey(x.nameDe || x.name) === sameKey(name)));
let n = 0;
const nextId = () => "li-t" + String(++n).padStart(4, "0");
/** Zeilen mit Sync-Feldern, wie sie auf der Liste liegen. */
const onList = (items, t = at(0)) => items.map((x) => ({ id: nextId(), updated: t, author: "local", deleted: false, ...x }));

/* ============================================================
   T6 — Lager schlägt 🛒 (BH-04)
   ============================================================ */

test("T6 / BH-04: Lager schlägt 🛒 — „1 Stück Ingwer 🛒“ mit Ingwer im Lager wird nicht gekauft", () => {
  assert(!needsBuying("1 Stück Ingwer 🛒", { recipeUsesMarkers: true, inStock: ["Ingwer"] }));
  assert(needsBuying("1 Stück Ingwer 🛒", { recipeUsesMarkers: true, inStock: ["Reis"] }), "anderes im Lager → kaufen");
  assert(needsBuying("1 Stück Ingwer 🛒", { recipeUsesMarkers: true }), "ohne Lager-Angabe wie bisher");
});

test("T6: Lager-Abgleich auf ganze Wörter — kein „Ei“ in „Reis“, kein „Ingwer“ in „Ingwerpulver“", () => {
  assert(!inStockMatch("Reis", ["Ei"]));
  assert(!inStockMatch("Ingwerpulver", ["Ingwer"]));
  assert(!inStockMatch("Kokosmilch", ["Milch"]));
  assert(inStockMatch("Eier", ["Eier"]));
  assert(inStockMatch("rote Zwiebel", ["Zwiebeln"]), "Einzahl/Mehrzahl");
  assert(inStockMatch("Zwiebeln", ["Zwiebel"]), "Mehrzahl/Einzahl");
  assert(inStockMatch("Mehl", ["Mehl (405)"]), "Klammerzusatz im Lager");
  assert(inStockMatch("Ingwer, gerieben", ["Ingwer"]), "Zubereitungs-Zusatz zählt nicht");
});

test("T6: Thai-Curry → Liste mit Ingwer im Lager → kein Ingwer, übersprungen gezählt", () => {
  const thai = R.find((r) => r.ingredients.includes("1 Stück Ingwer 🛒"));
  const without = aggregateIngredients([thai]);
  const withStock = aggregateIngredients([thai], { inStock: ["Ingwer"] });
  assert(without.items.some((x) => x.nameDe === "Ingwer"), "ohne Lager steht Ingwer drauf");
  assert(!withStock.items.some((x) => x.nameDe === "Ingwer"), "mit Ingwer im Lager nicht");
  assertEqual(withStock.skipped, without.skipped + 1);
});

/* ============================================================
   T5 — derselbe Artikel (TW-09, FR01.*)
   ============================================================ */

test("T5: sameKey — Zusatz und Klammer zählen nicht, Einzahl = Mehrzahl, Beschreibung schon", () => {
  assertEqual(sameKey("Ingwer, gerieben"), sameKey("Ingwer"));
  assertEqual(sameKey("Ingwer (ca. 3 cm)"), sameKey(" ingwer "));
  assertEqual(sameKey("Zwiebel"), sameKey("Zwiebeln"));
  assert(sameKey("passierte Tomaten") !== sameKey("Tomaten"), "„passierte Tomaten“ sind etwas anderes");
  assert(sameKey("Ingwerpulver") !== sameKey("Ingwer"));
  assertEqual(stripNote("Salz, Pfeffer"), "Salz, Pfeffer", "zwei Nomen: nichts abschneiden");
  assertEqual(stripNote("Petersilie, fein gehackt"), "Petersilie");
});

test("T5 / FR01.oneRowPerIngredient: „Ingwer, gerieben“ + 5× „Ingwer“ → EINE Zeile, 6 Stück", () => {
  const recipes = [recipe("a", ["1 Stück Ingwer, gerieben 🛒"]), ...[1, 2, 3, 4, 5].map((i) => recipe("r" + i, ["1 Stück Ingwer 🛒"]))];
  const { items } = aggregateIngredients(recipes);
  assertEqual(items.length, 1);
  assertEqual(items[0].nameDe, "Ingwer", "ohne „, gerieben“");
  assertEqual(items[0].amount, 6);
  assertEqual(items[0].unit, "Stück");
  assertEqual(items[0].sources.length, 6);
});

test("T5 / FR01 mit den echten Basis-Rezepten: alle 7 Ingwer-Rezepte → 1× Ingwer (+ Ingwerpulver separat)", () => {
  const ing = R.filter((r) => r.ingredients.some((i) => /Ingwer/.test(i)));
  assertEqual(ing.length, 7);
  const { items } = aggregateIngredients(ing);
  const rows = items.filter((x) => /ingwer/i.test(x.nameDe)).map((x) => x.nameDe).sort();
  assertDeepEqual(rows, ["Ingwer", "Ingwerpulver"]);
  assertEqual(itemLabel(items.find((x) => x.nameDe === "Ingwer")), "6 Stück Ingwer");
});

test("T5 / FR01.unitVariants: cm, Daumen, ohne Menge, TL, Klammer → alles derselbe Artikel „Ingwer“", () => {
  const lines = ["2 cm Ingwer 🛒", "1 Daumen Ingwer 🛒", "Ingwer 🛒", "1 TL Ingwer, frisch gerieben 🛒", "1 Stück Ingwer (ca. 3 cm) 🛒"];
  for (const l of lines) assertEqual(sameKey(parseIngredient(l).item), "ingwer", l);
  const { items } = aggregateIngredients([recipe("a", lines)]);
  assertEqual(items.length, 1, "eine Zeile");
  assertEqual(itemLabel(items[0]), "2 cm + 1 Daumen + 1 TL + 1 Stück Ingwer");
});

test("T5 / BH-09 / FR01.twoIngredientsInOneLine: „Nelken, Ingwerpulver“ → zwei Artikel; „1,5 kg“ bleibt ganz", () => {
  assertDeepEqual(splitLine("½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"), ["½ TL gemahlene Nelken 🛒", "1 TL Ingwerpulver 🛒"]);
  assertDeepEqual(splitLine("0,5 TL gemahlene Nelken , 1 TL Ingwerpulver 🛒"), ["0,5 TL gemahlene Nelken 🛒", "1 TL Ingwerpulver 🛒"], "🛒 am Ende gilt für beide");
  assertDeepEqual(splitLine("1,5 kg Mehl 🛒"), ["1,5 kg Mehl 🛒"]);
  assertDeepEqual(splitLine("Salz, Pfeffer"), ["Salz, Pfeffer"]);
  const { items } = aggregateIngredients([recipe("a", ["½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"])]);
  assertDeepEqual(items.map((x) => x.nameDe).sort(), ["Ingwerpulver", "gemahlene Nelken"]);
});

test("T5 (Marcel ✓): Kachel-Tipp auf „Ingwer“ zählt in die Rezept-Zeile „2 Stück Ingwer“ → 3 Stück, eine Zeile", () => {
  const items = onList([{ name: "Ingwer", nameDe: "Ingwer", amount: 2, unit: "Stück", cat: "Gemüse", icon: "🫚", qty: 1, done: true }]);
  const row = addOne(items, { name: "Ingwer", cat: "Gemüse", icon: "🫚" }, { now: at(1), id: nextId() });
  assertEqual(items.length, 1);
  assert(row === items[0], "dieselbe Zeile");
  assertEqual(itemLabel(row), "3 Stück Ingwer");
  assertEqual(row.done, false, "wieder offen");
  assertEqual(row.updated, at(1));
  assertEqual(badgeOf(row), "3", "BH-06/UX-11: das Badge zeigt genau diese Zeile");
});

test("T5: Kachel auf eine Gramm-Zeile → dieselbe Zeile, „200g + 1 Ingwer“; Badge = Stückzahl", () => {
  const items = onList([{ name: "Ingwer", amount: 200, unit: "g", cat: "Gemüse", qty: 1, done: false }]);
  assertEqual(badgeOf(items[0]), "✓", "nur Gramm → ✓");
  addOne(items, { name: "Ingwer" }, { now: at(1), id: nextId() });
  assertEqual(items.length, 1);
  assertEqual(itemLabel(items[0]), "200g + 1 Ingwer");
  assertEqual(badgeOf(items[0]), "1");
});

test("T5 / FR01.recipeThenCatalogThenFriend: Rezept, Kachel, Freund → EINE offene Zeile, keine fr-Zeile", () => {
  const { items: agg } = aggregateIngredients([recipe("a", ["1 Stück Ingwer 🛒"])]);
  let list = mergeItems([], agg, at(0)).map((x) => ({ id: "li-r", author: "local", deleted: false, ...x }));
  addOne(list, { name: "Ingwer" }, { now: at(1), id: nextId() });
  list = applyFriendItems(list, [{ id: "u1", name: "Ingwer", author: "Anna" }], { now: at(2) }).items;
  assertEqual(live(list).length, 1);
  assert(!list.some((x) => x.id.startsWith("fr-")), "kein neuer Freundes-Artikel");
  assertEqual(itemLabel(list[0]), "3 Stück Ingwer");
});

test("T5 / BH-07 / FR01.mergeItems.tombstoneBeforeLive: Tombstone + offene Zeile → die offene wird erhöht", () => {
  const existing = onList([
    { name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", qty: 1, done: false, deleted: true },
    { name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", qty: 1, done: false },
  ]);
  const out = mergeItems(existing, [{ name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", qty: 1, done: false, sources: ["x"] }], at(1));
  assertEqual(live(out).length, 1);
  assertEqual(live(out)[0].id, existing[1].id);
  assertEqual(live(out)[0].amount, 2);
  assertEqual(out.find((x) => x.id === existing[0].id).deleted, true, "Tombstone bleibt gelöscht");
});

test("T5 / FR01.mergeItems.idempotentRepeat: dasselbe Rezept zweimal → gleich viele Zeilen (Menge doppelt)", () => {
  const r = R.find((x) => x.ingredients.includes("1 Stück Ingwer, gerieben 🛒"));
  const { items } = aggregateIngredients([r]);
  const once = mergeItems([], items, at(0));
  const twice = mergeItems(once, items, at(1));
  assertEqual(twice.length, once.length);
});

test("T5 / DG-12 / FR01.friend.replayAfterDelete: derselbe Vorschlag nochmal (seen verloren) → keine doppelte id", () => {
  const first = applyFriendItems([], [{ id: "u1", name: "Hafermilch" }], { now: at(0) }).items;
  first[0].deleted = true;                                 // Marcel löscht ihn
  const again = applyFriendItems(first, [{ id: "u1", name: "Hafermilch" }], { now: at(1), seen: [] });
  const ids = again.items.map((x) => x.id);
  assertEqual(new Set(ids).size, ids.length, "ids eindeutig");
  assertEqual(live(again.items).length, 0, "bleibt gelöscht");
  assertEqual(again.added, 0);
});

test("T5: andere Einheiten in einer Zeile — addAmount summiert gleiche Art, „Stück“ = keine Einheit", () => {
  const row = { name: "Joghurt", amount: 200, unit: "g", qty: 1 };
  addAmount(row, 2, "EL");
  addAmount(row, 100, "g");
  assertEqual(itemLabel(row), "300g + 2 EL Joghurt");
  const count = { name: "Zitronen", amount: null, unit: null, qty: 1 };
  addAmount(count, 2, "Stück");
  assertEqual(count.qty, 3, "Zählzeile bleibt Zählzeile (mit +/−)");
  assertEqual(count.amount, null);
});

/* ============================================================
   T5 / BH-08 — zwei Geräte, derselbe Artikel (FR01.sync.sameKeyDifferentIdMerge)
   ============================================================ */

test("T5 / BH-08: Marcel und Partner fügen beide Ingwer hinzu → nach dem Abgleich EINE Zeile (2 Stück); 2. Abgleich schreibt nicht", () => {
  const A = [{ id: "li-b", name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", qty: 1, done: false, updated: at(1), author: "local", deleted: false }];
  const B = [{ id: "li-a", name: "Ingwer", amount: null, unit: null, qty: 1, done: false, updated: at(2), author: "local", deleted: false }];
  const first = syncStep(A, B, at(3));
  assertEqual(live(first.merged).length, 1);
  const row = live(first.merged)[0];
  assertEqual(row.id, "li-a", "kleinste id bleibt — jedes Gerät wählt dieselbe");
  assertEqual(itemLabel(row), "Ingwer");
  assertEqual(row.qty, 2);
  assertEqual(first.merged.find((x) => x.id === "li-b").deleted, true, "die andere wird Tombstone (erreicht den Partner)");
  const second = syncStep(first.merged, first.merged, at(4));
  assert(!second.writeRemote && !second.writeLocal, "stabil");
  // Das andere Gerät faltet unabhängig genauso → beide landen beim selben Stand.
  const other = syncStep(B, A, at(5));
  assertEqual(live(other.merged)[0].id, "li-a");
  assertEqual(live(other.merged)[0].qty, 2);
});

test("T5: abgehakt und offen werden nicht zusammengelegt (gekauft ≠ noch zu kaufen)", () => {
  const items = onList([
    { name: "Milch", qty: 1, done: true, amount: null, unit: null },
    { name: "Milch", qty: 1, done: false, amount: null, unit: null },
  ]);
  assertEqual(foldSameItems(items, at(1)).filter((x) => !x.deleted).length, 2);
});

test("T5 / FR01.invariant.noDuplicateIds: Rezept → Kachel → Freund → zweites Gerät → Abgleich: ids eindeutig, je Artikel eine offene Zeile", () => {
  const ing = R.filter((r) => r.ingredients.some((i) => /Ingwer/.test(i)));
  const check = (items, step) => {
    const ids = items.map((x) => x.id);
    assertEqual(new Set(ids).size, ids.length, `${step}: ids eindeutig`);
    const keys = items.filter((x) => !x.deleted).map((x) => sameKey(x.nameDe || x.name) + (x.done ? "✓" : ""));
    assertEqual(new Set(keys).size, keys.length, `${step}: je Artikel eine offene Zeile`);
  };
  let A = mergeItems([], aggregateIngredients(ing.slice(0, 4)).items, at(0)).map((x) => ({ id: nextId(), author: "local", deleted: false, ...x }));
  check(A, "Rezepte");
  addOne(A, { name: "Ingwer" }, { now: at(1), id: nextId() });
  check(A, "Kachel");
  A = applyFriendItems(A, [{ id: "u1", name: "Ingwer" }, { id: "u2", name: "Zitronen" }], { now: at(2) }).items;
  check(A, "Freund");
  let B = mergeItems([], aggregateIngredients(ing.slice(3)).items, at(3)).map((x) => ({ id: nextId(), author: "local", deleted: false, ...x }));
  addOne(B, { name: "Zitronen" }, { now: at(4), id: nextId() });
  check(B, "Gerät B");
  const s1 = syncStep(A, B, at(5));
  check(s1.merged, "Abgleich A↔B");
  const s2 = syncStep(B, s1.merged, at(6));
  check(s2.merged, "Abgleich B");
  assertEqual(live(s2.merged, "Ingwer").length, 1);
});

/* ============================================================
   Smoke-Test über alle Basis-Rezepte (TW-13)
   ============================================================ */

test("TW-13: alle Basis-Rezepte → keine Zeile mit „, <Zahl>“ im Namen, keine 🛒 im Namen", () => {
  const { items } = aggregateIngredients(R);
  const bad = items.filter((x) => /,\s+\d/.test(x.nameDe) || /🛒/.test(x.nameDe));
  assertDeepEqual(bad.map((x) => x.nameDe), []);
  const keys = items.map((x) => sameKey(x.nameDe));
  assertEqual(new Set(keys).size, keys.length, "jede Zutat genau einmal");
});

test("T5: findSame bevorzugt die offene Zeile, sonst den Tombstone, sonst null", () => {
  const items = onList([
    { name: "Feta", qty: 1, done: false, amount: null, unit: null, deleted: true },
    { name: "Feta", qty: 2, done: false, amount: null, unit: null },
  ]);
  assertEqual(findSame(items, "feta").qty, 2);
  assertEqual(findSame([items[0]], "Feta").deleted, true);
  assertEqual(findSame(items, "Brot"), null);
});
