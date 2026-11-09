// Tests: filter.js — Suche & Filter (pur, gegen echte Daten) + export.js.
import { test, assert, assertEqual } from "./runner.js";
import {
  availableChips, chipLabel, filterRecipes, distinctValues, isSpecialChip, activeFilterCount,
  sortRecipes, cookedMonthKey, searchNorm, SORTS,
} from "../src/features/cookbook/filter.js";
import { exportMarkdown, recipeToMarkdown, CATEGORY_LABELS_EN, shareRecipeText } from "../src/features/cookbook/export.js";
import { setLang, DE_MONTHS } from "../src/i18n.js";
import { CATEGORIES } from "../src/data/schema.js";
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
  // 16 benutzte Kategorien + Alle + fav + 4 Spezials + 3 Zeit-Chips (≤ 15 / 30 / 60, v2.17)
  assert(chips.includes("__t15") && chips.includes("__t60"), "Zeit-Chips ≤ 15 und ≤ 60 bei echten Daten");
  assertEqual(chips.length, 2 + 4 + 3 + 16);
});

test("Chips: Spezial-Chips fehlen, wenn Daten sie nicht hergeben", () => {
  const minimal = [{ id: "a", name: "X", category: "Pasta & Nudeln" }];
  const chips = availableChips(minimal);
  assert(!chips.includes("__alltag") && !chips.includes("__mealprep") && !chips.includes("__quick"));
});

test("chipLabel: Kürzungen wie v1", () => {
  setLang("de");
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

/* ---------- F2: Mehrfach-Auswahl + UND/ODER ---------- */

test("isSpecialChip: Spezial vs. Kategorie", () => {
  assert(isSpecialChip("__fav") && isSpecialChip("__quick"));
  assert(!isSpecialChip("Pasta & Nudeln") && !isSpecialChip("Alle"));
});

test("Multi-Kategorie: ODER innerhalb der Facette", () => {
  const a = filterRecipes(R, { chip: "Pasta & Nudeln" }).length;
  const b = filterRecipes(R, { chip: "Backen: Süßes & Kuchen" }).length;
  const both = filterRecipes(R, { chips: ["Pasta & Nudeln", "Backen: Süßes & Kuchen"] });
  assertEqual(both.length, a + b); // disjunkte Kategorien → Summe
  assert(both.every((r) => r.category === "Pasta & Nudeln" || r.category === "Backen: Süßes & Kuchen"));
});

test("Facetten kombiniert: (Kategorie) UND (Spezial) — Schnittmenge", () => {
  const cat = filterRecipes(R, { chips: ["Pasta & Nudeln"] });
  const andQuick = filterRecipes(R, { chips: ["Pasta & Nudeln", "__quick"] }); // mode default "and"
  assert(andQuick.length <= cat.length, "UND verengt die Menge");
  assert(andQuick.every((r) => r.category === "Pasta & Nudeln"));
});

test("mode 'or': Vereinigung über Facetten hinweg", () => {
  const pasta = filterRecipes(R, { chips: ["Pasta & Nudeln"] }).length;
  const quick = filterRecipes(R, { chips: ["__quick"] }).length;
  const orSet = filterRecipes(R, { chips: ["Pasta & Nudeln", "__quick"], mode: "or" });
  // |A ∪ B| = |A| + |B| − |A ∩ B|
  const inter = filterRecipes(R, { chips: ["Pasta & Nudeln", "__quick"], mode: "and" }).length;
  assertEqual(orSet.length, pasta + quick - inter);
});

test("Multi-Küche: (Italienisch ODER Asiatisch) als ODER innerhalb der Küche-Facette", () => {
  const it = filterRecipes(R, { cuisine: "Italienisch" }).length;
  const as = filterRecipes(R, { cuisine: "Asiatisch" }).length;
  const both = filterRecipes(R, { cuisines: ["Italienisch", "Asiatisch"] });
  assertEqual(both.length, it + as);
  assert(both.every((r) => r.cuisine === "Italienisch" || r.cuisine === "Asiatisch"));
});

test("query bleibt immer UND — auch im ODER-Modus", () => {
  const hits = filterRecipes(R, { chips: ["Pasta & Nudeln", "__quick"], mode: "or", query: "pasta" });
  assert(hits.length > 0);
  // Seit v2.17 durchsucht die Suche auch Tipps und Küche.
  assert(hits.every((r) => [r.name, ...(r.ingredients || []), r.tips, r.cuisine].join(" ").toLowerCase().includes("pasta")));
});

test("activeFilterCount zählt belegte Facetten-Werte", () => {
  assertEqual(activeFilterCount({}), 0);
  assertEqual(activeFilterCount({ chip: "Alle" }), 0);
  assertEqual(activeFilterCount({ chips: ["Pasta & Nudeln", "__quick"], cuisines: ["Italienisch"] }), 3);
});

/* ---------- Export ---------- */

test("exportMarkdown: Struktur wie v1 (Kategorien-Reihenfolge, Felder)", () => {
  const md = exportMarkdown(R);
  assert(md.startsWith("# 📖 Recipe collection"));
  assert(md.includes("## Breakfast & Brunch"));
  assert(md.includes("### Süßkartoffel-Curry mit Kichererbsen (★★★)"), "Rating als Sterne im Titel");
  assert(md.includes("**Time:** 35 Min | **Servings:** ~4 | **Last cooked:** Mai 2026"));
  assert(md.includes("#### Ingredients"));
  assert(md.includes("#### Instructions"));
  assert(md.includes("#### Tips"));
  assert(!/Zutaten\n|Zubereitung\n|\*\*Zeit|\*\*Portionen/.test(md), "keine deutschen Labels");
  // Kategorie-Reihenfolge: Frühstück vor Grundrezepte
  assert(md.indexOf("## Breakfast & Brunch") < md.indexOf("## Basic recipes & sauces"));
});

test("exportMarkdown: leere Kategorien tauchen nicht auf", () => {
  const md = exportMarkdown([{ id: "a", name: "Nur Pasta", category: "Pasta & Nudeln" }]);
  assert(md.includes("## Pasta & noodles"));
  assert(!md.includes("## Breakfast & Brunch"));
});

test("G2.4: jede kanonische Kategorie hat ein englisches Label", () => {
  for (const c of CATEGORIES) assert(CATEGORY_LABELS_EN[c] && typeof CATEGORY_LABELS_EN[c] === "string", "Label fehlt: " + c);
  assertEqual(Object.keys(CATEGORY_LABELS_EN).length, CATEGORIES.length);
});

const one = { id: "x", name: "Linsen-Dal", category: "Reis & Getreide", rating: 2, time: "30 Min", servings: "4",
  ingredients: ["200 g Linsen", "1 Zwiebel"], steps: ["Kochen", "Würzen"], tips: "Mit Joghurt servieren" };

test("G2.4: recipeToMarkdown — Titel mit Sternen, Zeit/Portionen, Zutaten, nummerierte Schritte, Tipps", () => {
  const md = recipeToMarkdown(one);
  assert(md.startsWith("# Linsen-Dal (★★)\n"));
  assert(md.includes("Rice & grains"), "englische Kategorie");
  assert(md.includes("**Time:** 30 Min | **Servings:** 4"));
  assert(md.includes("## Ingredients\n- 200 g Linsen\n- 1 Zwiebel"));
  assert(md.includes("## Instructions\n1. Kochen\n2. Würzen"));
  assert(md.includes("## Tips\nMit Joghurt servieren"));
});

test("G2.4: recipeToMarkdown — ohne Tipps/Bewertung keine leeren Abschnitte", () => {
  const md = recipeToMarkdown({ ...one, tips: "", rating: 0 });
  assert(!md.includes("Tips"));
  assert(md.startsWith("# Linsen-Dal\n"));
});

test("G2.4: recipeToMarkdown — Labels bleiben Englisch, egal welche UI-Sprache", () => {
  for (const l of ["en", "de", "es", "da"]) {
    setLang(l);
    const md = recipeToMarkdown(one);
    assert(md.includes("## Ingredients") && md.includes("Rice & grains"), "Sprache " + l);
  }
  setLang("de");
});

test("G2.4: shareRecipeText — navigator.share({text}) wenn vorhanden", async () => {
  let got = null;
  const nav = { share: async (d) => { got = d; } };
  assertEqual(await shareRecipeText("# A", "A", nav), "shared");
  assertEqual(got.text, "# A");
});

test("G2.4: shareRecipeText — Abbruch im Share-Sheet ist still, kein Kopieren", async () => {
  let copied = false;
  const nav = { share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }, clipboard: { writeText: async () => { copied = true; } } };
  assertEqual(await shareRecipeText("# A", "A", nav), "cancelled");
  assert(!copied);
});

test("G2.4: shareRecipeText — ohne share in die Zwischenablage", async () => {
  let clip = "";
  assertEqual(await shareRecipeText("# A", "A", { clipboard: { writeText: async (x) => { clip = x; } } }), "copied");
  assertEqual(clip, "# A");
});

/* ---------- v2.17 (F4): Suche, Zeit-Chips, Sortierung ---------- */

const mk = (id, extra = {}) => ({ id, name: "Rezept " + id, category: "Vegetarische Hauptgerichte", ingredients: [], steps: [], tips: "", ...extra });

test("Suche (F4): mehrere Wörter müssen alle vorkommen, egal in welchem Feld und welcher Reihenfolge", () => {
  const list = [
    mk("a", { name: "Linsensuppe", ingredients: ["200 g Spinat"] }),
    mk("b", { name: "Spinat-Lasagne" }),
    mk("c", { name: "Dal", tips: "Swap: Linsen statt Erbsen, dazu Spinat." }),
  ];
  const ids = (q) => filterRecipes(list, { query: q }).map((r) => r.id);
  assertEqual(ids("linsen spinat").join(), "a,c", "Name + Zutat bzw. Tipps");
  assertEqual(ids("spinat linsen").join(), "a,c", "Reihenfolge egal");
  assertEqual(ids("  spinat   ").join(), "a,b,c", "Leerzeichen egal");
  assertEqual(ids("lasagne linsen").join(), "", "ein Wort fehlt → kein Treffer");
});

test("Suche (F4): Umlaute, Akzente und ß stören nicht", () => {
  assertEqual(searchNorm("Süßkartoffel"), "susskartoffel");
  assertEqual(searchNorm("Crème brûlée"), "creme brulee");
  const list = [mk("a", { name: "Süßkartoffel-Curry" }), mk("b", { name: "Crème brûlée" })];
  assertEqual(filterRecipes(list, { query: "susskartoffel" }).map((r) => r.id).join(), "a");
  assertEqual(filterRecipes(list, { query: "süßkart" }).map((r) => r.id).join(), "a");
  assertEqual(filterRecipes(list, { query: "creme" }).map((r) => r.id).join(), "b");
});

test("Zeit-Chips (F4): ≤ 15 / ≤ 30 / ≤ 60 filtern nach Gesamtzeit; ein Chip ohne Mehrwert fehlt", () => {
  const list = [mk("a", { time: "10 Min" }), mk("b", { time: "25 Min" }), mk("c", { time: "50 Min" }), mk("d", { time: "2 Std" })];
  const ids = (chip) => filterRecipes(list, { chips: [chip] }).map((r) => r.id).join();
  assertEqual(ids("__t15"), "a");
  assertEqual(ids("__quick"), "a,b");
  assertEqual(ids("__t60"), "a,b,c");
  assert(isSpecialChip("__t15") && isSpecialChip("__t60"));
  // Alle Rezepte ≤ 15 → ≤ 30 und ≤ 60 zeigen dasselbe und erscheinen nicht.
  const fast = availableChips([mk("a", { time: "10 Min" }), mk("b", { time: "12 Min" })]);
  assert(fast.includes("__t15") && !fast.includes("__quick") && !fast.includes("__t60"));
});

test("cookedMonthKey: „Mai 2026“ und Varianten → JJJJMM, leer/unbekannt → 0", () => {
  assertEqual(cookedMonthKey("Mai 2026"), 202605);
  assertEqual(cookedMonthKey("Oktober 2026"), 202610);
  assertEqual(cookedMonthKey("März 2025"), 202503);
  assertEqual(cookedMonthKey("06/2026"), 202606);
  assertEqual(cookedMonthKey("2026-06-14"), 202606);
  assertEqual(cookedMonthKey("2026"), 202600);
  assertEqual(cookedMonthKey(""), 0);
  assertEqual(cookedMonthKey(undefined), 0);
  assertEqual(cookedMonthKey("irgendwann"), 0);
});

test("cookedMonthKey (QA-02): EN/ES/DA-Monatsnamen → JJJJMM", () => {
  assertEqual(cookedMonthKey("May 2026"), 202605);
  assertEqual(cookedMonthKey("March 2026"), 202603);
  assertEqual(cookedMonthKey("mayo 2026"), 202605);
  assertEqual(cookedMonthKey("agosto 2025"), 202508);
  assertEqual(cookedMonthKey("diciembre 2025"), 202512);
  assertEqual(cookedMonthKey("maj 2026"), 202605);
  assertEqual(cookedMonthKey("marts 2026"), 202603);
  assertEqual(cookedMonthKey("december 2024"), 202412);
});

test("cookedMonthKey (QA-02): deutsche 3-Buchstaben-/Punkt-Kürzel", () => {
  assertEqual(cookedMonthKey("Mär 2026"), 202603);
  assertEqual(cookedMonthKey("Okt. 2026"), 202610);
  assertEqual(cookedMonthKey("Dez. 2025"), 202512);
  assertEqual(cookedMonthKey("Jan 2026"), 202601);
});

test("cookedMonthKey (QA-02): deutsche Vollnamen unverändert, Fremdwort → Monat 0", () => {
  for (let i = 0; i < 12; i++) assertEqual(cookedMonthKey(`${DE_MONTHS[i]} 2026`), 202600 + i + 1);
  assertEqual(cookedMonthKey("irgendwann 2026"), 202600);
});

test("sortRecipes (F4): alle Sortierungen, Gleichstand → neueste zuerst, Eingabe unverändert", () => {
  const list = [
    mk("r01", { name: "Curry", lastCooked: "Mai 2026", cookedCount: 3 }),
    mk("r1749000000000", { name: "Bohnen", favorite: true }),
    mk("r1750000000000", { name: "Apfelkuchen", lastCooked: "Oktober 2026", cookedCount: 1 }),
    mk("r1751000000000", { name: "Dal", lastCooked: "Mai 2026", cookedCount: 5 }),
  ];
  const names = (sort) => sortRecipes(list, sort).map((r) => r.name).join(",");
  assertEqual(SORTS[0], "newest", "Standard beim ersten Öffnen");
  assertEqual(names("newest"), "Dal,Apfelkuchen,Bohnen,Curry", "nach Anlegezeit der id, r01 zuletzt");
  assertEqual(names("lastCooked"), "Apfelkuchen,Dal,Curry,Bohnen", "Monat, dann wie oft; nie gekocht ans Ende");
  assertEqual(names("mostCooked"), "Dal,Curry,Apfelkuchen,Bohnen");
  assertEqual(names("fav"), "Bohnen,Dal,Apfelkuchen,Curry", "♥ zuerst, sonst neueste");
  assertEqual(names("az"), "Apfelkuchen,Bohnen,Curry,Dal");
  assertEqual(names("quatsch"), names("newest"), "unbekannt → Standard");
  assertEqual(list[0].name, "Curry", "Eingabe nicht umsortiert");
});

test("sortRecipes (F4): echte Daten — neueste zuerst ist die Umkehr der Basis-Reihenfolge", () => {
  const sorted = sortRecipes(R, "newest");
  assertEqual(sorted.length, R.length);
  assertEqual(sorted[0].id, R[R.length - 1].id);
  assertEqual(sorted[sorted.length - 1].id, "r01");
});
