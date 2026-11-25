// Tests: estimateNutrition (L2.1) — pur, mit kleinem Test-Stamm und einer Sonde über den Snapshot.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { readFileSync } from "node:fs";
import { estimateNutrition, parseServings } from "../src/data/nutrition.js";
import { buildIndex, matchLine } from "../src/data/ingredientMatch.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const ing = (id, de, extra = {}) => ({ id, names: { de, en: id, es: id, da: id }, base: "g", shop: "g", ...extra });
const MASTER = { version: 1, ingredients: [
  ing("rice", "Reis", { per100: { kcal: 350, protein: 7, carbs: 78, fat: 1 } }),
  ing("egg", "Ei", { plural: { de: "Eier" }, units: { piece: 50 }, per100: { kcal: 140, protein: 12, carbs: 1, fat: 10 } }),
  ing("salt", "Salz", { per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }),
  ing("mystery", "Mystery"), // Gewicht ja, per100 nein
] };
const R = (items, servings = "2") => ({ id: "x", name: "x", servings, items });
const it = (o) => ({ text: "t", buy: false, optional: false, ...o });

test("nutrition: sums per100 × grams over matched items", () => {
  const r = estimateNutrition(R([it({ ing: "rice", amount: 200, unit: "g" }), it({ ing: "egg", amount: 2, unit: "piece" })]), MASTER);
  assertDeepEqual(r.total, { kcal: 840, protein: 26, carbs: 157, fat: 12 });
  assertDeepEqual(r.perServing, { kcal: 420, protein: 13, carbs: 78.5, fat: 6 });
  assertEqual(r.matched, 1);
  assertEqual(r.approx, false);
  assertEqual(r.none, false);
});

test("nutrition: no-amount lines do not lower the share", () => {
  const r = estimateNutrition(R([it({ ing: "rice", amount: 100, unit: "g" }), it({ text: "Salz nach Geschmack", ing: "salt" }), it({ text: "etwas Deko" })]), MASTER);
  assertEqual(r.matched, 1);
  assertEqual(r.none, false);
});

const share = (known, unknown) => estimateNutrition(R([it({ ing: "rice", amount: known, unit: "g" }), it({ ing: "mystery", amount: unknown, unit: "g" })]), MASTER);
test("nutrition: matched < 0.5 → none, no numbers", () => {
  const r = share(49, 51);
  assertEqual(r.none, true); assertEqual(r.perServing, null); assertEqual(r.total, null);
});
test("nutrition: 0.5 exactly is approx (boundary)", () => {
  const r = share(50, 50);
  assertEqual(r.matched, 0.5); assertEqual(r.none, false); assertEqual(r.approx, true);
});
test("nutrition: 0.5–0.8 approx, 0.8 exactly is not approx (boundary)", () => {
  assertEqual(share(79, 21).approx, true);
  const r = share(80, 20);
  assertEqual(r.matched, 0.8); assertEqual(r.approx, false);
});

test("nutrition: parseServings takes first integer, lower bound, else null", () => {
  assertEqual(parseServings("~4"), 4);
  assertEqual(parseServings("4"), 4);
  assertEqual(parseServings("2–3"), 2);
  assertEqual(parseServings("1 Zucchini, 2 Paprika"), 1);
  assertEqual(parseServings("einige"), null);
  assertEqual(parseServings(undefined), null);
});

test("nutrition: unparseable servings → total only, perServing null", () => {
  const r = estimateNutrition(R([it({ ing: "rice", amount: 100, unit: "g" })], "reicht für alle"), MASTER);
  assertEqual(r.perServing, null);
  assertEqual(r.total.kcal, 350);
});

test("nutrition: amountMax range uses the lower bound; stated g wins", () => {
  const range = matchLine("4–5 Eier", buildIndex(MASTER));
  assertEqual(range[0].amountMax, 5);
  const a = estimateNutrition(R(range, "1"), MASTER);
  assertEqual(a.total.kcal, 280); // 4 × 50 g × 1,4
  const b = estimateNutrition(R([it({ ing: "egg", amount: 4, unit: "piece", g: 100 })], "1"), MASTER);
  assertEqual(b.total.kcal, 140);
});

test("nutrition: missing items or master → null, never throws, input not mutated", () => {
  assertEqual(estimateNutrition({ id: "x", servings: "2" }, MASTER), null);
  assertEqual(estimateNutrition(R([]), MASTER), null);
  assertEqual(estimateNutrition(R([it({ ing: "rice", amount: 1, unit: "g" })]), undefined), null);
  assertEqual(estimateNutrition(R([it({ ing: "rice", amount: 1, unit: "g" })]), {}), null);
  assertEqual(estimateNutrition(null, MASTER), null);
  assertEqual(estimateNutrition(R([it({ text: "Salz" })]), MASTER), null);
  const rec = R([it({ ing: "rice", amount: 100, unit: "g" })]);
  const before = JSON.stringify(rec);
  estimateNutrition(rec, MASTER);
  assertEqual(JSON.stringify(rec), before);
});

test("nutrition: probe over the snapshot — no throw, finite kcal/serving unless none", () => {
  const master = read("../data/ingredients.json");
  const index = buildIndex(master);
  const { recipes } = read("../data/rezepte.snapshot.json");
  let estimated = 0;
  for (const rec of recipes) {
    const items = (rec.ingredients || []).flatMap((l) => matchLine(l, index));
    const r = estimateNutrition({ ...rec, items }, index);
    if (!r || r.none) continue;
    assert(Number.isFinite(r.total.kcal), `${rec.id}: total kcal`);
    if (r.perServing) { assert(Number.isFinite(r.perServing.kcal), `${rec.id}: kcal/serving`); estimated++; }
  }
  assert(estimated > 0, "at least one recipe is estimated");
});
