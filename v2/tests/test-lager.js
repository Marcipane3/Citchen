// Tests: lager/logic.js — Vorrat (toggle/add/remove/group) + Kühlschrank
// (add/dedup/merge) + getInStockNames (Einkaufslisten-Subtraktion).
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  seedPantry, togglePantry, addPantryItem, removePantryItem, groupPantry,
  addFridgeItem, removeFridgeItem, mergeFridge, getInStockNames, PANTRY_CATEGORIES,
} from "../src/features/lager/logic.js";

test("seedPantry: Projektwissen-Defaults, alle on", () => {
  const p = seedPantry();
  assert(p.length >= 25);
  assert(p.every((x) => x.on === true));
  assert(p.some((x) => x.name === "Kichererbsen" && x.cat === "Konserven"));
  assert(p.some((x) => x.name === "Zimt" && x.cat === "Gewürze"));
});

test("togglePantry: schaltet nur den Treffer um (immutabel)", () => {
  const p = seedPantry();
  const t1 = togglePantry(p, "Reis");
  assertEqual(t1.find((x) => x.name === "Reis").on, false);
  assertEqual(p.find((x) => x.name === "Reis").on, true, "Original unverändert");
  assertEqual(togglePantry(t1, "Reis").find((x) => x.name === "Reis").on, true);
});

test("addPantryItem: custom hinzufügen, Duplikat ignorieren", () => {
  let p = seedPantry();
  const n = p.length;
  p = addPantryItem(p, "Tahin", "Sonstiges");
  assertEqual(p.length, n + 1);
  assert(p.find((x) => x.name === "Tahin").custom);
  p = addPantryItem(p, "reis", "Trockenwaren"); // Duplikat (case-insensitive)
  assertEqual(p.length, n + 1);
});

test("removePantryItem", () => {
  let p = addPantryItem(seedPantry(), "Tahin", "Sonstiges");
  p = removePantryItem(p, "Tahin");
  assert(!p.some((x) => x.name === "Tahin"));
});

test("groupPantry: nach Kategorien, leere weg, Reihenfolge", () => {
  const groups = groupPantry(seedPantry());
  assert(groups.length >= 4);
  assertEqual(groups[0].cat, PANTRY_CATEGORIES[0]);
  assert(groups.every((g) => g.items.length > 0));
});

test("addFridgeItem: hinzufügen + Dedup (neue Menge gewinnt)", () => {
  let f = [];
  f = addFridgeItem(f, "Feta", "200g");
  f = addFridgeItem(f, "Zucchini", "1 Stück");
  assertEqual(f.length, 2);
  f = addFridgeItem(f, "feta", "100g"); // Dedup
  assertEqual(f.length, 2);
  assertEqual(f.find((x) => x.name === "Feta").menge, "100g");
});

test("mergeFridge: mehrere Scan-Items zusammenführen", () => {
  const f = mergeFridge([{ name: "Milch", menge: "1L" }], [{ name: "Eier", menge: "6" }, { name: "milch", menge: "halb" }]);
  assertEqual(f.length, 2);
  assertEqual(f.find((x) => x.name === "Milch").menge, "halb");
});

test("removeFridgeItem", () => {
  const f = removeFridgeItem([{ name: "Feta", menge: "" }, { name: "Eier", menge: "" }], "Feta");
  assertDeepEqual(f.map((x) => x.name), ["Eier"]);
});

test("getInStockNames: Vorrat-on + alle Kühlschrank-Artikel", () => {
  const pantry = [{ name: "Reis", on: true }, { name: "Bulgur", on: false }];
  const fridge = [{ name: "Feta", menge: "200g" }];
  assertDeepEqual(getInStockNames(pantry, fridge), ["Reis", "Feta"]);
});
