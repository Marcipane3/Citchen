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

test("Kanonik: store.js persistiert nur Änderungen am kanonischen Stand, nie die Anzeige-Sicht (Verdrahtungs-Wächter)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "store.js"), "utf8");
  // v2.15.1: Persistenz = sync.saveChange(change) — die Änderung läuft auf dem deutschen IndexedDB-Stand.
  assert(/sync\.saveChange\(change\)/.test(src), "persist() ruft nicht sync.saveChange(change) — store.js refaktoriert?");
  assert(!/saveCollection\(/.test(src), "alter Voll-Speicherpfad (saveCollection) wieder da");
  // Die lokalisierte Anzeige-Sicht darf NIE an die Persistenz gehen.
  assert(!/save\w*\([^)]*state\.recipes/.test(src), "state.recipes (Anzeige-Sicht) wird persistiert — Kanonik verletzt!");
  // Jede Mutation schreibt in recipesDe (kanonisch), nie in state.recipes.
  assert(!/state\.recipes\s*=(?!=)/.test(src.replace(/function recomputeView\(\)[^}]*}/, "")), "state.recipes wird außerhalb von recomputeView geschrieben");
});

test("Kanonik / T3 (DG-02): „Bearbeiten“ öffnet das deutsche Original, nie die übersetzte Anzeige", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "..", "src", "features", "cookbook", "detail.js"), "utf8");
  const calls = [...src.matchAll(/openForm\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert(calls.length > 0, "kein openForm-Aufruf in detail.js gefunden");
  for (const c of calls) assert(/getRecipeDe\(/.test(c), `openForm(${c}) — bearbeitet die Anzeige-Sicht statt getRecipeDe(id)`);
});

test("Kanonik / T3: so wie das Formular speichert, bleibt der Drive-Inhalt deutsch", () => {
  // Formular-Weg nachgestellt: Felder werden aus dem Rezept gelesen, das Formular bekommt
  // (seit v2.15.1) das deutsche Original; ein geänderter Wert wird per Object.assign übernommen.
  const original = DE[0];
  const fields = { name: original.name, ingredients: original.ingredients, steps: original.steps, tips: original.tips, time: "40 Min" };
  const saved = Object.assign({ ...original }, fields);
  const drive = toFileString({ updated: "2026-10-19T00:00:00Z", recipes: [saved] });
  assert(drive.includes("Süßkartoffel-Curry") && drive.includes("40 Min"), "Änderung + deutscher Inhalt");
  assert(!drive.includes("Sweet potato"), "Übersetzung im Drive-Inhalt — Leak!");
  // Gegenprobe: hätte das Formular die Anzeige-Sicht bekommen, stünde Englisch in der Datei.
  const view = localizeRecipes(DE, buildLangMap(EN))[0];
  const leaked = Object.assign({ ...original }, { name: view.name, steps: view.steps, time: "40 Min" });
  assert(toFileString({ recipes: [leaked] }).includes("Sweet potato"), "Kontroll-Annahme falsch");
});

