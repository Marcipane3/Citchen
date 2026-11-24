// Tests: items.js (R3.2, #107) — relinkItems / withItems.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { buildIndex } from "../src/data/ingredientMatch.js";
import { relinkItems, withItems } from "../src/data/items.js";

const ing = (id, de, extra = {}) => ({ id, names: { de, en: id, es: id, da: id }, base: "g", shop: "g", ...extra });
const index = buildIndex({ ingredients: [
  ing("rice", "Reis"), ing("salt", "Salz"), ing("egg", "Ei", { plural: { de: "Eier" }, units: { piece: 55 } }),
  ing("butter", "Butter"),
] });

const recipe = (ingredients, items) => ({ id: "r1", name: "X", category: "Pasta & Nudeln", ingredients, ...(items ? { items } : {}) });

test("relink: Zeile ohne Item läuft durch matchLine (Treffer mit ing, Rest als freier Text)", () => {
  const items = relinkItems(recipe(["200 g Reis", "Zitronenschale"]), index);
  assertEqual(items.length, 2);
  assertEqual(items[0].ing, "rice");
  assertEqual(items[0].text, "200 g Reis");
  assertEqual(items[1].text, "Zitronenschale");
  assert(!("ing" in items[1]), "unbekannte Zeile bekommt kein ing");
});

test("relink: vorhandenes Item gleichen Textes bleibt (manuelle Korrektur überlebt)", () => {
  const fixed = { text: "200 g Reis", ing: "butter", amount: 1, buy: false, optional: false };
  const items = relinkItems(recipe(["200 g Reis"], [fixed]), index);
  assertDeepEqual(items, [fixed]);
});

test("relink: Item, dessen Text nicht mehr in ingredients steht, fällt weg", () => {
  const stale = { text: "3 Eier", ing: "egg", buy: false, optional: false };
  const items = relinkItems(recipe(["Salz"], [stale]), index);
  assertEqual(items.length, 1);
  assertEqual(items[0].text, "Salz");
});

test("relink: alter Client entfernt/ordnet Zeilen um → kein Item an der falschen Zeile", () => {
  const a = { text: "200 g Reis", ing: "rice", amount: 200, unit: "g", g: 200, buy: false, optional: false };
  const b = { text: "3 Eier", ing: "egg", amount: 3, buy: false, optional: false };
  const c = { text: "Salz", ing: "salt", buy: false, optional: false };
  // Ausgang: [Reis, Eier, Salz]; alter Client entfernt Eier und dreht um → [Salz, Reis]
  const items = relinkItems(recipe(["Salz", "200 g Reis"], [a, b, c]), index);
  assertDeepEqual(items.map((i) => i.text), ["Salz", "200 g Reis"]);
  assertEqual(items[0].ing, "salt");
  assertEqual(items[1].ing, "rice");
  // Zeile bearbeitet („3 Eier“ → „4 Eier“): das alte Item hängt nicht an der neuen Zeile
  const edited = relinkItems(recipe(["4 Eier"], [b]), index);
  assertEqual(edited.length, 1);
  assertEqual(edited[0].text, "4 Eier");
  assertEqual(edited[0].amount, 4);
});

test("relink: ingredients bleibt unverändert, Eingabe wird nicht mutiert", () => {
  const r = recipe(["200 g Reis", "Salz"]);
  const before = JSON.stringify(r);
  relinkItems(r, index);
  withItems(r, index);
  assertEqual(JSON.stringify(r), before);
});

test("withItems: nichts zu ändern → dasselbe Objekt (kein Sync-Churn)", () => {
  const r = recipe(["200 g Reis"]);
  const once = withItems(r, index);
  assert(once !== r && Array.isArray(once.items), "erstes Mal hängt items an");
  assert(withItems(once, index) === once, "zweites Mal: identisches Objekt");
});

test("withItems: ohne Index bleibt das Rezept, wie es ist", () => {
  const r = recipe(["200 g Reis"]);
  assert(withItems(r, null) === r);
  assert(withItems(r, buildIndex({ ingredients: [] })) === r);
});

test("relink: kaputte items (kein Array, Einträge ohne text) werden ignoriert", () => {
  const r = { ...recipe(["Salz"]), items: [null, 3, { ing: "salt" }] };
  const items = relinkItems(r, index);
  assertEqual(items.length, 1);
  assertEqual(items[0].ing, "salt");
  assertEqual(relinkItems({ ...recipe(["Salz"]), items: "x" }, index).length, 1);
});

test("relink: gespeicherter text ist die deutsche Originalzeile", () => {
  const r = recipe(["1 Ei"]);
  assertEqual(relinkItems(r, index)[0].text, r.ingredients[0]);
});

/* ---------- Store: nur Anzeige-Sicht, kein Sync-Churn ---------- */
import { setRecipes, setItemIndex, state, getRecipesDe, setSaveChangeForTest } from "../src/store.js";

test("store: items entstehen beim Laden nur in der Anzeige-Sicht; Persistenz-Sammlung bleibt unberührt, kein Speichern", () => {
  let saves = 0;
  setSaveChangeForTest(async () => { saves++; return { meta: {}, recipes: null }; });
  try {
    const base = [recipe(["200 g Reis", "Salz"])];
    setRecipes(base, null);
    assert(!state.recipes[0].items, "ohne Stamm keine items");
    setItemIndex(index);
    assertEqual(state.recipes[0].items.length, 2);
    assertEqual(state.recipes[0].items[0].ing, "rice");
    assertDeepEqual(state.recipes[0].ingredients, ["200 g Reis", "Salz"]);
    assert(!("items" in getRecipesDe()[0]), "kanonische Sammlung (Drive/IndexedDB) bekommt keine items");
    assertEqual(saves, 0);
  } finally { setSaveChangeForTest(null); setItemIndex(null); setRecipes([], null); }
});

test("relink: doppelte Zeile ist idempotent", () => {
  const r = recipe(["1 TL Salz", "1 TL Salz", "2 Eier"]);
  const once = withItems(r, index);
  assertEqual(once.items.filter((i) => i.text === "1 TL Salz").length, 2);
  assertEqual(once.items.length, 3);
  assert(withItems(once, index) === once, "zweiter Durchlauf ändert nichts");
  assert(withItems(withItems(once, index), index) === once, "dritter auch nicht");
});

/* ---------- kaputtes items blockiert nichts ---------- */
import { updateRecipe } from "../src/store.js";
import { parseImportFile } from "../src/data/recipeImport.js";

for (const bad of [null, [{ ing: "salt" }]]) {
  test(`updateRecipe: kaputtes items (${JSON.stringify(bad)}) → favorite speichert ohne Fehler`, async () => {
    setSaveChangeForTest(async () => ({ meta: {}, recipes: null }));
    try {
      setRecipes([{ ...recipe(["Salz"]), items: bad }], null);
      const out = await updateRecipe("r1", (x) => { x.favorite = true; });
      assertEqual(out.favorite, true);
    } finally { setSaveChangeForTest(null); setRecipes([], null); }
  });
}

test("parseImportFile: kaputtes items → Rezept übernommen, items entfernt", () => {
  const file = JSON.stringify({ version: 3, recipes: [{ ...recipe(["Salz"]), items: [{ ing: "salt" }] }] });
  const res = parseImportFile(file);
  assertEqual(res.errors.length, 0);
  assertEqual(res.recipes.length, 1);
  assert(!("items" in res.recipes[0]), "items entfernt");
});

/* ---------- #112: gleiche Zeile mehrfach, eine entfernt ---------- */
test("relink #112: doppelte Zeile, eine entfernt → Items EINER Zeile, nicht vervielfacht", () => {
  const line = "200 g Reis, Salz"; // ergibt 2 Items pro Zeile
  const two = withItems(recipe([line, line]), index);
  assertEqual(two.items.length, 4, "Ausgang: 2 Items je Zeile");
  const one = relinkItems({ ...two, ingredients: [line] }, index);
  assertEqual(one.length, 2);
});

test("relink #112: Idempotenz bei 1, 2 und 3 gleichen Zeilen", () => {
  const line = "200 g Reis, Salz";
  for (const n of [1, 2, 3]) {
    const once = withItems(recipe(Array(n).fill(line)), index);
    assertEqual(once.items.length, 2 * n);
    assert(withItems(once, index) === once, `n=${n}: zweiter Durchlauf ändert nichts`);
  }
});

test("relink #112: ungleichmäßig teilbarer Bestand wird neu abgeleitet", () => {
  const line = "200 g Reis, Salz";
  const base = withItems(recipe([line, line]), index).items;
  const out = relinkItems({ ...recipe([line, line, line]), items: base }, index);
  assertEqual(out.length, 6);
});
