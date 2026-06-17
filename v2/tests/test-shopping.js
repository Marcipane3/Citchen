// Tests: shopping/logic.js + catalog.js — Vorrats-Abzug (🛒-Konvention + Fallback),
// Aggregation mit Mengensummen, Katalog-Zuordnung, Merge-Verhalten.
import { test, assert, assertEqual } from "./runner.js";
import { needsBuying, aggregateIngredients, mergeItems, itemKey, itemLabel, formatListAsText, DEFAULT_STAPLES } from "../src/features/shopping/logic.js";
import { ingMatchCat, CATALOG, SECTION_ORDER } from "../src/features/shopping/catalog.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(join(__dirname, "..", "data", "rezepte.snapshot.json"), "utf8")).recipes;

/* ---------- Vorrats-Abzug ---------- */

test("needsBuying: 🛒-Konvention — markiert kaufen, unmarkiert Vorrat", () => {
  assert(needsBuying("2 Knoblauchzehen, gehackt 🛒", { recipeUsesMarkers: true }));
  assert(!needsBuying("400g Kichererbsen (Dose)", { recipeUsesMarkers: true }));
  assert(!needsBuying("Salz, Pfeffer, Öl", { recipeUsesMarkers: true }));
});

test("needsBuying: Fallback ohne Marker — Vorratsliste entscheidet", () => {
  // Rezept ohne jegliche 🛒-Marker (z.B. die zwei alten Rezepte)
  assert(!needsBuying("400g Kichererbsen (Dose, abgetropft)", { recipeUsesMarkers: false }), "Kichererbsen sind Vorrat");
  assert(!needsBuying("1 Zwiebel, gewürfelt", { recipeUsesMarkers: false }), "Zwiebeln sind Vorrat");
  assert(needsBuying("2 Süßkartoffeln, gewürfelt", { recipeUsesMarkers: false }), "Süßkartoffeln sind KEIN Vorrat");
  assert(needsBuying("200g Feta", { recipeUsesMarkers: false }), "Feta ist kein Vorrat");
});

test("needsBuying: eigene Staples-Liste überschreibt Default", () => {
  assert(needsBuying("400g Kichererbsen", { recipeUsesMarkers: false, staples: ["Mehl"] }));
  assert(!needsBuying("500g Mehl", { recipeUsesMarkers: false, staples: ["Mehl"] }));
});

/* ---------- Katalog-Zuordnung ---------- */

test("ingMatchCat: ordnet echte Zutaten sinnvollen Gängen zu", () => {
  assertEqual(ingMatchCat("2 Süßkartoffeln, gewürfelt").cat, "Gemüse");
  assertEqual(ingMatchCat("200g Feta").cat, "Käse");
  assertEqual(ingMatchCat("400ml Kokosmilch (Dose)").cat, "Konserven & Vorrat");
  assertEqual(ingMatchCat("völlig unbekanntes Dings"), null);
});

test("CATALOG: 14 Gänge, SECTION_ORDER endet mit Sonderfächern", () => {
  assertEqual(CATALOG.length, 14);
  assertEqual(SECTION_ORDER[SECTION_ORDER.length - 1], "Sonstiges");
  assertEqual(SECTION_ORDER[SECTION_ORDER.length - 2], "Aus Rezepten");
});

/* ---------- Aggregation ---------- */

test("aggregateIngredients: Shakshuka — nur 🛒-Zutaten, Rest übersprungen", () => {
  const shak = R.find((r) => r.name === "Shakshuka");
  const { items, skipped } = aggregateIngredients([shak]);
  // 🛒 in Shakshuka: Knoblauch, Feta+Petersilie, Brot → 3 markierte Zeilen
  const marked = shak.ingredients.filter((i) => /🛒/.test(i)).length;
  assertEqual(items.length, marked);
  assertEqual(skipped, shak.ingredients.length - marked);
});

test("aggregateIngredients: gleiche Zutat + Einheit über Rezepte summiert", () => {
  const a = { id: "a", name: "A", category: "Pasta & Nudeln", ingredients: ["200g Feta 🛒", "1 Zitrone 🛒"] };
  const b = { id: "b", name: "B", category: "Pasta & Nudeln", ingredients: ["100g Feta 🛒"] };
  const { items } = aggregateIngredients([a, b]);
  const feta = items.find((i) => i.name === "Feta");
  assertEqual(feta.amount, 300);
  assertEqual(feta.unit, "g");
  assertEqual(feta.sources.length, 2);
  assertEqual(feta.cat, "Käse");
  const zitrone = items.find((i) => i.name === "Zitrone");
  assertEqual(zitrone.amount, 1);
});

test("aggregateIngredients: Portions-Faktor skaliert Mengen", () => {
  const a = { id: "a", name: "A", category: "Pasta & Nudeln", ingredients: ["200g Feta 🛒"] };
  const { items } = aggregateIngredients([a], { factorById: { a: 2 } });
  assertEqual(items[0].amount, 400);
});

test("aggregateIngredients: unterschiedliche Einheiten bleiben getrennt", () => {
  const a = { id: "a", name: "A", category: "Pasta & Nudeln", ingredients: ["200g Joghurt 🛒", "2 EL Joghurt 🛒"] };
  const { items } = aggregateIngredients([a]);
  assertEqual(items.length, 2);
});

test("aggregateIngredients: Rezept ohne Marker nutzt Staples-Fallback", () => {
  const curry = R.find((r) => r.id === "r01"); // Süßkartoffel-Curry, keine Marker
  const { items } = aggregateIngredients([curry]);
  const names = items.map((i) => i.name.toLowerCase());
  assert(names.some((n) => n.includes("süßkartoffel")), "Süßkartoffeln müssen auf die Liste");
  assert(!names.some((n) => n.includes("kichererbsen")), "Kichererbsen (Vorrat) nicht auf der Liste");
  assert(!names.some((n) => n.includes("kokosmilch")), "Kokosmilch (Vorrat) nicht auf der Liste");
});

/* ---------- Merge & Label ---------- */

test("mergeItems: summiert Mengen, erhöht qty, weckt erledigte Artikel", () => {
  const existing = [
    { name: "Feta", amount: 200, unit: "g", cat: "Käse", icon: "🧀", qty: 1, done: true },
    { name: "Brot", amount: null, unit: null, cat: "Brot & Backwaren", icon: "🍞", qty: 1, done: false },
  ];
  const incoming = [
    { name: "Feta", amount: 100, unit: "g", cat: "Käse", icon: "🧀", qty: 1, done: false },
    { name: "Brot", amount: null, unit: null, cat: "Brot & Backwaren", icon: "🍞", qty: 1, done: false },
    { name: "Minze", amount: null, unit: null, cat: "Aus Rezepten", icon: "🍳", qty: 1, done: false },
  ];
  const out = mergeItems(existing, incoming);
  assertEqual(out.length, 3);
  const feta = out.find((x) => x.name === "Feta");
  assertEqual(feta.amount, 300);
  assertEqual(feta.done, false, "wieder offen (v1-Verhalten)");
  assertEqual(out.find((x) => x.name === "Brot").qty, 2);
  // Original unverändert (keine Mutation)
  assertEqual(existing[0].amount, 200);
});

test("itemKey/itemLabel", () => {
  assertEqual(itemKey("  Feta ", "g"), "feta|g");
  assertEqual(itemLabel({ name: "Feta", amount: 300, unit: "g" }), "300g Feta");
  assertEqual(itemLabel({ name: "Zitrone", amount: 1.5, unit: null }), "1,5 Zitrone");
  assertEqual(itemLabel({ name: "Brot", amount: null, unit: null, qty: 2 }), "Brot");
});

/* ---------- formatListAsText ---------- */

test("formatListAsText: leere Liste → leerer String", () => {
  assertEqual(formatListAsText([]), "");
});

test("formatListAsText: offene Artikel bekommen • Prefix, erledigte ✓", () => {
  const items = [
    { name: "Feta", amount: 200, unit: "g", cat: "Käse", icon: "🧀", qty: 1, done: false },
    { name: "Brot", amount: null, unit: null, cat: "Brot & Backwaren", icon: "🍞", qty: 1, done: true },
  ];
  const text = formatListAsText(items);
  assert(text.includes("• 200g Feta"), "offener Artikel mit Menge");
  assert(text.includes("✓ Brot"), "erledigter Artikel");
});

test("formatListAsText: qty > 1 ohne Menge zeigt ×qty", () => {
  const items = [{ name: "Zitrone", amount: null, unit: null, cat: "Gemüse", icon: "🍋", qty: 3, done: false }];
  const text = formatListAsText(items);
  assert(text.includes("• Zitrone ×3"), "qty ×3");
});

test("formatListAsText: offene Artikel vor erledigten innerhalb Sektion", () => {
  const items = [
    { name: "Butter", amount: null, unit: null, cat: "Milchprodukte", icon: "🧈", qty: 1, done: true },
    { name: "Milch", amount: null, unit: null, cat: "Milchprodukte", icon: "🥛", qty: 1, done: false },
  ];
  const text = formatListAsText(items);
  const milchIdx = text.indexOf("• Milch");
  const butterIdx = text.indexOf("✓ Butter");
  assert(milchIdx < butterIdx, "offene vor erledigten");
});

test("formatListAsText: Sektionen folgen SECTION_ORDER", () => {
  const items = [
    { name: "Brot", amount: null, unit: null, cat: "Brot & Backwaren", icon: "🍞", qty: 1, done: false },
    { name: "Äpfel", amount: null, unit: null, cat: "Obst", icon: "🍎", qty: 1, done: false },
  ];
  const text = formatListAsText(items);
  // Obst kommt vor Brot & Backwaren in SECTION_ORDER
  const obstIdx = text.indexOf("Obst");
  const brotIdx = text.indexOf("Brot & Backwaren");
  assert(obstIdx < brotIdx || (obstIdx === -1 && brotIdx === -1), "Reihenfolge aus SECTION_ORDER");
});

test("DEFAULT_STAPLES: deckt die Projektwissen-Gewürze ab", () => {
  for (const g of ["Salz", "Pfeffer", "Paprikapulver", "Kreuzkümmel", "Curry", "Chiliflocken", "Rosmarin", "Muskat", "Zimt"]) {
    assert(DEFAULT_STAPLES.includes(g), g);
  }
});
