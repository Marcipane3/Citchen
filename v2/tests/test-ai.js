// Tests: ai/gate.js + ai/parse.js + ai/prompts.js — alles pur, ohne Netz/Key.
// Gating: kein Key → kein Premium; Parsing: Modell-JSON → schema-valide Rezepte.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import * as gate from "../src/ai/gate.js";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "../src/ai/models.js";
import {
  extractJson, coerceRecipe, coerceSuggestions, coercePlanDays, tippsToString,
  coerceUpdate, recipeChanges, coerceChange, applyContentFields, CONTENT_FIELDS, makeUpdatePatch, applyUpdatePatch, coerceDelete,
} from "../src/ai/parse.js";
import {
  buildSystemPrompt, buildCollectionContext, suggestUserPrompt, fromStockUserPrompt, planUserPrompt,
  profileBlock, DEFAULT_PROFILE, DEFAULT_INSTRUCTIONS, TEMPLATE_VARIABLES, missingVariables,
  appendedFixedPart, addBackVariables, attachedRecipeBlock, changeUserPrompt,
} from "../src/ai/prompts.js";
import { getInstructions, setInstructions, resetInstructions } from "../src/data/settings.js";
import { validateRecipe, PERSONAL_FIELDS } from "../src/data/schema.js";
import { buildIndex } from "../src/data/ingredientMatch.js";
import { withItems } from "../src/data/items.js";
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

test("gate: Modell-Default Haiku 5.5, Wechsel nur auf bekannte IDs (IDs aus models.js)", () => {
  assertEqual(gate.getModel(), "claude-haiku-5-5");
  gate.setModel("claude-sonnet-5-5");
  assertEqual(gate.getModel(), "claude-sonnet-5-5");
  gate.setModel("gpt-9000"); // unbekannt → ignoriert
  assertEqual(gate.getModel(), "claude-sonnet-5-5");
  gate.setModel("claude-haiku-5-5");
});

test("#79: Textmodelle sind Haiku 5.5 (Standard) und Sonnet 5.5; die 4.x-IDs sind nicht mehr wählbar", () => {
  assertDeepEqual(CHAT_MODELS.map((m) => [m.id, m.label]), [
    ["claude-haiku-5-5", "Haiku 5.5 — schnell & günstig (Standard)"],
    ["claude-sonnet-5-5", "Sonnet 5.5 — stärker"],
  ]);
  assertEqual(DEFAULT_CHAT_MODEL, "claude-haiku-5-5");
  gate.setModel("claude-sonnet-4-6");
  assertEqual(gate.getModel(), "claude-haiku-5-5", "4.x lässt sich nicht mehr neu wählen");
});

// gate.resolveModel(gespeichert) ist genau das, was getModel() mit dem Wert aus localStorage macht.
test("#79: gespeicherte Wahl Haiku 4.5 → Haiku 5.5", () => {
  assertEqual(gate.resolveModel("claude-haiku-4-5"), "claude-haiku-5-5");
});

test("#79: gespeicherte Wahl Sonnet 4.6 → Sonnet 5.5", () => {
  assertEqual(gate.resolveModel("claude-sonnet-4-6"), "claude-sonnet-5-5");
});

test("#79: andere unbekannte gespeicherte Wahl → Standard (wie bisher); gültige Wahl bleibt", () => {
  assertEqual(gate.resolveModel("claude-opus-3"), DEFAULT_CHAT_MODEL);
  assertEqual(gate.resolveModel(null), DEFAULT_CHAT_MODEL, "nichts gespeichert");
  assertEqual(gate.resolveModel("claude-sonnet-5-5"), "claude-sonnet-5-5");
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

/* ---------- Q4.1 (#69): Assistenten-Anweisungen als Vorlage ---------- */

const TPL_RX = [
  { id: "r01", name: "Linsen-Dal", category: "Vegetarische Hauptgerichte", effort: "alltag", cuisine: "Indisch", rating: 5 },
  { id: "r02", name: "Zimtschnecken", category: "Kuchen & Süßes", toTry: true },
];
const TPL_FRIDGE = [{ name: "Zucchini", menge: "2 Stück" }, { name: "Feta" }];

// Eingefrorene Kopie der Ausgabe von buildSystemPrompt VOR #69 (Stand next, 15.11.2026);
// #73 hat dem Vertrag bewusst die Antworten "update" und "change" hinzugefügt, #74 "delete" (sonst unverändert).
// Nicht aus dem Code ableiten und nicht „mitziehen“: genau diese Bytes müssen ohne Vorlage herauskommen.
// FROZEN_CONTRACT = der feste Ausgabe-Vertrag (Regeln 2–4), der an jede Vorlage angehängt wird.
const FROZEN_CONTRACT = `
2. Antworte mit GENAU EINEM JSON-Objekt (ohne Markdown-Zaun, ohne Text davor/danach):
   - Vorschläge: {"type":"suggestions","intro":"1 Satz","items":[{"id":"r… oder null","name":"…","reason":"1 Satz"}]} — 3 bis 5 Stück. "id" nur, wenn das Rezept WIRKLICH im Kochbuch steht (exakte id aus der Liste). Neue Ideen: id=null.
   - Vollrezept: {"type":"recipe","intro":"1 Satz","recipe":{…}} — Schema unten.
   - Rezept ändern (nur, wenn ein ANGEHÄNGTES REZEPT in der Nachricht steht): {"type":"update","id":"r…","intro":"1 Satz","recipe":{…}} — "id" = die id des angehängten Rezepts; "recipe" = das KOMPLETTE geänderte Rezept im Schema unten, auf Deutsch. Herz, Bewertung, Notizen, Fotos und Koch-Daten gibt es hier nicht; die bleiben.
   - Änderungswunsch OHNE angehängtes Rezept: nicht raten, sondern {"type":"change","id":"r…","intro":"1 Satz"} — exakte id aus der Kochbuch-Liste. Ist das Rezept nicht eindeutig, frag mit text nach.
   - Rezept löschen (nur auf ausdrücklichen Wunsch): {"type":"delete","id":"r…","intro":"1 Satz"} — GENAU EINE exakte id aus der Kochbuch-Liste, nie eine Liste. Gelöscht werden können nur Rezepte, die der Nutzer selbst angelegt hat; Grundrezepte der App nicht (die App lehnt das ab).
   - Sonst: {"type":"text","text":"…"}
3. Rezept-Schema (flach, Schema v3):
   {"name":str,"category":str (EXAKT eine von: Frühstück & Brunch / Schnelle Wochentags-Gerichte / Pasta & Nudeln / Reis & Getreide / Suppen & Eintöpfe / Salate & leichte Gerichte / Wochenend-Gerichte / Vegetarische Hauptgerichte / Deutsche Hausmannskost / Middle Eastern & Mediterran / Asiatisch inspiriert / Backen: Brot & Herzhaftes / Backen: Süßes & Kuchen / Muffins & Kleingebäck / Sourdough & Sauerteig / Grundrezepte & Basissoßen),"time":"25 Min","servings":"~4","effort":"alltag"|"besonders","difficulty":"einfach"|"mittel"|"aufwändig","cuisine":str,"prepTime":int,"cookTime":int,"totalTime":int,"mealPrep":bool,"toTry":true,"season":str|"","tags":[str],"ingredients":[str],"steps":[str],"tips":str}
   - ingredients: eine Zutat pro Eintrag, mit Menge ("400g Kichererbsen (Dose)"). Zutaten, die NICHT im Vorrat sind, bekommen am Ende " 🛒".
   - steps: kurze, nummerierbare Schritte; Zeitangaben als "X Min" schreiben (die App macht daraus Timer).
   - tips: ein String nach der Konvention "Topping: … Swap: … Alltags-Upgrade: …".
4. Vorschläge bevorzugt aus dem Kochbuch (Rotation: zuletzt Gekochtes meiden, wenn bekannt); höchstens 1–2 neue Ideen.`;
const FROZEN = [
  { label: "Kühlschrank leer", args: { recipes: TPL_RX, staples: ["Mehl", "Reis"] }, head: `Du bist der Koch-Assistent in einer persönlichen Kochbuch-App.

KOCH-PROFIL:
- Anfänger bis Mittelstufe, pragmatisch. Hauptsächlich vegetarisch (Eier/Fisch ok, kein Fleisch im Regelkauf).
- Immer ~4 Portionen (Reste werden über mehrere Tage gegessen).
- Wochentags: Schnell, 20–30 Min. Wochenende: Aufwendiger, Experimente, Backen.
- Einkauf: Dänische Supermärkte + Middle-Eastern-Bazaars.
- Ausstattung: Herd, Backofen, Mikrowelle, Mixer, Reiskocher. Kein Spezialgerät voraussetzen.

VORRAT (immer da — alles andere muss gekauft werden):
Mehl, Reis
Gewürze nur: Salz, Pfeffer, Paprika, Kreuzkümmel, Curry, Chiliflocken, Rosmarin, Muskat, Zimt. Andere Gewürze gelten als zu kaufen.

KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):
r01|Linsen-Dal|Vegetarische Hauptgerichte|alltag|Indisch|★5
r02|Zimtschnecken|Kuchen & Süßes|neu

REGELN:
1. Antworte IMMER auf Deutsch, kurz und klar. AUSNAHME: Rezept-Inhalte ("recipe": name, ingredients, steps, tips, cuisine, season) IMMER auf Deutsch — die Rezeptdatei ist deutsch; nur "intro", "reason" und "text" in Deutsch.` },
  { label: "Kühlschrank gefüllt", args: { recipes: TPL_RX, staples: ["Mehl", "Reis"], fridge: TPL_FRIDGE }, head: `Du bist der Koch-Assistent in einer persönlichen Kochbuch-App.

KOCH-PROFIL:
- Anfänger bis Mittelstufe, pragmatisch. Hauptsächlich vegetarisch (Eier/Fisch ok, kein Fleisch im Regelkauf).
- Immer ~4 Portionen (Reste werden über mehrere Tage gegessen).
- Wochentags: Schnell, 20–30 Min. Wochenende: Aufwendiger, Experimente, Backen.
- Einkauf: Dänische Supermärkte + Middle-Eastern-Bazaars.
- Ausstattung: Herd, Backofen, Mikrowelle, Mixer, Reiskocher. Kein Spezialgerät voraussetzen.

VORRAT (immer da — alles andere muss gekauft werden):
Mehl, Reis
Gewürze nur: Salz, Pfeffer, Paprika, Kreuzkümmel, Curry, Chiliflocken, Rosmarin, Muskat, Zimt. Andere Gewürze gelten als zu kaufen.

FRISCH IM KÜHLSCHRANK (jetzt verfügbar — bevorzugt verwerten):
Zucchini (2 Stück), Feta

KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):
r01|Linsen-Dal|Vegetarische Hauptgerichte|alltag|Indisch|★5
r02|Zimtschnecken|Kuchen & Süßes|neu

REGELN:
1. Antworte IMMER auf Deutsch, kurz und klar. AUSNAHME: Rezept-Inhalte ("recipe": name, ingredients, steps, tips, cuisine, season) IMMER auf Deutsch — die Rezeptdatei ist deutsch; nur "intro", "reason" und "text" in Deutsch.` },
  { label: "lang en", args: { recipes: TPL_RX, staples: ["Mehl", "Reis"], lang: "en" }, head: `Du bist der Koch-Assistent in einer persönlichen Kochbuch-App.

KOCH-PROFIL:
- Anfänger bis Mittelstufe, pragmatisch. Hauptsächlich vegetarisch (Eier/Fisch ok, kein Fleisch im Regelkauf).
- Immer ~4 Portionen (Reste werden über mehrere Tage gegessen).
- Wochentags: Schnell, 20–30 Min. Wochenende: Aufwendiger, Experimente, Backen.
- Einkauf: Dänische Supermärkte + Middle-Eastern-Bazaars.
- Ausstattung: Herd, Backofen, Mikrowelle, Mixer, Reiskocher. Kein Spezialgerät voraussetzen.

VORRAT (immer da — alles andere muss gekauft werden):
Mehl, Reis
Gewürze nur: Salz, Pfeffer, Paprika, Kreuzkümmel, Curry, Chiliflocken, Rosmarin, Muskat, Zimt. Andere Gewürze gelten als zu kaufen.

KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):
r01|Linsen-Dal|Vegetarische Hauptgerichte|alltag|Indisch|★5
r02|Zimtschnecken|Kuchen & Süßes|neu

REGELN:
1. Antworte IMMER auf Englisch, kurz und klar. AUSNAHME: Rezept-Inhalte ("recipe": name, ingredients, steps, tips, cuisine, season) IMMER auf Deutsch — die Rezeptdatei ist deutsch; nur "intro", "reason" und "text" in Englisch.` },
  { label: "Profil ohne shopping/notes", args: { recipes: TPL_RX, staples: ["Reis"], profile: { shopping: "", notes: "" } }, head: `Du bist der Koch-Assistent in einer persönlichen Kochbuch-App.

KOCH-PROFIL:
- Anfänger bis Mittelstufe, pragmatisch. Hauptsächlich vegetarisch (Eier/Fisch ok, kein Fleisch im Regelkauf).
- Immer ~4 Portionen (Reste werden über mehrere Tage gegessen).
- Wochentags: Schnell, 20–30 Min. Wochenende: Aufwendiger, Experimente, Backen.
- Ausstattung: Herd, Backofen, Mikrowelle, Mixer, Reiskocher. Kein Spezialgerät voraussetzen.

VORRAT (immer da — alles andere muss gekauft werden):
Reis
Gewürze nur: Salz, Pfeffer, Paprika, Kreuzkümmel, Curry, Chiliflocken, Rosmarin, Muskat, Zimt. Andere Gewürze gelten als zu kaufen.

KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):
r01|Linsen-Dal|Vegetarische Hauptgerichte|alltag|Indisch|★5
r02|Zimtschnecken|Kuchen & Süßes|neu

REGELN:
1. Antworte IMMER auf Deutsch, kurz und klar. AUSNAHME: Rezept-Inhalte ("recipe": name, ingredients, steps, tips, cuisine, season) IMMER auf Deutsch — die Rezeptdatei ist deutsch; nur "intro", "reason" und "text" in Deutsch.` },
  { label: "Profil mit notes, lang da", args: { recipes: TPL_RX, staples: ["Reis"], profile: { notes: "Keine Pilze" }, lang: "da" }, head: `Du bist der Koch-Assistent in einer persönlichen Kochbuch-App.

KOCH-PROFIL:
- Anfänger bis Mittelstufe, pragmatisch. Hauptsächlich vegetarisch (Eier/Fisch ok, kein Fleisch im Regelkauf).
- Immer ~4 Portionen (Reste werden über mehrere Tage gegessen).
- Wochentags: Schnell, 20–30 Min. Wochenende: Aufwendiger, Experimente, Backen.
- Einkauf: Dänische Supermärkte + Middle-Eastern-Bazaars.
- Ausstattung: Herd, Backofen, Mikrowelle, Mixer, Reiskocher. Kein Spezialgerät voraussetzen.
- Keine Pilze

VORRAT (immer da — alles andere muss gekauft werden):
Reis
Gewürze nur: Salz, Pfeffer, Paprika, Kreuzkümmel, Curry, Chiliflocken, Rosmarin, Muskat, Zimt. Andere Gewürze gelten als zu kaufen.

KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):
r01|Linsen-Dal|Vegetarische Hauptgerichte|alltag|Indisch|★5
r02|Zimtschnecken|Kuchen & Süßes|neu

REGELN:
1. Antworte IMMER auf Dänisch, kurz und klar. AUSNAHME: Rezept-Inhalte ("recipe": name, ingredients, steps, tips, cuisine, season) IMMER auf Deutsch — die Rezeptdatei ist deutsch; nur "intro", "reason" und "text" in Dänisch.` },
];

const TPL_ARGS = { recipes: TPL_RX, staples: ["Mehl", "Reis"], fridge: TPL_FRIDGE, lang: "en" };
const F_PROFILE = profileBlock();
const F_STOCK = "VORRAT (immer da — alles andere muss gekauft werden):\nMehl, Reis\nGewürze nur: " + DEFAULT_PROFILE.spices + ". Andere Gewürze gelten als zu kaufen.";
const F_FRIDGE = "FRISCH IM KÜHLSCHRANK (jetzt verfügbar — bevorzugt verwerten):\nZucchini (2 Stück), Feta";
const F_RECIPES = "KOCHBUCH (id|Name|Kategorie|Minuten|Aufwand|Küche|…):\n" + buildCollectionContext(TPL_RX);
const GERMAN_RULE = "(name, ingredients, steps, tips, cuisine, season) IMMER auf Deutsch";

test("Q4.1: DEFAULT_INSTRUCTIONS + TEMPLATE_VARIABLES exportiert, Vorlage = heutiger Text bis Regel 1", () => {
  assertDeepEqual(TEMPLATE_VARIABLES, ["profile", "stock", "fridge", "recipes", "language"]);
  assert(DEFAULT_INSTRUCTIONS.startsWith("Du bist der Koch-Assistent in einer persönlichen Kochbuch-App."), "Persona-Zeile fehlt");
  assert(DEFAULT_INSTRUCTIONS.endsWith('nur "intro", "reason" und "text" in {language}.'), "endet nicht mit Regel 1");
  assert(DEFAULT_INSTRUCTIONS.includes("REGELN:\n1. Antworte IMMER auf {language}, kurz und klar."), "Regel 1 fehlt");
  for (const v of TEMPLATE_VARIABLES) assert(DEFAULT_INSTRUCTIONS.includes("{" + v + "}"), "Platzhalter fehlt: " + v);
  for (const raw of ["KOCH-PROFIL", "VORRAT", "FRISCH IM", "KOCHBUCH", "Deutsch,", "2. Antworte"]) {
    assert(!DEFAULT_INSTRUCTIONS.includes(raw), "Block/Vertrag steht noch fest in der Vorlage: " + raw);
  }
});

test("Q4.1: ohne Vorlage byte-identisch zur eingefrorenen Ausgabe (leer, null, Leerraum, Default-Text)", () => {
  for (const f of FROZEN) {
    const want = f.head + FROZEN_CONTRACT;
    assertEqual(buildSystemPrompt(f.args), want, f.label + ": ohne template");
    for (const template of [undefined, null, "", "  \n\t "]) {
      assertEqual(buildSystemPrompt({ ...f.args, template }), want, f.label + ": template=" + JSON.stringify(template));
    }
    assertEqual(buildSystemPrompt({ ...f.args, template: DEFAULT_INSTRUCTIONS }), want, f.label + ": Default-Text als template");
  }
});

test("Q4.1: jede Variable wird zu ihrem ganzen Block inkl. Überschrift", () => {
  const body = (template, args = TPL_ARGS) => {
    const sys = buildSystemPrompt({ ...args, template });
    return sys.slice(0, sys.indexOf(FROZEN_CONTRACT));
  };
  assertEqual(body("A {profile} B"), "A " + F_PROFILE + " B");
  assertEqual(body("A {stock} B"), "A " + F_STOCK + " B");
  assertEqual(body("A {fridge} B"), "A " + F_FRIDGE + " B");
  assertEqual(body("A {recipes} B"), "A " + F_RECIPES + " B");
  assertEqual(body("A {language} B"), "A Englisch B");
  assertEqual(body("{language}", { ...TPL_ARGS, lang: "xx" }), "Deutsch", "unbekannte Sprache → Deutsch");
  const custom = body("{profile}|{stock}", { ...TPL_ARGS, profile: { diet: "Vegan", spices: "nur Salz" } });
  assert(custom.includes("Vegan.") && custom.includes("Gewürze nur: nur Salz."), "Profil-Felder fließen in {profile} und {stock}");
});

test("Q4.1: mehrfach vorkommende Variable wird überall ersetzt", () => {
  const sys = buildSystemPrompt({ ...TPL_ARGS, template: "{language} / {recipes} / {language} / {recipes}" });
  assert(sys.startsWith("Englisch / " + F_RECIPES + " / Englisch / " + F_RECIPES + "\n2. "));
});

test("Q4.1: leerer Kühlschrank → {fridge} verschwindet ganz, keine verwaisten Leerzeilen", () => {
  const body = (template) => {
    const sys = buildSystemPrompt({ recipes: TPL_RX, staples: ["Mehl", "Reis"], fridge: [], template });
    return sys.slice(0, sys.indexOf(FROZEN_CONTRACT));
  };
  assertEqual(body("A\n\n{fridge}\n\nB"), "A\n\nB");
  assertEqual(body("A\n{fridge}\nB"), "A\nB");
  assertEqual(body("{fridge}\n\nB"), "B");
  assertEqual(body("A\n\n{fridge}"), "A");
  assertEqual(body("A\n\n  {fridge}  \n\nB\n\n{fridge}\n\nC"), "A\n\nB\n\nC");
  assertEqual(body("Frisch: {fridge}."), "Frisch: .", "im Fließtext nur der Platzhalter");
  const filled = buildSystemPrompt({ ...TPL_ARGS, template: "A\n\n{fridge}\n\nB" });
  assert(filled.startsWith("A\n\n" + F_FRIDGE + "\n\nB\n2. "), "gefüllter Kühlschrank bleibt ein eigener Absatz");
});

test("Q4.1: fester Ausgabe-Vertrag (Regeln 2–4) hängt immer hinter dem Vorlagentext", () => {
  for (const template of ["Koch", "REGELN:\n1. Sei nett.\n2. Antworte als Gedicht.", "{recipes}"]) {
    const sys = buildSystemPrompt({ ...TPL_ARGS, template });
    const at = sys.lastIndexOf(FROZEN_CONTRACT);
    assert(at > 0, "Vertrag fehlt/verändert bei: " + template);
    assertEqual(sys.indexOf(FROZEN_CONTRACT), at, "Vertrag genau einmal");
    assert(sys.indexOf("Antworte mit GENAU EINEM JSON-Objekt") > sys.indexOf(template.split("\n")[0].replace("{recipes}", "KOCHBUCH")), "Vertrag steht nach dem Vorlagentext");
  }
  assert(buildSystemPrompt({ ...TPL_ARGS, template: "Koch" }).startsWith("Koch" + FROZEN_CONTRACT));
});

test("Q4.1: eigene Vorlage → feste Schlusszeile „Rezept-Inhalte immer Deutsch“; Default ohne Zusatz", () => {
  const sys = buildSystemPrompt({ ...TPL_ARGS, template: "Du bist ein Pirat. Antworte auf {language}." });
  const extra = sys.slice(sys.indexOf(FROZEN_CONTRACT) + FROZEN_CONTRACT.length);
  assert(/^\n[^\n]+$/.test(extra), "genau eine zusätzliche Zeile am Ende");
  assert(extra.includes(GERMAN_RULE), "Deutsch-Regel fehlt");
  assert(buildSystemPrompt(TPL_ARGS).endsWith(FROZEN_CONTRACT), "Default: nichts nach dem Vertrag");
  assert(buildSystemPrompt({ ...TPL_ARGS, template: DEFAULT_INSTRUCTIONS }).endsWith(FROZEN_CONTRACT), "Default-Text: nichts nach dem Vertrag");
});

test("Q4.1: unbekannte Platzhalter und unbalancierte Klammern bleiben wie getippt, nichts wirft", () => {
  for (const template of ["{foo}", "a {foo} b {Recipes} c { recipes } d", "{recipes", "recipes}", "{", "}", "{}", "}{", "{{", "{profile {stock", "$& $1 {foo} $$"]) {
    const sys = buildSystemPrompt({ ...TPL_ARGS, template });
    assert(sys.startsWith(template + FROZEN_CONTRACT), "verändert: " + template);
  }
  assert(buildSystemPrompt({ ...TPL_ARGS, template: "{{language}}" }).startsWith("{Englisch}" + FROZEN_CONTRACT));
});

test("Q4.1: Ersetzung in einem Durchgang — Platzhalter in eingesetzten Daten werden nicht expandiert", () => {
  const args = {
    recipes: [{ id: "r01", name: "Suppe {stock} $& {language}", category: "Suppen & Eintöpfe" }],
    staples: ["Reis {recipes}"], fridge: [{ name: "Feta {profile}" }], profile: { notes: "Notiz {recipes} {fridge}" }, lang: "en",
  };
  const sys = buildSystemPrompt({ ...args, template: "{profile}\n{stock}\n{fridge}\n{recipes}\n{language}" });
  for (const raw of ["r01|Suppe {stock} $& {language}|", "Reis {recipes}\n", "Feta {profile}\n", "- Notiz {recipes} {fridge}\n"]) {
    assert(sys.includes(raw), "eingesetzte Daten verändert: " + raw);
  }
  assertEqual(sys.split("KOCHBUCH (").length - 1, 1, "{recipes} aus den Daten wurde expandiert");
  assertEqual(sys.split("VORRAT (").length - 1, 1, "{stock} aus den Daten wurde expandiert");
  assertEqual(sys.split("KOCH-PROFIL:").length - 1, 1, "{profile} aus den Daten wurde expandiert");
  const def = buildSystemPrompt(args);
  assert(def.includes("r01|Suppe {stock} $& {language}|") && def.split("VORRAT (").length - 1 === 1, "auch mit der Default-Vorlage");
});

test("Q4.1: missingVariables — fehlende Variablen in fester Reihenfolge", () => {
  assertDeepEqual(missingVariables(DEFAULT_INSTRUCTIONS), []);
  assertDeepEqual(missingVariables("Hallo"), ["profile", "stock", "fridge", "recipes", "language"]);
  assertDeepEqual(missingVariables("{language} dann {stock}"), ["profile", "fridge", "recipes"]);
  assertDeepEqual(missingVariables("{recipes}{recipes} {Profile} {fridge"), ["profile", "stock", "fridge", "language"]);
  for (const t of [undefined, null, "", 42]) assertDeepEqual(missingVariables(t), ["profile", "stock", "fridge", "recipes", "language"]);
});

test("Q4.1: Planner-Aufruf (nur recipes + staples) unverändert", () => {
  assertEqual(buildSystemPrompt({ recipes: TPL_RX, staples: ["Mehl", "Reis"] }), FROZEN[0].head + FROZEN_CONTRACT);
});

/* ---------- Q4.2 (#70): Anweisungen speichern, fester Teil, „wieder einfügen“ ---------- */

// Minimales IndexedDB-Double (nur was db.js für kv get/put/delete braucht) — Node hat kein IndexedDB.
function installFakeIndexedDB() {
  const stores = new Map();
  const later = (fn) => setTimeout(fn, 0);
  const database = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n, { keyPath }) => { stores.set(n, { keyPath, rows: new Map() }); },
    transaction(name) {
      const st = stores.get(name);
      const t = {};
      const reqs = [];
      const op = (fn) => { const r = {}; reqs.push(() => { r.result = fn(); r.onsuccess && r.onsuccess(); }); return r; };
      t.objectStore = () => ({
        get: (k) => op(() => { const v = st.rows.get(k); return v === undefined ? undefined : structuredClone(v); }),
        put: (v) => op(() => { st.rows.set(v[st.keyPath], structuredClone(v)); }),
        delete: (k) => op(() => { st.rows.delete(k); }),
      });
      later(() => { while (reqs.length) reqs.shift()(); t.oncomplete && t.oncomplete(); });
      return t;
    },
  };
  globalThis.indexedDB = {
    open() {
      const req = { result: database };
      later(() => { req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess(); });
      return req;
    },
  };
  return stores;
}
const IDB = globalThis.indexedDB ? null : installFakeIndexedDB();
const kvRows = () => IDB.get("kv").rows;

test("Q4.2: getInstructions — nichts gespeichert → mitgelieferte Default-Anweisungen", async () => {
  await resetInstructions();
  assertEqual(await getInstructions(), DEFAULT_INSTRUCTIONS);
});

test("Q4.2: setInstructions → getInstructions (Round-Trip, Text unverändert, nur Geräte-kv)", async () => {
  const mine = "Antworte wie ein Pirat.\n{profile}\n{stock}\n{fridge}\n{recipes}\nSprache: {language}  ";
  assertEqual(await setInstructions(mine), mine);
  assertEqual(await getInstructions(), mine);
  assertDeepEqual([...kvRows().keys()], ["assistantInstructions"], "genau ein kv-Schlüssel, sonst nichts");
  await resetInstructions();
});

test("Q4.2: resetInstructions löscht den Eintrag; danach wieder Default", async () => {
  await setInstructions("Kurz und knapp {recipes}");
  assertEqual(await resetInstructions(), DEFAULT_INSTRUCTIONS);
  assert(!kvRows().has("assistantInstructions"), "Eintrag gelöscht");
  assertEqual(await getInstructions(), DEFAULT_INSTRUCTIONS);
});

test("Q4.2: leerer Text speichern = Reset (nie ohne Anweisungen)", async () => {
  await setInstructions("Eigene {recipes}");
  for (const empty of ["", "   \n\t ", null, undefined]) {
    await setInstructions("Eigene {recipes}");
    assertEqual(await setInstructions(empty), DEFAULT_INSTRUCTIONS);
    assert(!kvRows().has("assistantInstructions"), "leer → Eintrag gelöscht: " + JSON.stringify(empty));
    assertEqual(await getInstructions(), DEFAULT_INSTRUCTIONS);
  }
});

test("Q4.2: appendedFixedPart = genau das, was buildSystemPrompt an eine eigene Vorlage anhängt", () => {
  const fixed = appendedFixedPart();
  assert(fixed.startsWith(FROZEN_CONTRACT), "beginnt mit dem festen Ausgabe-Vertrag");
  assert(fixed.length > FROZEN_CONTRACT.length && fixed.includes("IMMER auf Deutsch"), "plus Deutsch-Regel");
  for (const template of ["Pirat {recipes}", "{profile}\n{stock}\n{recipes}\n{language}", "nur Text"]) {
    const sys = buildSystemPrompt({ ...TPL_ARGS, template });
    assert(sys.endsWith(fixed), "endet mit dem festen Teil: " + template);
    assertEqual(sys.length - fixed.length, sys.lastIndexOf(fixed), "fester Teil genau einmal am Ende");
  }
  assertEqual(buildSystemPrompt({ ...TPL_ARGS, template: "nur Text" }), "nur Text" + fixed);
});

test("Q4.2: addBackVariables — fehlende Variablen ans Ende, jede in eigener Zeile", () => {
  assertEqual(addBackVariables("Pirat {profile}", ["recipes"]), "Pirat {profile}\n{recipes}");
  assertEqual(addBackVariables("Pirat\n", ["stock", "recipes"]), "Pirat\n{stock}\n{recipes}");
  assertEqual(addBackVariables("Pirat", []), "Pirat");
  const back = addBackVariables(DEFAULT_INSTRUCTIONS.replace("{recipes}", ""), ["recipes"]);
  assert(back.endsWith("\n{recipes}"));
  assertDeepEqual(missingVariables(back), []);
});

/* ---------- G3.2 (#73): Assistent schlägt Rezept-Änderungen vor ---------- */

const STORED73 = {
  id: "r07", name: "Linsen-Bolognese", category: "Pasta & Nudeln", time: "30 Min", servings: "~4",
  ingredients: ["400g Spaghetti", "200g Hackfleisch 🛒", "1 Dose Tomaten"], steps: ["Hack anbraten.", "Tomaten 15 Min köcheln."],
  tips: "Topping: Parmesan.", effort: "alltag", tags: ["pasta"], toTry: false, mealPrep: true,
  favorite: true, rating: 5, feedback: "Mehr Knoblauch!", photos: [{ id: "f1", added: "2026-01-01" }],
  cookedCount: 7, lastCooked: "Oktober 2026", image: "https://example.org/b.jpg", origin: "user", extraFuture: "bleibt",
};
const VEGAN73 = {
  name: "Vegane Linsen-Bolognese", category: "pasta & nudeln", time: "30 Min", servings: "~4",
  ingredients: ["400g Spaghetti", "200g rote Linsen 🛒", "1 Dose Tomaten"], steps: ["Linsen anbraten.", "Tomaten 15 Min köcheln."],
  tips: "Topping: Hefeflocken.", effort: "alltag", tags: ["pasta", "vegan"], toTry: false, mealPrep: true,
};
const upd73 = (recipe, id = "r07") => ({ type: "update", id, intro: "Vegan gemacht.", recipe });

test("#73: fester Vertrag kennt update (komplettes Rezept) und change (nur id)", () => {
  const fixed = appendedFixedPart();
  assert(fixed.includes('{"type":"update","id":"r…","intro":"1 Satz","recipe":{…}}'), "update fehlt im Vertrag");
  assert(fixed.includes("KOMPLETTE geänderte Rezept"), "komplettes Rezept nicht verlangt");
  assert(fixed.includes('{"type":"change","id":"r…","intro":"1 Satz"}'), "change fehlt im Vertrag");
  assert(buildSystemPrompt(TPL_ARGS).includes('"type":"update"'), "Default-Prompt trägt update");
});

test("#73: coerceUpdate — unbekannte oder abweichende id → Fehler, kein Rezept", () => {
  assertEqual(coerceUpdate(upd73(VEGAN73, "r99"), null).recipe, null);
  const r = coerceUpdate(upd73(VEGAN73, "r99"), STORED73);
  assertEqual(r.recipe, null);
  assert(r.errors.length > 0 && /r99/.test(r.errors[0]), "Fehler nennt die id");
  assertEqual(coerceUpdate(upd73(VEGAN73, ""), STORED73).recipe, null);
  assertEqual(coerceUpdate(null, STORED73).recipe, null);
});

test("#73: coerceUpdate — Ergebnis ist schema-valide, Inhalt vom Modell", () => {
  const { recipe, errors } = coerceUpdate(upd73(VEGAN73), STORED73);
  assertDeepEqual(errors, []);
  assert(validateRecipe(recipe).valid, "validateRecipe");
  assertEqual(recipe.name, "Vegane Linsen-Bolognese");
  assertEqual(recipe.category, "Pasta & Nudeln", "Kategorie wie bei coerceRecipe normalisiert");
  assertDeepEqual(recipe.ingredients, VEGAN73.ingredients);
  assertDeepEqual(recipe.tags, ["pasta", "vegan"]);
  assertEqual(recipe.tips, "Topping: Hefeflocken.");
  assertEqual(coerceUpdate(upd73({ ...VEGAN73, category: "Gibt es nicht" }), STORED73).recipe, null, "ungültige Kategorie");
  assertEqual(coerceUpdate(upd73({ ...VEGAN73, ingredients: [] }), STORED73).recipe, null, "keine Zutaten");
});

test("#113: coerceUpdate — leere Tipps vom Modell löschen die gespeicherten nicht", () => {
  const stored = { ...STORED73, tips: "Gut ziehen lassen" };
  const base = { ...VEGAN73 };
  delete base.tips;
  for (const [label, extra] of [["tips {}", { tips: {} }], ["tips \"\"", { tips: "" }], ["tipps {}", { tipps: {} }], ["tips Leerraum", { tips: "  " }]]) {
    const { recipe, errors } = coerceUpdate(upd73({ ...base, ...extra }), stored);
    assertDeepEqual(errors, [], label);
    assertEqual(recipe.tips, "Gut ziehen lassen", label + " behält gespeicherte Tipps");
  }
  assertEqual(coerceUpdate(upd73({ ...base, tips: "Neu." }), stored).recipe.tips, "Neu.", "Text ersetzt");
  assertEqual(coerceUpdate(upd73({ ...base, tips: { technik: "Heiß braten" } }), stored).recipe.tips, "Technik: Heiß braten.", "Objekt mit Inhalt ersetzt");
  const noTips = { ...STORED73 }; delete noTips.tips;
  const r = coerceUpdate(upd73({ ...base, tips: {} }), noTips);
  assert(r.recipe && validateRecipe(r.recipe).valid, "ohne gespeicherte Tipps bleibt das Rezept valide");
  assert(!r.recipe.tips, "Tipps bleiben leer");
});

test("#73: coerceUpdate — id, origin, Bild und jedes persönliche Feld kommen aus dem gespeicherten Rezept", () => {
  const evil = { ...VEGAN73, id: "r1", origin: "shared", image: "x", favorite: false, rating: 1, feedback: "weg",
    photos: [], cookedCount: 0, lastCooked: "nie" };
  const { recipe } = coerceUpdate(upd73(evil), STORED73);
  for (const f of ["id", "origin", "image", "extraFuture", ...PERSONAL_FIELDS]) {
    assertDeepEqual(recipe[f], STORED73[f], f + " vom Modell überschrieben");
  }
  for (const f of ["id", "origin", "image", ...PERSONAL_FIELDS]) assert(!CONTENT_FIELDS.includes(f), f + " ist kein Inhaltsfeld");
  for (const f of ["name", "category", "ingredients", "steps", "tips", "time", "tags", "prepTime", "cookTime", "totalTime", "servings"]) {
    assert(CONTENT_FIELDS.includes(f), f + " fehlt in CONTENT_FIELDS");
  }
  // Grundrezept bleibt ohne origin
  const base = { ...STORED73 }; delete base.origin;
  assert(!("origin" in coerceUpdate(upd73(evil), base).recipe), "Grundrezept bekommt kein origin");
});

// #114: pinnt, dass `items` (abgeleitet, kein Inhaltsfeld) von coerceUpdate unberührt durchgereicht wird;
// das Nachziehen übernimmt withItems beim Lesen.
const ITEMS114 = [
  { text: "400g Spaghetti", ing: "pasta", buy: false, optional: false },
  { text: "200g Hackfleisch 🛒", ing: "mince", buy: true, optional: false },
  { text: "1 Dose Tomaten", ing: "tomato", buy: false, optional: false },
];
const STORED114 = { ...STORED73, items: ITEMS114 };
const INDEX114 = buildIndex({ ingredients: ["pasta:Spaghetti", "mince:Hackfleisch", "tomato:Tomaten", "lentil:Linsen"].map((s) => {
  const [id, de] = s.split(":");
  return { id, names: { de, en: id, es: id, da: id }, base: "g", shop: "g" };
}) });

test("#114: coerceUpdate mit geänderten Zutaten — gespeicherte items bleiben unberührt, Ergebnis valide", () => {
  assert(!CONTENT_FIELDS.includes("items"), "items ist kein Inhaltsfeld");
  const { recipe, errors } = coerceUpdate(upd73(VEGAN73), STORED114);
  assertDeepEqual(errors, []);
  assertDeepEqual(recipe.ingredients, VEGAN73.ingredients, "Zutaten kommen vom Modell");
  assertDeepEqual(recipe.items, ITEMS114, "items unverändert");
  assert(validateRecipe(recipe).valid, "schema-valide");
});

test("#114: coerceUpdate + withItems — Items entfernter Zeilen fallen weg, unveränderte bleiben", () => {
  const { recipe } = coerceUpdate(upd73(VEGAN73), STORED114);
  const out = withItems(recipe, INDEX114);
  assert(!out.items.some((it) => it.text === "200g Hackfleisch 🛒"), "Item der entfernten Zeile bleibt");
  assert(out.items.some((it) => it.text === "200g rote Linsen 🛒"), "neue Zeile bekommt ein Item");
  assertDeepEqual(out.items.find((it) => it.text === "400g Spaghetti"), ITEMS114[0], "Item unveränderter Zeile identisch");
  assertDeepEqual(out.items.find((it) => it.text === "1 Dose Tomaten"), ITEMS114[2], "Item unveränderter Zeile identisch");
  assertEqual(out.items.length, VEGAN73.ingredients.length);
  assert(validateRecipe(out).valid, "schema-valide");
});

test("#114: coerceUpdate mit gleichen Zutaten — items identisch, auch nach withItems", () => {
  const same = { ...VEGAN73, ingredients: [...STORED114.ingredients], steps: ["Anders formuliert."] };
  const { recipe, errors } = coerceUpdate(upd73(same), STORED114);
  assertDeepEqual(errors, []);
  assertDeepEqual(recipe.items, ITEMS114, "items identisch");
  assert(validateRecipe(recipe).valid, "schema-valide");
  assertDeepEqual(withItems(recipe, INDEX114).items, ITEMS114, "withItems ändert nichts");
});

test("#73: coerceUpdate — vom Modell weggelassene Felder bleiben wie gespeichert (kein toTry-Default)", () => {
  const partial = { name: "Vegane Bolognese", category: "Pasta & Nudeln", ingredients: ["Linsen"], steps: ["Kochen."] };
  const { recipe } = coerceUpdate(upd73(partial), STORED73);
  assertEqual(recipe.toTry, false);
  assertEqual(recipe.mealPrep, true);
  assertEqual(recipe.tips, STORED73.tips);
  assertDeepEqual(recipe.tags, STORED73.tags);
  assertEqual(recipe.effort, "alltag");
});

test("#73: recipeChanges — geänderte Felder; Zutaten/Schritte als hinzugefügte und entfernte Zeilen", () => {
  const { recipe } = coerceUpdate(upd73(VEGAN73), STORED73);
  const ch = recipeChanges(STORED73, recipe);
  assertDeepEqual(ch.map((c) => c.field), ["name", "ingredients", "steps", "tips", "tags"]);
  assertDeepEqual(ch[0], { field: "name", before: "Linsen-Bolognese", after: "Vegane Linsen-Bolognese" });
  assertDeepEqual(ch[1], { field: "ingredients", added: ["200g rote Linsen 🛒"], removed: ["200g Hackfleisch 🛒"] });
  assertDeepEqual(ch[2], { field: "steps", added: ["Linsen anbraten."], removed: ["Hack anbraten."] });
  assertDeepEqual(recipeChanges(STORED73, { ...STORED73 }), [], "nichts geändert");
  assertDeepEqual(recipeChanges(STORED73, { ...STORED73, rating: 1, favorite: false }), [], "persönliche Felder zählen nicht");
  // Doppelte Zeilen zählen mengengenau
  assertDeepEqual(recipeChanges({ ingredients: ["Salz", "Salz"] }, { ingredients: ["Salz"] }), [{ field: "ingredients", added: [], removed: ["Salz"] }]);
});

test("#73: applyContentFields überträgt nur Inhalt, persönliche Felder bleiben", () => {
  const target = { ...STORED73 };
  const { recipe } = coerceUpdate(upd73(VEGAN73), STORED73);
  applyContentFields(target, { ...recipe, rating: 0, favorite: false });
  assertEqual(target.name, "Vegane Linsen-Bolognese");
  assertEqual(target.rating, 5);
  assertEqual(target.favorite, true);
});

test("#73: attachedRecipeBlock trägt den vollen deutschen Inhalt, nichts Persönliches", () => {
  const block = attachedRecipeBlock(STORED73);
  assert(block.startsWith("ANGEHÄNGTES REZEPT"), "Überschrift");
  for (const line of [...STORED73.ingredients, ...STORED73.steps, STORED73.tips, STORED73.name, "r07"]) {
    assert(block.includes(JSON.stringify(line)), "fehlt: " + line);
  }
  for (const s of ["Mehr Knoblauch", "f1", "Oktober 2026", "example.org", "extraFuture", '"rating"', '"origin"']) {
    assert(!block.includes(s), "Persönliches/Fremdes im Block: " + s);
  }
  const p = changeUserPrompt(STORED73, "mach es vegan");
  assert(p.startsWith(block), "Prompt beginnt mit dem Block");
  assert(p.includes("Wunsch: mach es vegan") && p.includes('"id":"r07"') && p.includes("update-JSON"));
});

test("#73: coerceChange — nur bekannte ids; sonst null (→ Klartext)", () => {
  const known = new Set(["r07"]);
  assertDeepEqual(coerceChange({ type: "change", id: "r07", intro: " Gern! " }, known), { id: "r07", intro: "Gern!" });
  assertEqual(coerceChange({ type: "change", id: "r99", intro: "x" }, known), null);
  assertEqual(coerceChange({ type: "change", intro: "x" }, known), null);
});

test("#73 B1: Karte gegen R gerechnet, R.name danach bearbeitet → Übernehmen ändert nur Zutaten, Name bleibt", () => {
  const { recipe } = coerceUpdate(upd73({ ...VEGAN73, name: STORED73.name }), STORED73);
  const patch = JSON.parse(JSON.stringify(makeUpdatePatch(STORED73, recipe)));
  assertDeepEqual(Object.keys(patch.set).sort(), ["ingredients", "steps", "tags", "tips"]);
  assert(!("name" in patch.set), "Name steht nicht im Patch, wenn er sich nicht ändert");
  const edited = { ...STORED73, name: "Meine Bolognese", steps: STORED73.steps.slice(), ingredients: STORED73.ingredients.slice(), tips: STORED73.tips, tags: STORED73.tags.slice() };
  const r = applyUpdatePatch(edited, patch);
  assert(r.applied, "keine Konflikte, weil die Karte nur andere Felder anfasst");
  assertEqual(edited.name, "Meine Bolognese");
  assertEqual(edited.ingredients[1], "200g rote Linsen 🛒");
});

test("#73 B1: Feld seit der Karte geändert (oder schon angewendet) → Patch verweigert, nichts verändert", () => {
  const { recipe } = coerceUpdate(upd73(VEGAN73), STORED73);
  const patch = JSON.parse(JSON.stringify(makeUpdatePatch(STORED73, recipe)));
  const edited = { ...STORED73, ingredients: ["etwas ganz anderes"] };
  const r = applyUpdatePatch(edited, patch);
  assert(!r.applied && r.conflicts.includes("ingredients"));
  assertDeepEqual(edited.ingredients, ["etwas ganz anderes"]);
  const once = { ...STORED73 };
  assert(applyUpdatePatch(once, patch).applied);
  assert(!applyUpdatePatch(once, patch).applied, "zweites Anwenden desselben Patches wird verweigert");
});

test("#73 B2: toTry — gespeichert false, Modell schickt true oder null → bleibt false", () => {
  assertEqual(coerceUpdate(upd73({ ...VEGAN73, toTry: true }), STORED73).recipe.toTry, false);
  assertEqual(coerceUpdate(upd73({ ...VEGAN73, toTry: null }), STORED73).recipe.toTry, false);
});

test("#73 B3: nur prepTime/cookTime geschickt → totalTime und time werden neu abgeleitet", () => {
  const stored = { ...STORED73, prepTime: 10, cookTime: 15, totalTime: 25, time: "25 Min" };
  const { recipe } = coerceUpdate(upd73({ ...VEGAN73, time: "", prepTime: 20, cookTime: 30 }), stored);
  assertEqual(recipe.totalTime, 50);
  assertEqual(recipe.time, "50 Min");
});

test("#73 Nit: falsch getypte Werte lassen das Gespeicherte stehen", () => {
  const { recipe } = coerceUpdate(upd73({ ...VEGAN73, tipps: undefined, tips: 5, tags: "scharf", effort: "hoch" }), STORED73);
  assertEqual(recipe.tips, STORED73.tips);
  assertDeepEqual(recipe.tags, STORED73.tags);
  assertEqual(recipe.effort, STORED73.effort);
});

// ---- #74 (G3.3): Assistent löscht nur selbst angelegte Rezepte ----
const D74 = [
  { id: "r01", name: "Grundrezept" },
  { id: "r02", name: "Eigenes", origin: "user" },
  { id: "r03", name: "Geteilt", origin: "shared" },
];

test("#74: Vertrag kennt delete; Prompt sagt, dass nur selbst angelegte Rezepte gelöscht werden", () => {
  const sys = buildSystemPrompt({ recipes: R.slice(0, 2), staples: [] });
  assert(sys.includes('{"type":"delete","id":"r…"'), "delete im Vertrag");
  assert(/nur Rezepte, die der Nutzer selbst angelegt hat/.test(sys), "Hinweis auf eigene Rezepte");
});

test("#74: coerceDelete — eigenes Rezept (origin user) → {recipe, intro}", () => {
  const r = coerceDelete({ type: "delete", id: "r02", intro: " Weg damit. " }, D74);
  assertEqual(r.recipe.id, "r02");
  assertEqual(r.intro, "Weg damit.");
});

test("#74: coerceDelete — Grundrezept (kein origin) wird verweigert", () => {
  const r = coerceDelete({ type: "delete", id: "r01" }, D74);
  assertEqual(r.recipe, null);
  assertEqual(r.reason, "notUser");
});

test("#74: coerceDelete — anderer origin-Wert wird verweigert", () => {
  const r = coerceDelete({ type: "delete", id: "r03" }, D74);
  assertEqual(r.recipe, null);
  assertEqual(r.reason, "notUser");
});

test("#74: coerceDelete — unbekannte id wird verweigert", () => {
  const r = coerceDelete({ type: "delete", id: "r99" }, D74);
  assertEqual(r.recipe, null);
  assertEqual(r.reason, "unknown");
});

test("#74: coerceDelete — eine Liste von ids wird nicht akzeptiert (höchstens ein Rezept)", () => {
  for (const id of [["r02"], ["r02", "r01"], { 0: "r02" }, 5, null, undefined, ""]) {
    const r = coerceDelete({ type: "delete", id }, D74);
    assertEqual(r.recipe, null);
    assertEqual(r.reason, "invalid");
  }
  assertEqual(coerceDelete({ type: "delete", ids: ["r02"] }, D74).recipe, null);
  assertEqual(coerceDelete(null, D74).recipe, null);
});

test("#74: coerceDelete — gleicher Check beim Tippen: Karte von früher löscht kein Rezept, das nicht mehr origin user ist", () => {
  const card = coerceDelete({ type: "delete", id: "r02" }, D74); // Karte war erlaubt
  assert(card.recipe);
  const nowStored = [{ id: "r02", name: "Eigenes" }]; // inzwischen ohne origin gespeichert
  assertEqual(coerceDelete({ id: card.recipe.id }, nowStored).reason, "notUser");
  assertEqual(coerceDelete({ id: card.recipe.id }, []).reason, "unknown"); // schon gelöscht
});
