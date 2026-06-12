// Tests: data/baseLang.js — reine Übersetzungs-Overlay-Logik (B2).
// Vertrag: nur name/ingredients/steps/tips überlagern; category (DE-Enum),
// Nutzer-Status und alle übrigen Felder bleiben unangetastet; nichts wird mutiert.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  overlayTranslation, buildLangMap, localizeRecipes,
  countShoppingMarkers, checkTranslation,
} from "../src/data/baseLang.js";

const BASE = {
  id: "r01", name: "Süßkartoffel-Curry", category: "Vegetarische Hauptgerichte",
  time: "35 Min", servings: "~4", lastCooked: "Mai 2026",
  ingredients: ["2 Süßkartoffeln", "400g Kichererbsen 🛒", "Reis als Beilage"],
  steps: ["Reis aufsetzen.", "Alles köcheln."],
  tips: "Topping: Joghurt. Swap: Linsen statt Kichererbsen.",
  rating: 3, favorite: true, cookedCount: 3, photos: ["p1"], image: "", feedback: "lecker",
};
const TR = {
  name: "Sweet potato curry",
  ingredients: ["2 sweet potatoes", "400g chickpeas 🛒", "Rice on the side"],
  steps: ["Start the rice.", "Simmer everything."],
  tips: "Topping: yoghurt. Swap: lentils instead of chickpeas.",
};

test("overlayTranslation: überlagert die 4 Inhaltsfelder, lässt alles andere unberührt", () => {
  const out = overlayTranslation(BASE, TR);
  assertEqual(out.name, "Sweet potato curry");
  assertEqual(out.steps[0], "Start the rice.");
  assertEqual(out.tips, "Topping: yoghurt. Swap: lentils instead of chickpeas.");
  // Unangetastet:
  assertEqual(out.category, "Vegetarische Hauptgerichte");
  assertEqual(out.id, "r01");
  assertEqual(out.time, "35 Min");
  assertEqual(out.rating, 3);
  assertEqual(out.favorite, true);
  assertEqual(out.feedback, "lecker");
  // 🛒-Marker erhalten:
  assertEqual(countShoppingMarkers(out), 1);
  // Original nicht mutiert:
  assertEqual(BASE.name, "Süßkartoffel-Curry");
});

test("overlayTranslation: fehlende/leere Übersetzung → deutscher Wert bleibt", () => {
  const out = overlayTranslation(BASE, null);
  assertEqual(out.name, "Süßkartoffel-Curry");
  assertDeepEqual(out.steps, BASE.steps);
  const partial = overlayTranslation(BASE, { name: "X", ingredients: [], steps: [], tips: "" });
  assertEqual(partial.name, "X");
  assertDeepEqual(partial.ingredients, BASE.ingredients, "leere Arrays nicht übernehmen");
  assertEqual(partial.tips, BASE.tips, "leere tips nicht übernehmen");
});

test("localizeRecipes: Basis-Rezepte (id in Map) lokalisiert, Nutzer-Rezepte unberührt", () => {
  const userRecipe = { id: "u99", name: "Meine Pasta", category: "Pasta & Nudeln", ingredients: ["x"], steps: ["y"], tips: "" };
  const langSnap = [{ id: "r01", name: TR.name, ingredients: TR.ingredients, steps: TR.steps, tips: TR.tips, rating: 0, favorite: false }];
  const map = buildLangMap(langSnap);
  const out = localizeRecipes([BASE, userRecipe], map);
  // r01 lokalisiert, aber Nutzer-Status aus dem ORIGINAL (nicht aus dem Snapshot):
  assertEqual(out[0].name, "Sweet potato curry");
  assertEqual(out[0].rating, 3, "Nutzer-Rating darf nicht vom Snapshot überschrieben werden");
  assertEqual(out[0].favorite, true);
  assertEqual(out[0].category, "Vegetarische Hauptgerichte");
  // Nutzer-Rezept unverändert:
  assertEqual(out[1].name, "Meine Pasta");
  // Leere Map → unveränderte Liste (gleiche Referenz, kein Kopier-Overhead):
  const input = [BASE, userRecipe];
  assertEqual(localizeRecipes(input, buildLangMap([])), input);
});

test("checkTranslation: erkennt Längen- und Marker-Abweichungen, sauber bei Treffer", () => {
  assertEqual(checkTranslation(BASE, TR).length, 0, "saubere Übersetzung → keine Warnung");
  assert(checkTranslation(BASE, { ...TR, steps: ["nur einer"] }).some((w) => w.includes("Schritt")));
  assert(checkTranslation(BASE, { ...TR, ingredients: ["a", "b"] }).some((w) => w.includes("🛒") || w.includes("Zutaten")));
  assert(checkTranslation(BASE, { ...TR, name: "" }).some((w) => w.includes("name")));
  assert(checkTranslation(BASE, null).length > 0);
});
