// Tests: Persistenz-Kanonik (K4b). Invariante (B2/B3, store.js): die Drive-Datei bleibt
// DEUTSCH — nur `recipesDe` (kanonisch) wird je serialisiert, niemals die lokalisierte
// Anzeige-Sicht `state.recipes`. Das schützt die deutsche Quelle (geteilt mit v1 +
// Projekt-Claude) gegen eine künftige Regression, die Übersetzungen nach Drive durchsickern
// lässt. Reiner Node-Test (Logik + Quelltext-Wächter), kein DOM, keine IndexedDB.
import { test, assert, assertEqual } from "./runner.js";
import { buildLangMap, localizeRecipes } from "../src/data/baseLang.js";
import { toFileString } from "../src/data/migrate.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DE = [{
  id: "r01", name: "Süßkartoffel-Curry", category: "Vegetarische Hauptgerichte",
  time: "35 Min", servings: "~4", lastCooked: "Mai 2026",
  ingredients: ["2 Süßkartoffeln", "Reis als Beilage 🛒"],
  steps: ["Reis aufsetzen.", "Alles köcheln."],
  tips: "Topping: Joghurt.", favorite: true, rating: 4, cookedCount: 3,
}];
const EN = [{
  id: "r01", name: "Sweet potato curry",
  ingredients: ["2 sweet potatoes", "Rice on the side 🛒"],
  steps: ["Cook the rice.", "Simmer everything."],
  tips: "Topping: yogurt.",
}];

test("Kanonik: die lokalisierte Anzeige mutiert die deutsche Sammlung nicht", () => {
  const view = localizeRecipes(DE, buildLangMap(EN));
  assertEqual(view[0].name, "Sweet potato curry");      // Anzeige ist übersetzt …
  assertEqual(DE[0].name, "Süßkartoffel-Curry");          // … Original bleibt deutsch
  assertEqual(DE[0].steps[0], "Reis aufsetzen.");
  assertEqual(DE[0].tips, "Topping: Joghurt.");
});

test("Kanonik: was nach Drive serialisiert wird, ist DEUTSCH — nie der Overlay", () => {
  const view = localizeRecipes(DE, buildLangMap(EN));
  // Persistenz serialisiert die KANONISCHE Sammlung (recipesDe), nie die Anzeige-Sicht.
  const drive = toFileString({ updated: "2026-06-14T00:00:00Z", recipes: DE });
  assert(drive.includes("Süßkartoffel-Curry"), "deutscher Name fehlt im Drive-Inhalt");
  assert(!drive.includes("Sweet potato curry"), "ENGLISCH im Drive-Inhalt — Overlay ist geleakt!");
  assert(!drive.includes("Cook the rice"), "übersetzter Schritt im Drive-Inhalt — Leak!");
  assert(!drive.includes("yogurt"), "übersetzter Tipp im Drive-Inhalt — Leak!");
  // Gegenprobe: würde fälschlich die Anzeige-Sicht serialisiert, fiele es sofort auf.
  const wrong = toFileString({ updated: "2026-06-14T00:00:00Z", recipes: view });
  assert(wrong.includes("Sweet potato curry"), "Kontroll-Annahme falsch — Overlay übersetzt nicht");
});

test("Kanonik: store.js übergibt der Persistenz ausschließlich recipesDe (Verdrahtungs-Wächter)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "store.js"), "utf8");
  const args = [...src.matchAll(/saveCollection\(\s*([^)]*?)\s*\)/g)].map((m) => m[1].trim());
  assert(args.length > 0, "kein saveCollection-Aufruf gefunden — store.js refaktoriert?");
  for (const a of args) {
    assertEqual(a, "recipesDe"); // jeder Persistenz-Aufruf nutzt die deutsche Quelle
  }
  // Die lokalisierte Anzeige-Sicht darf NIE an die Persistenz gehen.
  assert(
    !/saveCollection\([^)]*state\.recipes/.test(src),
    "state.recipes (Anzeige-Sicht) wird persistiert — Kanonik verletzt!"
  );
});

/* ---------- T3 (DG-02 / AR-03, v2.15.1): Bearbeiten in nicht-deutscher UI ---------- */

// Was das Formular beim Speichern tut: alle Felder aus dem Formular auf das deutsche Objekt legen
// (form.js → updateRecipe(id, x => Object.assign(x, fields))). Das Formular wird mit `prefill` gefüllt.
const formSave = (canonical, prefill, change) => {
  const fields = { name: prefill.name, ingredients: prefill.ingredients, steps: prefill.steps, tips: prefill.tips, time: prefill.time, ...change };
  return Object.assign({ ...canonical }, fields);
};

test("Kanonik (T3): Bearbeiten in englischer UI ändert nur die Zeit — die Drive-Datei bleibt deutsch", () => {
  const map = buildLangMap(EN, DE);
  const view = localizeRecipes(DE, map)[0];
  // Früher: das Formular wurde mit der Anzeige (Englisch) gefüllt → englischer Text in Drive (Probe DG-02).
  const leaked = formSave(DE[0], view, { time: "40 Min" });
  assertEqual(leaked.name, "Sweet potato curry", "Kontroll-Annahme: so leckte es früher");
  // Jetzt: das Formular bekommt das deutsche Original (detail.js → getRecipeDe).
  const saved = formSave(DE[0], DE[0], { time: "40 Min" });
  const drive = toFileString({ updated: "2026-10-26T00:00:00Z", recipes: [saved] });
  assert(drive.includes("Süßkartoffel-Curry") && !drive.includes("Sweet potato"), "Drive bleibt deutsch");
  assertEqual(saved.time, "40 Min");
  // Unveränderte Felder zeigen weiter die Übersetzung.
  assertEqual(localizeRecipes([saved], map)[0].name, "Sweet potato curry");
});

test("Kanonik (T3): ein im Deutschen bearbeitetes Feld wird nicht mehr von der alten Übersetzung verdeckt", () => {
  const map = buildLangMap(EN, DE);
  const edited = { ...DE[0], steps: ["Reis aufsetzen.", "Alles 20 Min köcheln."] };
  const view = localizeRecipes([edited], map)[0];
  assertEqual(view.steps[1], "Alles 20 Min köcheln.", "die Änderung ist sichtbar");
  assertEqual(view.name, "Sweet potato curry", "andere Felder bleiben übersetzt");
});

test("Kanonik (T3): detail.js öffnet das Formular mit dem deutschen Original (Verdrahtungs-Wächter)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "features", "cookbook", "detail.js"), "utf8");
  const calls = [...src.matchAll(/openForm\(([^)]*\)?)\)/g)].map((m) => m[1]);
  assert(calls.length > 0, "kein openForm-Aufruf in detail.js gefunden");
  for (const c of calls) assert(/getRecipeDe\(/.test(c), `openForm ohne getRecipeDe: openForm(${c})`);
});
