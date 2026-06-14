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
