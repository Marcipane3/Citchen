// Tests: schema.js — Kategorien, Validierung, ID-Vergabe, Defaults.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { CATEGORIES, validateRecipe, validateCollection, makeIdFactory, withDefaults } from "../src/data/schema.js";

test("CATEGORIES: exakt 16, exakte Strings (SCHEMA.md)", () => {
  assertEqual(CATEGORIES.length, 16);
  assertEqual(CATEGORIES[0], "Frühstück & Brunch");
  assertEqual(CATEGORIES[9], "Middle Eastern & Mediterran");
  assertEqual(CATEGORIES[15], "Grundrezepte & Basissoßen");
});

test("validateRecipe: gültiges Minimal-Rezept", () => {
  const r = { id: "r1", name: "Test", category: "Pasta & Nudeln" };
  const res = validateRecipe(r);
  assert(res.valid, res.errors.join("; "));
});

test("validateRecipe: volles v3-Rezept gültig", () => {
  const r = {
    id: "r2", name: "Voll", category: "Wochenend-Gerichte",
    time: "40 Min", servings: "~4", lastCooked: "Mai 2026",
    rating: 3, favorite: true, cookedCount: 2, image: "", photos: [{ id: "x", added: "2026-01-01" }],
    feedback: "", ingredients: ["1 Ei"], steps: ["Kochen."], tips: "Topping: Feta.",
    effort: "besonders", difficulty: "mittel", cuisine: "Italienisch",
    prepTime: 10, cookTime: 30, totalTime: 40, mealPrep: true, toTry: false,
    season: "Sommer", tags: ["bowl"],
  };
  const res = validateRecipe(r);
  assert(res.valid, res.errors.join("; "));
});

test("validateRecipe: falsche Kategorie abgelehnt", () => {
  const res = validateRecipe({ id: "r3", name: "X", category: "Desserts" });
  assert(!res.valid);
  assert(res.errors.some((e) => e.includes("category")));
});

test("validateRecipe: fehlender Name abgelehnt", () => {
  const res = validateRecipe({ id: "r4", category: "Pasta & Nudeln" });
  assert(!res.valid);
});

test("validateRecipe: rating > 5 abgelehnt, Typfehler erkannt", () => {
  assert(!validateRecipe({ id: "a", name: "A", category: "Pasta & Nudeln", rating: 6 }).valid);
  assert(!validateRecipe({ id: "a", name: "A", category: "Pasta & Nudeln", ingredients: "kein Array" }).valid);
  assert(!validateRecipe({ id: "a", name: "A", category: "Pasta & Nudeln", effort: "extrem" }).valid);
});

test("validateCollection: doppelte IDs erkannt", () => {
  const res = validateCollection({
    version: 3, updated: "x",
    recipes: [
      { id: "r1", name: "A", category: "Pasta & Nudeln" },
      { id: "r1", name: "B", category: "Pasta & Nudeln" },
    ],
  });
  assert(!res.valid);
  assert(res.errors.some((e) => e.includes("Doppelte ID")));
});

test("makeIdFactory: 'r'+Timestamp, Batch eindeutig", () => {
  let t = 1750000000000;
  const next = makeIdFactory([], () => t);
  const ids = [next(), next(), next()];
  assertDeepEqual(ids, ["r1750000000000", "r1750000000001", "r1750000000002"]);
});

test("makeIdFactory: weicht bestehenden IDs aus", () => {
  let t = 1750000000000;
  const next = makeIdFactory(["r1750000000000", "r1750000000001"], () => t);
  assertEqual(next(), "r1750000000002");
});

test("withDefaults: füllt genau die v1-Felder, ändert Vorhandenes nicht", () => {
  const r = { id: "r1", name: "A", category: "Pasta & Nudeln", rating: 4 };
  const out = withDefaults(r);
  assertEqual(out.rating, 4);
  assertEqual(out.favorite, false);
  assertEqual(out.cookedCount, 0);
  assertDeepEqual(out.photos, []);
  assertEqual(out.image, "");
  assertEqual(out.feedback, "");
  assertEqual(r.favorite, undefined, "Original darf nicht mutiert werden");
});
