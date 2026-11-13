// Tests: Zutaten-Matcher (R3.1, ADR-R1 §4 + §5) — Rezeptzeile → strukturierte Items.
// Jede Zeile der ADR-Tabelle „Checked against real recipes“ ist hier ein Fall, mit Ergebnis.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { readFileSync } from "node:fs";
import { buildIndex, matchLine, gramsOf } from "../src/data/ingredientMatch.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

// Kleiner Test-Stamm (NICHT die ausgelieferte Datei): nur was die Fälle brauchen.
const ing = (id, de, extra = {}) => ({ id, names: { de, en: id, es: id, da: id }, base: "g", shop: "g", ...extra });
const MASTER = {
  version: 1,
  ingredients: [
    ing("sweet-potato", "Süßkartoffel", { plural: { de: "Süßkartoffeln" }, units: { piece: 130 } }),
    ing("chickpeas-canned", "Kichererbsen", { units: { can: 240 } }),
    ing("coconut-milk", "Kokosmilch", { base: "ml" }),
    ing("curry-powder", "Curry", { aliases: { de: ["Currypulver"] }, units: { tsp: 2 } }),
    ing("cumin", "Kreuzkümmel", { units: { tsp: 2.5 } }),
    ing("chili-flakes", "Chiliflocken", { units: { tsp: 1.8 } }),
    ing("salt", "Salz"),
    ing("pepper", "Pfeffer"),
    ing("oil", "Öl", { units: { tbsp: 14 }, density: 0.92 }),
    ing("rice", "Reis"),
    ing("yeast-dry", "Trockenhefe", { units: { packet: 7 } }),
    ing("apple", "Apfel", { plural: { de: "Äpfel" }, units: { piece: 150 } }),
    ing("vanilla-sugar", "Vanillezucker", { units: { packet: 8 } }),
    ing("egg", "Ei", { plural: { de: "Eier" }, units: { piece: 55 } }),
    ing("tuna-canned", "Thunfisch", { units: { can: 150 } }),
    ing("butter", "Butter"),
    ing("flour", "Mehl", { density: 0.55 }),
    ing("milk", "Milch", { base: "ml" }),
    ing("nutmeg", "Muskatnuss", { aliases: { de: ["Muskat"] } }),
    ing("vegetable-stock", "Gemüsebrühe", { base: "ml" }),
    ing("buttermilk", "Buttermilch", { base: "ml" }),
    ing("feta", "Feta"),
    ing("parsley", "Petersilie"),
    ing("peas-carrots-canned", "Erbsen & Karotten"),
    ing("onion", "Zwiebel", { plural: { de: "Zwiebeln" }, aliases: { de: ["rote Zwiebel"] }, units: { piece: 80 } }),
    ing("garlic", "Knoblauch", { units: { clove: 3 } }),
    ing("kidney-beans-canned", "rote Bohnen"),
    ing("sugar", "Zucker"),
  ],
};
const index = buildIndex(MASTER);
const grams = (items) => items.map((it) => gramsOf(it, MASTER));
const plain = { buy: false, optional: false };

/* ---------- buildIndex ---------- */

test("buildIndex: Name, Plural und Alias treffen; Groß-/Kleinschreibung, Akzente und ß egal", () => {
  for (const line of ["Süßkartoffel", "SUESSKARTOFFELN".replace("UE", "Ü"), "süsskartoffeln", "Sußkartoffeln"]) {
    assertEqual(matchLine(line, index)[0].ing, "sweet-potato", line);
  }
  assertEqual(matchLine("Muskat", index)[0].ing, "nutmeg");
  assertEqual(matchLine("gemuesebruhe".replace("ue", "ü"), index)[0].ing, "vegetable-stock");
  assertEqual(matchLine("Bechamel: 50g BUTTER", index)[0].ing, "butter");
});

test("buildIndex: nimmt die Datei ({ingredients}) oder die nackte Liste; Müll wirft nicht", () => {
  assertEqual(matchLine("Reis", buildIndex(MASTER.ingredients))[0].ing, "rice");
  for (const bad of [null, undefined, {}, { ingredients: [null, 3, { id: "x" }] }]) {
    assertDeepEqual(matchLine("Reis", buildIndex(bad)), [{ text: "Reis", ...plain }]);
  }
});

/* ---------- ADR-Tabelle „Checked against real recipes“ ---------- */

test("ADR: Stückzahl — 2 Süßkartoffeln, gewürfelt (~2 cm)", () => {
  const text = "2 Süßkartoffeln, gewürfelt (~2 cm)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "sweet-potato", amount: 2, unit: "piece", prep: "gewürfelt (~2 cm)", ...plain }]);
  assertDeepEqual(grams(items), [260]); // Regel 3: 2 × units.piece
});

test("ADR: Gewicht steht da — 400g Kichererbsen (Dose, abgetropft)", () => {
  const text = "400g Kichererbsen (Dose, abgetropft)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "chickpeas-canned", amount: 400, unit: "g", g: 400, prep: "(Dose, abgetropft)", ...plain }]);
  assertDeepEqual(grams(items), [400]); // Regel 1
});

test("ADR: base ml — 400ml Kokosmilch (Dose)", () => {
  const text = "400ml Kokosmilch (Dose)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "coconut-milk", amount: 400, unit: "ml", prep: "(Dose)", ...plain }]);
  assertDeepEqual(grams(items), [400]); // Regel 4
});

test("ADR: drei Items aus einer Zeile — 2 TL Curry, 1 TL Kreuzkümmel, ½ TL Chiliflocken", () => {
  const text = "2 TL Curry, 1 TL Kreuzkümmel, ½ TL Chiliflocken";
  const items = matchLine(text, index);
  assertDeepEqual(items, [
    { text, ing: "curry-powder", amount: 2, unit: "tsp", ...plain },
    { text, ing: "cumin", amount: 1, unit: "tsp", ...plain },
    { text, ing: "chili-flakes", amount: 0.5, unit: "tsp", ...plain },
  ]);
  assertDeepEqual(grams(items), [4, 2.5, 0.9]); // je units.tsp
});

test("ADR: Liste ohne Mengen — Salz, Pfeffer, Öl → drei Items, kein Gewicht", () => {
  const text = "Salz, Pfeffer, Öl";
  const items = matchLine(text, index);
  assertDeepEqual(items, [
    { text, ing: "salt", ...plain }, { text, ing: "pepper", ...plain }, { text, ing: "oil", ...plain },
  ]);
  assertDeepEqual(grams(items), [null, null, null]);
});

test("ADR: ohne Menge — Reis als Beilage", () => {
  const text = "Reis als Beilage";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "rice", prep: "als Beilage", ...plain }]);
  assertDeepEqual(grams(items), [null]);
});

test("ADR: doppelte Einheit — Teig: 1 Päckchen Trockenhefe (7g) → g 7, Einheit packet", () => {
  const text = "Teig: 1 Päckchen Trockenhefe (7g)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "yeast-dry", amount: 1, unit: "packet", g: 7, group: "Teig", ...plain }]);
  assertDeepEqual(grams(items), [7]); // Regel 2
  const noGroup = matchLine("1 Päckchen Trockenhefe (7g)", index)[0];
  assertEqual(noGroup.g, 7);
  assertEqual(noGroup.unit, "packet");
  // Klammergewicht schlägt die Tabelle der Zutat (Regel 2 vor Regel 3)
  assertEqual(gramsOf(matchLine("1 Dose Thunfisch (185 g)", index)[0], MASTER), 185);
});

test("ADR: Klammer ist kein Gewicht — Belag: 1,5kg Äpfel (5–6 mittelgroß), geschält, in Scheiben", () => {
  const text = "Belag: 1,5kg Äpfel (5–6 mittelgroß), geschält, in Scheiben";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{
    text, ing: "apple", amount: 1.5, unit: "kg", g: 1500, group: "Belag",
    prep: "(5–6 mittelgroß), geschält, in Scheiben", ...plain,
  }]);
  assertDeepEqual(grams(items), [1500]);
});

test("ADR: Alternative in Klammern bleibt Text — Teig: 1 Päckchen Vanillezucker 🛒 (oder 1 TL Zimt)", () => {
  const text = "Teig: 1 Päckchen Vanillezucker 🛒 (oder 1 TL Zimt)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{
    text, ing: "vanilla-sugar", amount: 1, unit: "packet", group: "Teig", prep: "(oder 1 TL Zimt)", buy: true, optional: false,
  }]);
  assertDeepEqual(grams(items), [8]); // units.packet
});

test("ADR: Bereich — 4–5 Eier → amount 4, amountMax 5, gerechnet mit der Untergrenze", () => {
  const text = "4–5 Eier";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "egg", amount: 4, amountMax: 5, unit: "piece", ...plain }]);
  assertDeepEqual(grams(items), [220]);
});

test("ADR: Dose ohne Klammer — 1 Dose Thunfisch, abgetropft → units.can", () => {
  const text = "1 Dose Thunfisch, abgetropft";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "tuna-canned", amount: 1, unit: "can", prep: "abgetropft", ...plain }]);
  assertDeepEqual(grams(items), [150]);
});

test("ADR: Gruppen-Prefix — Béchamel: 50g Butter, 50g Mehl, 600ml Milch, Muskat → vier Items", () => {
  const text = "Béchamel: 50g Butter, 50g Mehl, 600ml Milch, Muskat";
  const items = matchLine(text, index);
  const g = { group: "Béchamel", ...plain };
  assertDeepEqual(items, [
    { text, ing: "butter", amount: 50, unit: "g", g: 50, ...g },
    { text, ing: "flour", amount: 50, unit: "g", g: 50, ...g },
    { text, ing: "milk", amount: 600, unit: "ml", ...g },
    { text, ing: "nutmeg", ...g },
  ]);
  assertDeepEqual(grams(items), [50, 50, 600, null]);
});

test("ADR: Liter — 1,2 Liter Gemüsebrühe 🛒 → vegetable-stock, 1200 ml", () => {
  const text = "1,2 Liter Gemüsebrühe 🛒";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "vegetable-stock", amount: 1.2, unit: "l", buy: true, optional: false }]);
  assertDeepEqual(grams(items), [1200]);
});

test("ADR: Alternative — Buttermilch oder Joghurt 🛒 zum Servieren → erste Option", () => {
  const text = "Buttermilch oder Joghurt 🛒 zum Servieren";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "buttermilk", prep: "oder Joghurt zum Servieren", buy: true, optional: false }]);
  assertDeepEqual(grams(items), [null]);
  // geteiltes Hauptwort: „rote oder weiße Bohnen“ → rote Bohnen
  const beans = matchLine("400g rote oder weiße Bohnen (Dose, abgetropft)", index);
  assertEqual(beans.length, 1);
  assertEqual(beans[0].ing, "kidney-beans-canned");
  assertEqual(beans[0].g, 400);
});

test("ADR: A und B — Feta 🛒 und Petersilie 🛒 (optional) → zwei Items, optional", () => {
  const text = "Feta 🛒 und Petersilie 🛒 (optional)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [
    { text, ing: "feta", buy: true, optional: true },
    { text, ing: "parsley", buy: true, optional: true },
  ]);
});

test("ADR: ein Produkt mit & — 200g Erbsen & Karotten (Dose) → EIN Item", () => {
  const text = "200g Erbsen & Karotten (Dose)";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "peas-carrots-canned", amount: 200, unit: "g", g: 200, prep: "(Dose)", ...plain }]);
});

/* ---------- Komma: Liste oder Zubereitung ---------- */

test("Komma: geteilt wird nur, wenn JEDES Stück eine Zutat ist", () => {
  assertDeepEqual(matchLine("Salz, Pfeffer, Zucker", index).map((x) => x.ing), ["salt", "pepper", "sugar"]);
  assertDeepEqual(matchLine("Butter, Mehl 🛒", index).map((x) => [x.ing, x.buy]), [["butter", true], ["flour", true]]);
});

test("Komma: sonst beginnt dort die Zubereitung — 1 Zwiebel, gewürfelt", () => {
  const text = "1 Zwiebel, gewürfelt";
  assertDeepEqual(matchLine(text, index), [{ text, ing: "onion", amount: 1, unit: "piece", prep: "gewürfelt", ...plain }]);
  // ein Stück passt nicht → nichts wird geteilt, der Rest ist Zubereitung
  const mixed = "Salz, Pfeffer, frisch gemahlen";
  assertDeepEqual(matchLine(mixed, index), [{ text: mixed, ing: "salt", prep: "Pfeffer, frisch gemahlen", ...plain }]);
  // Zutat mitten in der Zubereitung macht kein zweites Item
  const fried = "1 Zwiebel, in Butter gebraten";
  assertDeepEqual(matchLine(fried, index).map((x) => x.ing), ["onion"]);
});

test("Komma in Klammern trennt nicht", () => {
  assertEqual(matchLine("Salz (grob, Meersalz), Pfeffer", index).length, 2);
  assertEqual(matchLine("400g Kichererbsen (Dose, abgetropft)", index).length, 1);
});

/* ---------- Einheiten & Namen ---------- */

test("zusammengesetzte Zehe: 3 Knoblauchzehen, gehackt → garlic, clove", () => {
  const text = "3 Knoblauchzehen, gehackt";
  const items = matchLine(text, index);
  assertDeepEqual(items, [{ text, ing: "garlic", amount: 3, unit: "clove", prep: "gehackt", ...plain }]);
  assertDeepEqual(grams(items), [9]);
  assertEqual(matchLine("2 Zehen Knoblauch", index)[0].unit, "clove");
});

test("Wörter um den Namen bleiben in prep; der längste Name gewinnt", () => {
  const big = matchLine("1 große Zwiebel", index)[0];
  assertEqual(big.ing, "onion");
  assertEqual(big.prep, "große");
  const red = matchLine("1 rote Zwiebel, in Ringen", index)[0];
  assertEqual(red.ing, "onion");
  assertEqual(red.prep, "in Ringen");
  assertEqual(matchLine("2 EL Buttermilch", index)[0].ing, "buttermilk"); // nicht „Butter“ / „Milch“
});

test("A und B mit eigenen Mengen; & zwischen zwei Zutaten", () => {
  const two = matchLine("1 Zwiebel und 2 Knoblauchzehen", index);
  assertDeepEqual(two.map((x) => [x.ing, x.amount, x.unit]), [["onion", 1, "piece"], ["garlic", 2, "clove"]]);
  assertDeepEqual(matchLine("Butter & Mehl für die Form", index).map((x) => [x.ing, x.prep]), [["butter", undefined], ["flour", "für die Form"]]);
  // Schrägstrich ist eine Alternative: erste Option
  assertEqual(matchLine("1 kleine Zwiebel/Schalotte, fein 🛒 (optional)", index)[0].ing, "onion");
  assertDeepEqual(matchLine("200ml Milch, Öl/Butter", index).map((x) => x.ing), ["milk", "oil"]);
  // „und“ ohne zweite Zutat trennt nicht
  assertEqual(matchLine("1 Zwiebel, geschält und gewürfelt", index).length, 1);
});

/* ---------- gramsOf: Reihenfolge ADR §4 ---------- */

test("gramsOf: Reihenfolge Gewicht → Klammer → units → Volumen (density | base ml) → null", () => {
  const one = (line) => gramsOf(matchLine(line, index)[0], MASTER);
  assertEqual(one("2 kg Mehl"), 2000);                 // 1 Gewicht
  assertEqual(one("1 Päckchen Trockenhefe (7g)"), 7);  // 2 Klammer
  assertEqual(one("2 EL Öl"), 28);                     // 3 units.tbsp vor density
  assertEqual(one("100 ml Öl"), 92);                   // 4 Volumen × density
  assertEqual(one("2 EL Mehl"), 16.5);                 // 4 30 ml × 0,55
  assertEqual(one("250ml Milch"), 250);                // 4 base ml
  assertEqual(one("2 EL Milch"), 30);                  // 4 base ml, Löffel in ml
  assertEqual(one("1 EL Zucker"), null);               // 5 Volumen ohne density
  assertEqual(one("1 Bund Petersilie"), null);         // 5 Zähl-Einheit ohne Eintrag
  assertEqual(one("Salz"), null);                      // keine Menge
  assertEqual(one("1 Prise Salz"), 0.5);               // Prise fest 0,5 g (Einheiten-Tabelle)
});

test("gramsOf: g am Item gewinnt immer; Müll gibt null und wirft nicht", () => {
  assertEqual(gramsOf({ text: "x", ing: "onion", amount: 2, unit: "piece", g: 500 }, MASTER), 500);
  assertEqual(gramsOf({ text: "frei", g: 40 }, MASTER), 40);
  assertEqual(gramsOf({ text: "x", ing: "gibt-es-nicht", amount: 2, unit: "piece" }, MASTER), null);
  assertEqual(gramsOf({ text: "x", ing: "onion", amount: 2, unit: "quatsch" }, MASTER), null);
  for (const bad of [null, undefined, {}, "x"]) assertEqual(gramsOf(bad, MASTER), null);
  assertEqual(gramsOf({ text: "x", ing: "onion", amount: 1, unit: "piece" }, null), null);
  assertEqual(gramsOf({ text: "x", ing: "onion", amount: 1, unit: "piece" }, MASTER.ingredients), 80);
});

/* ---------- Unbekanntes & Robustheit ---------- */

test("ohne Treffer: EIN Item nur mit text (+ buy/optional)", () => {
  assertDeepEqual(matchLine("2 EL Zaubersoße 🛒 (optional)", index), [{ text: "2 EL Zaubersoße 🛒 (optional)", buy: true, optional: true }]);
  assertDeepEqual(matchLine("Einhorn, Drache", index), [{ text: "Einhorn, Drache", ...plain }]);
  // eine Liste mit einem unbekannten Stück bleibt EIN Item
  assertEqual(matchLine("Einhorn, Salz", index).length, 1);
});

test("text ist immer der unveränderte Eingabe-String", () => {
  for (const line of ["  2 TL Curry ,  1 TL Kreuzkümmel 🛒 ", "Teig: 300g Mehl", "Salz, Pfeffer, Öl", "???"]) {
    for (const it of matchLine(line, index)) assertEqual(it.text, line);
  }
});

test("leer, nur Emoji, sehr lang, kein String: nichts wirft", () => {
  assertDeepEqual(matchLine("", index), [{ text: "", ...plain }]);
  assertDeepEqual(matchLine("   ", index), [{ text: "   ", ...plain }]);
  assertDeepEqual(matchLine("🛒", index), [{ text: "🛒", buy: true, optional: false }]);
  assertDeepEqual(matchLine("🍅🧅🧄", index), [{ text: "🍅🧅🧄", ...plain }]);
  const long = "Salz, ".repeat(20000) + "((((" + "x ".repeat(20000) + " und ".repeat(500) + ",".repeat(5000);
  const t0 = Date.now();
  const out = matchLine(long, index);
  assert(out.length >= 1 && out.every((x) => x.text === long), "langer Text kommt unverändert zurück");
  assert(Date.now() - t0 < 2000, `zu langsam: ${Date.now() - t0} ms`);
  for (const bad of [null, undefined, 42, {}]) assertEqual(matchLine(bad, index).length, 1);
  assertEqual(matchLine("Reis", null).length, 1);
});

/* ---------- Abdeckung: Basis-Kochbuch × ausgelieferter Stamm ---------- */

// Gemessen am 2026-11-13 (105 Rezepte, 70 Zutaten): 839 Zeilen → 1010 Teile, 965 mit Zutat. Der Boden liegt 3 Punkte unter dem Messwert:
// neue Stamm-Daten dürfen den Anteil nur heben.
const MEASURED_PCT = 95.5;
const FLOOR_PCT = MEASURED_PCT - 3;

test("Abdeckung: Anteil der Teile mit Zutat liegt über dem Boden", () => {
  const master = read("../data/ingredients.json");
  const snapshot = read("../data/rezepte.snapshot.json");
  const idx = buildIndex(master);
  let lines = 0, parts = 0, matched = 0, weighed = 0;
  for (const r of snapshot.recipes) {
    for (const line of r.ingredients || []) {
      lines++;
      for (const it of matchLine(line, idx)) {
        parts++;
        assertEqual(it.text, line);
        if (it.ing) matched++;
        if (gramsOf(it, master) !== null) weighed++;
      }
    }
  }
  const pct = (matched / parts) * 100;
  console.log(`    Abdeckung: ${lines} Zeilen → ${parts} Teile, ${matched} mit Zutat (${pct.toFixed(1)} %), ${weighed} mit Gewicht (${((weighed / parts) * 100).toFixed(1)} %)`);
  assert(pct >= FLOOR_PCT, `Abdeckung ${pct.toFixed(1)} % liegt unter dem Boden ${FLOOR_PCT} %`);
});
