// Tests: derive.js — Zeit-Parsing, Tipps-Struktur, Zutaten-Parsing, Skalierung.
// Testfälle stammen aus den ECHTEN Bestandsdaten (rezepte.json).
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  parseMinutes, getTotalMinutes, getTags, parseTipps, hasStructuredTipps,
  parseIngredient, scaleIngredient, parseServings,
} from "../src/data/derive.js";

/* ---------- parseMinutes (v1-Parität) ---------- */

test("parseMinutes: v1-Fälle", () => {
  assertEqual(parseMinutes("12–15 Min köcheln"), 15);
  assertEqual(parseMinutes("5 Min"), 5);
  assertEqual(parseMinutes("Öl erhitzen, Zwiebel 3–4 Min glasig braten"), 4);
  assertEqual(parseMinutes("Über Reis servieren."), null);
  assertEqual(parseMinutes(""), null);
  assertEqual(parseMinutes(null), null);
});

test("parseMinutes: Stunden", () => {
  assertEqual(parseMinutes("2 Std backen"), 120);
  assertEqual(parseMinutes("24 Std (inkl. Gehzeit)"), 1440);
});

test("parseMinutes: zusammengesetzte Zeit-Strings aus echten Daten", () => {
  assertEqual(parseMinutes("55 Min (15 Vorb · 40 Backen)"), 55);
  assertEqual(parseMinutes("125 Min (30 Vorb · 35 Backen · 60 Gehen)"), 125);
});

test("getTotalMinutes: totalTime bevorzugt, sonst time-String, sonst null", () => {
  assertEqual(getTotalMinutes({ totalTime: 100, time: "55 Min" }), 100);
  assertEqual(getTotalMinutes({ time: "35 Min" }), 35);
  assertEqual(getTotalMinutes({ time: "5–7 Tage (je 5 Min/Tag)" }), 5); // "5 Min" greift — bewusst dokumentiert
  assertEqual(getTotalMinutes({}), null);
});

/* ---------- Tags-Sicht ---------- */

test("getTags: flache v3-Felder -> strukturierte Sicht", () => {
  const r = { effort: "alltag", cuisine: "Middle Eastern", mealPrep: true, toTry: false, season: "Herbst", tags: ["bowl"] };
  assertDeepEqual(getTags(r), {
    effort: "alltag", cuisine: "Middle Eastern", mealPrep: true, toTry: false,
    season: ["Herbst"], free: ["bowl"],
  });
});

test("getTags: fehlende Felder -> neutrale Sicht (v1-Rezepte)", () => {
  assertDeepEqual(getTags({}), { effort: null, cuisine: null, mealPrep: false, toTry: false, season: [], free: [] });
});

/* ---------- parseTipps ---------- */

test("parseTipps: echte Konvention Topping/Swap/Alltags-Upgrade/Technik", () => {
  const tips = "Topping: vor dem Servieren mit Puderzucker 🛒 bestäuben oder Sahne/Vanilleeis 🛒 dazu. Swap: Zitronensaft kann weg, geht auch ohne. Alltags-Upgrade: 50g gehackte Mandeln in die Streusel mischen = mehr Biss. Technik: Butter muss wirklich kalt sein (notfalls kurz einfrieren), Äpfel nicht zu dünn, sonst werden sie matschig.";
  const p = parseTipps(tips);
  assert(hasStructuredTipps(p));
  assertEqual(p.toppings.length, 1);
  assert(p.toppings[0].includes("Puderzucker"));
  assertEqual(p.variationen.length, 1);
  assert(p.variationen[0].includes("Zitronensaft"));
  assert(p.alltagsUpgrade.includes("Mandeln"));
  assert(p.technik.includes("kalt"));
  assertEqual(p.raw, tips);
});

test("parseTipps: unstrukturierter Freitext landet in rest (v1-Rezepte)", () => {
  const tips = "Joghurt oder Buttermilch drüber = frischer. Gefrorene Erbsen/Spinat am Ende einrühren.";
  const p = parseTipps(tips);
  assert(!hasStructuredTipps(p));
  assertEqual(p.rest, tips);
});

test("parseTipps: leer/fehlend", () => {
  const p = parseTipps("");
  assert(!hasStructuredTipps(p));
  assertEqual(p.rest, "");
});

/* ---------- parseIngredient ---------- */

test("parseIngredient: einfache Menge + Stück", () => {
  const p = parseIngredient("2 Süßkartoffeln, gewürfelt (~2 cm)");
  assertEqual(p.amount, 2);
  assertEqual(p.unit, null);
  assertEqual(p.item, "Süßkartoffeln, gewürfelt (~2 cm)");
  assertEqual(p.toBuy, false);
});

test("parseIngredient: Gramm direkt an der Zahl", () => {
  const p = parseIngredient("400g Kichererbsen (Dose, abgetropft)");
  assertEqual(p.amount, 400);
  assertEqual(p.unit, "g");
  assertEqual(p.item, "Kichererbsen (Dose, abgetropft)");
});

test("parseIngredient: ml, EL/TL, Komma-Dezimal, kg", () => {
  assertEqual(parseIngredient("400ml Kokosmilch (Dose)").unit, "ml");
  const el = parseIngredient("2 EL Zucker");
  assertEqual(el.amount, 2);
  assertEqual(el.unit, "EL");
  const kg = parseIngredient("1,5kg Äpfel (5–6 mittelgroß), geschält, in Scheiben");
  assertEqual(kg.amount, 1.5);
  assertEqual(kg.unit, "kg");
});

test("parseIngredient: Gruppen-Prefix Teig:/Belag:/Streusel:", () => {
  const p = parseIngredient("Teig: 300g Mehl (Typ 405)");
  assertEqual(p.group, "Teig");
  assertEqual(p.amount, 300);
  assertEqual(p.unit, "g");
  assertEqual(p.item, "Mehl (Typ 405)");
});

test("parseIngredient: 🛒-Marker und optional", () => {
  const p = parseIngredient("1 EL Zitronensaft 🛒 (optional)");
  assertEqual(p.toBuy, true);
  assertEqual(p.optional, true);
  assertEqual(p.amount, 1);
  assertEqual(p.unit, "EL");
});

test("parseIngredient: Bruch ½ und ohne Menge", () => {
  const f = parseIngredient("½ TL Chiliflocken");
  assertEqual(f.amount, 0.5);
  assertEqual(f.unit, "TL");
  const none = parseIngredient("Salz, Pfeffer, Öl");
  assertEqual(none.amount, null);
  assertEqual(none.item, "Salz, Pfeffer, Öl");
});

test("parseIngredient: Prise/Dose/Zehen als Einheit", () => {
  assertEqual(parseIngredient("1 Prise Salz").unit, "Prise");
  assertEqual(parseIngredient("3 Knoblauchzehen, gehackt").amount, 3);
  assertEqual(parseIngredient("1 Päckchen Trockenhefe (7g)").unit, "Päckchen");
});

/* ---------- scaleIngredient ---------- */

test("scaleIngredient: verdoppeln", () => {
  assertEqual(scaleIngredient("400g Kichererbsen (Dose, abgetropft)", 2), "800g Kichererbsen (Dose, abgetropft)");
  assertEqual(scaleIngredient("2 Süßkartoffeln, gewürfelt (~2 cm)", 2), "4 Süßkartoffeln, gewürfelt (~2 cm)");
});

test("scaleIngredient: halbieren mit Bruch-Ausgabe", () => {
  assertEqual(scaleIngredient("1 Zwiebel, gewürfelt", 0.5), "½ Zwiebel, gewürfelt");
  assertEqual(scaleIngredient("3 Knoblauchzehen, gehackt", 0.5), "1 ½ Knoblauchzehen, gehackt");
});

test("scaleIngredient: ohne Menge unverändert", () => {
  assertEqual(scaleIngredient("Salz, Pfeffer, Öl", 2), "Salz, Pfeffer, Öl");
  assertEqual(scaleIngredient("Reis als Beilage", 3), "Reis als Beilage");
});

test("scaleIngredient: Gruppe + 🛒 bleiben erhalten", () => {
  assertEqual(scaleIngredient("Teig: 300g Mehl (Typ 405)", 2), "Teig: 600g Mehl (Typ 405)");
  assertEqual(scaleIngredient("1 EL Zitronensaft 🛒 (optional)", 2), "2 EL Zitronensaft (optional) 🛒");
});

test("scaleIngredient: Dezimalausgabe mit Komma", () => {
  assertEqual(scaleIngredient("1,5kg Äpfel, geschält", 0.5), "0,75kg Äpfel, geschält");
});

/* ---------- parseServings ---------- */

test("parseServings: '~4' -> 4, '12 Stücke' -> 12, Freitext -> null", () => {
  assertEqual(parseServings("~4"), 4);
  assertEqual(parseServings("12 Stücke"), 12);
  assertEqual(parseServings(4), 4);
  assertEqual(parseServings(""), null);
});
