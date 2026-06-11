// Tests: filter.js — Suche & Filter (pur, gegen echte Daten) + export.js.
import { test, assert, assertEqual } from "./runner.js";
import { availableChips, chipLabel, filterRecipes, distinctValues } from "../src/features/cookbook/filter.js";
import { exportMarkdown } from "../src/features/cookbook/export.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(__dirname, "..", "data", "rezepte.snapshot.json"), "utf8"));
const R = DATA.recipes;

/* ---------- Suche (v1-Parität: Name ODER Zutat) ---------- */

test("Suche nach Name: 'curry' findet Currys", () => {
  const hits = filterRecipes(R, { query: "curry" });
  assert(hits.length >= 3, `erwartet ≥3 Treffer, war ${hits.length}`);
  assert(hits.some((r) => r.name === "Süßkartoffel-Curry mit Kichererbsen"));
});

test("Suche nach Zutat: 'kichererbsen' findet Rezepte ohne den Namen", () => {
  const hits = filterRecipes(R, { query: "kichererbsen" });
  assert(hits.some((r) => r.name === "Pasta e Ceci"), "Pasta e Ceci hat Kichererbsen als Zutat");
});

test("Suche: Groß/klein egal, leere Suche = alles", () => {
  assertEqual(filterRecipes(R, { query: "HUMMUS" }).length, filterRecipes(R, { query: "hummus" }).length);
  assertEqual(filterRecipes(R, { query: "" }).length, R.length);
});

/* ---------- Chips ---------- */

test("Chips: Alle + Favoriten + vorhandene Spezials + benutzte Kategorien", () => {
  const chips = availableChips(R);
  assertEqual(chips[0], "Alle");
  assertEqual(chips[1], "__fav");
  assert(chips.includes("__alltag") && chips.includes("__besonders"));
  assert(chips.includes("__mealprep") && chips.includes("__totry"));
  assert(chips.includes("__quick"), "≤30-Min-Chip muss bei echten Daten erscheinen");
  assert(chips.includes("Pasta & Nudeln"));
  // 16 benutzte Kategorien + Alle + fav + 5 Spezials
  assertEqual(chips.length, 2 + 5 + 16);
});

test("Chips: Spezial-Chips fehlen, wenn Daten sie nicht hergeben", () => {
  const minimal = [{ id: "a", name: "X", category: "Pasta & Nudeln" }];
  const chips = availableChips(minimal);
  assert(!chips.includes("__alltag") && !chips.includes("__mealprep") && !chips.includes("__quick"));
});

test("chipLabel: Kürzungen wie v1", () => {
  assertEqual(chipLabel("Alle"), "Alle");
  assertEqual(chipLabel("__fav"), "♥ Favoriten");
  assertEqual(chipLabel("Backen: Süßes & Kuchen"), "Backen");
  assertEqual(chipLabel("Middle Eastern & Mediterran"), "Middle");
});

/* ---------- Filterlogik ---------- */

test("Filter effort: alltag/besonders disjunkt und vollständig (103 von 105)", () => {
  const a = filterRecipes(R, { chip: "__alltag" });
  const b = filterRecipes(R, { chip: "__besonders" });
  assertEqual(a.length + b.length, 103); // 2 alte Rezepte ohne effort
  assert(a.every((r) => r.effort === "alltag"));
});

test("Filter mealPrep & toTry: korrekte Zählung gegen echte Daten", () => {
  assertEqual(filterRecipes(R, { chip: "__mealprep" }).length, 80);
  assertEqual(filterRecipes(R, { chip: "__totry" }).length, 27);
});

test("Filter __quick: alle Treffer haben totalMinutes ≤ 30", () => {
  const q = filterRecipes(R, { chip: "__quick" });
  assert(q.length > 0);
  assert(q.every((r) => (r.totalTime ?? 999) <= 30 || !r.totalTime));
});

test("Filter Kategorie: exakte Zuordnung", () => {
  assertEqual(filterRecipes(R, { chip: "Backen: Süßes & Kuchen" }).length, 13);
  assertEqual(filterRecipes(R, { chip: "Pasta & Nudeln" }).length, 7);
});

test("Filter kombiniert: Chip + Suche + Küche", () => {
  const hits = filterRecipes(R, { chip: "__besonders", query: "auberginen", cuisine: "Italienisch" });
  assertEqual(hits.length, 1);
  assertEqual(hits[0].name, "Auberginen-Parmigiana");
});

test("Filter Saison", () => {
  const herbst = filterRecipes(R, { season: "Herbst" });
  assert(herbst.length >= 3);
  assert(herbst.every((r) => r.season === "Herbst"));
});

test("distinctValues: Küchen alphabetisch, ohne Leerwerte", () => {
  const c = distinctValues(R, "cuisine");
  assertEqual(c.length, 8);
  assertEqual(c[0], "Asiatisch");
  assert(!c.includes(""));
});

/* ---------- Export ---------- */

test("exportMarkdown: Struktur wie v1 (Kategorien-Reihenfolge, Felder)", () => {
  const md = exportMarkdown(R);
  assert(md.startsWith("# 📖 Rezept-Datenbank"));
  assert(md.includes("## Frühstück & Brunch"));
  assert(md.includes("### Süßkartoffel-Curry mit Kichererbsen (★★★)"), "Rating als Sterne im Titel");
  assert(md.includes("**Zeit:** 35 Min | **Portionen:** ~4 | **Zuletzt:** Mai 2026"));
  assert(md.includes("#### Zutaten"));
  assert(md.includes("#### Zubereitung"));
  assert(md.includes("#### Tipps"));
  // Kategorie-Reihenfolge: Frühstück vor Grundrezepte
  assert(md.indexOf("## Frühstück & Brunch") < md.indexOf("## Grundrezepte & Basissoßen"));
});

test("exportMarkdown: leere Kategorien tauchen nicht auf", () => {
  const md = exportMarkdown([{ id: "a", name: "Nur Pasta", category: "Pasta & Nudeln" }]);
  assert(md.includes("## Pasta & Nudeln"));
  assert(!md.includes("## Frühstück & Brunch"));
});
