// Tests: ai/gate.js + ai/parse.js + ai/prompts.js — alles pur, ohne Netz/Key.
// Gating: kein Key → kein Premium; Parsing: Modell-JSON → schema-valide Rezepte.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import * as gate from "../src/ai/gate.js";
import { extractJson, coerceRecipe, coerceSuggestions, coercePlanDays, tippsToString } from "../src/ai/parse.js";
import { buildSystemPrompt, buildCollectionContext, suggestUserPrompt, fromStockUserPrompt, planUserPrompt } from "../src/ai/prompts.js";
import { validateRecipe } from "../src/data/schema.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(join(__dirname, "..", "data", "rezepte.snapshot.json"), "utf8")).recipes;

/* ---------- Gating ---------- */

test("gate: ohne Key kein Premium; mit Key Premium; Entfernen sperrt wieder", () => {
  gate.clearKey();
  assert(!gate.isPremium());
  gate.setKey("sk-ant-test-123");
  assert(gate.isPremium());
  assertEqual(gate.getKey(), "sk-ant-test-123");
  gate.clearKey();
  assert(!gate.isPremium());
  assertEqual(gate.getKey(), "");
});

test("gate: Modell-Default haiku, Wechsel nur auf bekannte IDs", () => {
  assertEqual(gate.getModel(), "claude-haiku-4-5");
  gate.setModel("claude-sonnet-4-6");
  assertEqual(gate.getModel(), "claude-sonnet-4-6");
  gate.setModel("gpt-9000"); // unbekannt → ignoriert
  assertEqual(gate.getModel(), "claude-sonnet-4-6");
  gate.setModel("claude-haiku-4-5");
});

test("gate: looksLikeKey", () => {
  assert(gate.looksLikeKey("sk-ant-api03-abc"));
  assert(!gate.looksLikeKey("hello"));
});

test("gate: aiUnavailableReason — nokey vs. offline vs. nutzbar (#3)", () => {
  gate.clearKey();
  assertEqual(gate.aiUnavailableReason(), "nokey");
  gate.setKey("sk-ant-test-123");
  assertEqual(gate.aiUnavailableReason(), ""); // Node-navigator hat kein onLine:false → online
  // navigator ist in Node ein konfigurierbares Global → für den Offline-Fall umdefinieren.
  const prev = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  assertEqual(gate.aiUnavailableReason(), "offline"); // Key vorhanden, aber offline
  if (prev) Object.defineProperty(globalThis, "navigator", prev); else delete globalThis.navigator;
  gate.clearKey();
});

/* ---------- extractJson ---------- */

test("extractJson: pures JSON, mit Zaun, mit Prosa drumherum", () => {
  assertDeepEqual(extractJson('{"a":1}'), { a: 1 });
  assertDeepEqual(extractJson('Hier: ```json\n{"a":[1,2]}\n``` fertig.'), { a: [1, 2] });
  assertDeepEqual(extractJson('Klar!\n{"type":"text","text":"Hi {nested} \\" quote"}'), { type: "text", text: 'Hi {nested} " quote' });
  assertEqual(extractJson("kein json hier"), null);
  assertEqual(extractJson(""), null);
});

/* ---------- coerceRecipe ---------- */

const FULL = {
  name: "Bazaar-Bowl mit Granatapfel", category: "Middle Eastern & Mediterran",
  time: "30 Min", servings: "~4", effort: "alltag", difficulty: "einfach",
  cuisine: "Middle Eastern", prepTime: 15, cookTime: 15, totalTime: 30,
  mealPrep: true, toTry: true, season: "", tags: ["bowl"],
  ingredients: ["200g Bulgur", "1 Granatapfel 🛒", "200g Feta 🛒"],
  steps: ["Bulgur 15 Min quellen lassen.", "Alles anrichten."],
  tips: "Topping: Minze. Swap: Couscous statt Bulgur. Alltags-Upgrade: geröstete Mandeln.",
};

test("coerceRecipe: vollständiges Modell-JSON → schema-valide", () => {
  const { recipe, errors } = coerceRecipe(FULL);
  assertEqual(errors.length, 0, errors.join("; "));
  const v = validateRecipe({ ...recipe, id: "rX" });
  assert(v.valid, v.errors.join("; "));
  assertEqual(recipe.toTry, true);
});

test("coerceRecipe: Zahlen als Strings, Kategorie case-insensitiv", () => {
  const { recipe, errors } = coerceRecipe({
    ...FULL, prepTime: "15", cookTime: "15", totalTime: "30",
    category: "middle eastern & mediterran",
  });
  assertEqual(errors.length, 0, errors.join("; "));
  assertEqual(recipe.prepTime, 15);
  assertEqual(recipe.category, "Middle Eastern & Mediterran");
});

test("coerceRecipe: totalTime aus prep+cook abgeleitet, time daraus", () => {
  const raw = { ...FULL };
  delete raw.totalTime;
  delete raw.time;
  const { recipe } = coerceRecipe(raw);
  assertEqual(recipe.totalTime, 30);
  assertEqual(recipe.time, "30 Min");
});

test("coerceRecipe: ungültige Kategorie → Fehler, kein Rezept", () => {
  const { recipe, errors } = coerceRecipe({ ...FULL, category: "Desserts" });
  assertEqual(recipe, null);
  assert(errors.some((e) => e.includes("category")));
});

test("coerceRecipe: fehlende Zutaten/Schritte → Fehler", () => {
  assert(coerceRecipe({ ...FULL, ingredients: [] }).errors.length > 0);
  assert(coerceRecipe({ ...FULL, steps: [] }).errors.length > 0);
});

test("coerceRecipe: nested tipps{} wird zum Konventions-String", () => {
  const raw = { ...FULL, tips: undefined, tipps: { toppings: ["Minze", "Feta"], variationen: ["Couscous statt Bulgur"], alltagsUpgrade: "Mandeln rösten" } };
  const { recipe, errors } = coerceRecipe(raw);
  assertEqual(errors.length, 0, errors.join("; "));
  assert(recipe.tips.startsWith("Topping: Minze oder Feta."));
  assert(recipe.tips.includes("Swap: Couscous statt Bulgur."));
  assert(recipe.tips.includes("Alltags-Upgrade: Mandeln rösten."));
});

test("tippsToString: leere Eingaben", () => {
  assertEqual(tippsToString(null), "");
  assertEqual(tippsToString({}), "");
});

/* ---------- coerceSuggestions / coercePlanDays ---------- */

test("coerceSuggestions: unbekannte ids → null-id (neue Idee)", () => {
  const known = new Set(["r01"]);
  const s = coerceSuggestions({
    intro: "Hier!",
    items: [
      { id: "r01", name: "Curry", reason: "schnell" },
      { id: "r-fake", name: "Phantasie-Bowl", reason: "neu" },
      { name: "", reason: "ohne Namen → raus" },
    ],
  }, known);
  assertEqual(s.items.length, 2);
  assertEqual(s.items[0].id, "r01");
  assertEqual(s.items[1].id, null);
});

test("coercePlanDays: nur bekannte IDs und echte Tage", () => {
  const known = new Set(["r01", "r1748713200000"]);
  const p = coercePlanDays({ days: { Mo: "r01", Di: "r-fake", Xx: "r01", Sa: "r1748713200000" }, note: "ok" }, known);
  assertDeepEqual(Object.keys(p.days), ["Mo", "Sa"]);
  assertEqual(coercePlanDays({ days: { Mo: "r-fake" } }, known), null);
});

/* ---------- Prompts ---------- */

test("buildCollectionContext: eine Zeile pro Rezept, ids enthalten", () => {
  const ctx = buildCollectionContext(R);
  assertEqual(ctx.split("\n").length, 105);
  assert(ctx.includes("r01|Süßkartoffel-Curry mit Kichererbsen|Vegetarische Hauptgerichte"));
});

test("buildSystemPrompt: Deutsch, Vorrat, 16 Kategorien, JSON-Regeln", () => {
  const sys = buildSystemPrompt({ recipes: R.slice(0, 3), staples: ["Mehl", "Reis"] });
  assert(sys.includes("IMMER auf Deutsch"));
  assert(sys.includes("Mehl, Reis"));
  assert(sys.includes("Grundrezepte & Basissoßen"));
  assert(sys.includes('"type":"suggestions"'));
  assert(sys.includes("🛒"));
});

test("buildSystemPrompt: Profil-Felder + Sprache werden eingespeist (A3)", () => {
  const sys = buildSystemPrompt({
    recipes: R.slice(0, 2), staples: ["Reis"], lang: "en",
    profile: { diet: "Vegan, keine Eier", spices: "nur Salz", servings: "~2" },
  });
  assert(sys.includes("Vegan, keine Eier"), "Diät-Feld fehlt");
  assert(sys.includes("nur Salz"), "Gewürz-Feld fehlt");
  assert(sys.includes("~2 Portionen"), "Portionen-Feld fehlt");
  assert(sys.includes("IMMER auf Englisch"), "Sprachzeile fehlt");
  assert(!sys.includes("Marcels persönlicher"), "alter hartkodierter Text noch da");
});

test("buildBulkPrompt: Text-Modus vs. Generieren, recipes-Array, 16 Kategorien (C1)", async () => {
  const { buildBulkPrompt } = await import("../src/features/capture/parse.js");
  const fromText = buildBulkPrompt({ generate: false });
  assert(fromText.includes("Extrahiere ALLE Rezepte"));
  assert(fromText.includes('"recipes"'));
  assert(fromText.includes("Grundrezepte & Basissoßen"));
  const gen = buildBulkPrompt({ generate: true, wish: "schnelle Pasta", count: 4 });
  assert(gen.includes("Erfinde 4"));
  assert(gen.includes("schnelle Pasta"));
});

test("fromStockUserPrompt: Vorrat-Modus, Frischware wird betont (#1)", () => {
  const empty = fromStockUserPrompt({ fridge: [] });
  assert(empty.includes("Vorrat") && empty.includes("suggestions-JSON"));
  assert(!empty.includes("Kühlschrank ("), "ohne Frischware keine Klammer-Liste");
  const withFresh = fromStockUserPrompt({ fridge: [{ name: "Zucchini" }, { name: "Feta" }] });
  assert(withFresh.includes("Zucchini") && withFresh.includes("Feta"), "Frischware steht im Prompt");
  assert(fromStockUserPrompt().includes("Vorrat"), "ohne Argument kein Crash");
});

test("suggestUserPrompt: Wochentag vs. Wochenende", () => {
  assert(suggestUserPrompt({ isWeekend: false }).includes("Wochentag"));
  assert(suggestUserPrompt({ isWeekend: true }).includes("Wochenende"));
});

test("planUserPrompt: enthält Plan, Locks und JSON-Format", () => {
  const plan = { days: [{ day: "Mo", recipeId: "r01" }, { day: "Di", recipeId: "rX", leftoverOf: "Mo" }] };
  const p = planUserPrompt({ wish: "leichter", plan, lockedDays: ["Mo"] });
  assert(p.includes("Mo: r01"));
  assert(p.includes("(Reste von Mo)"));
  assert(p.includes("Gesperrt (NICHT ändern): Mo"));
  assert(p.includes('"type":"plan"'));
});
