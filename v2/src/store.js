// store.js — In-Memory-Zustand + Mutations-Aktionen.
//
// SPRACH-ARCHITEKTUR (B2/B3): `state.recipes` ist die ANZEIGE-Sicht — ggf. mit
// übersetzten Basis-Rezepten überlagert. Alle Views lesen diese Sicht. Die
// KANONISCHE deutsche Sammlung lebt privat in `recipesDe` und ist die EINZIGE
// Quelle für Persistenz (IndexedDB/Drive) und Mutationen. Übersetzter Inhalt wird
// damit NIE nach Drive geschrieben (Drive-Datei bleibt deutsch, geteilt mit v1 +
// Projekt-Claude). Sprachneutrale Mutationen (favorite/rating/cookedCount/feedback)
// treffen das deutsche Objekt und überleben das Overlay sauber.

import * as sync from "./data/sync.js";
import { makeIdFactory, withDefaults, validateRecipe } from "./data/schema.js";
import { buildLangMap, localizeRecipes } from "./data/baseLang.js";

export const state = {
  recipes: [],      // Anzeige-Sicht (lokalisiert) — Views lesen NUR das
  meta: null,
  signedIn: false,
};

let recipesDe = [];        // kanonisch deutsch (Persistenz + Mutationen)
let langMap = new Map();   // id → übersetzte Inhaltsfelder (leer = Deutsch)

const listeners = new Set();
export function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) fn(state); }

function recomputeView() { state.recipes = localizeRecipes(recipesDe, langMap); }

export function setRecipes(recipes, meta) {
  recipesDe = recipes;
  if (meta) state.meta = meta;
  recomputeView();
  emit();
}

/**
 * Sprach-Overlay setzen/wechseln: lädt den gebündelten Sprach-Snapshot, baut die
 * id→Übersetzung-Map und rendert die Anzeige-Sicht neu. Reine Anzeige — schreibt
 * NICHTS nach IndexedDB/Drive. de/fehlende Datei → deutsche Sicht.
 */
export async function applyLanguageOverlay(lang) {
  const langRecipes = await sync.fetchLangRecipes(lang);
  langMap = langRecipes ? buildLangMap(langRecipes, await sync.fetchBaseRecipesDe()) : new Map();
  recomputeView();
  emit();
}

export function setSignedIn(v) { state.signedIn = v; emit(); }

// Vom Abgleich zusammengeführter Drive-Inhalt (Projekt-Claude, v1, 2. Gerät) → sofort übernehmen.
// Kommt synchron, bevor die nächste Eingabe möglich ist — spätere Änderungen bauen darauf auf.
sync.onRemoteApplied((recipes) => setRecipes(recipes));

/** Anzeige-Rezept (lokalisiert) per id. */
export function getRecipe(id) { return state.recipes.find((r) => r.id === id); }

/**
 * KANONISCH DEUTSCHES Rezept per id. Für Logik, die gegen deutsche Konstanten
 * matcht (Einkaufs-Katalog/Gänge/Icons, Vorrats-Abgleich) — die Zutaten-Texte
 * müssen deutsch sein, sonst greift das Matching nicht. Anzeige bleibt lokalisiert.
 */
export function getRecipeDe(id) { return recipesDe.find((r) => r.id === id); }

/** Zeigt die aktuelle Sprache für dieses Rezept eine Übersetzung (Basis-Rezept, UI nicht Deutsch)? */
export function isTranslated(id) { return langMap.has(id); }

/** Persistiert die KANONISCH DEUTSCHE Sammlung (IndexedDB sofort, Drive danach). */
async function persist() {
  const meta = await sync.saveCollection(recipesDe);
  state.meta = { ...(state.meta || {}), ...meta };
}

/**
 * Einzelnes Rezept ändern: fn(recipe) mutiert eine Kopie des DEUTSCHEN Objekts;
 * danach speichern. Inhaltsfelder hier nur mit deutschem Text füllen — das Formular
 * öffnet darum zum Bearbeiten das deutsche Original (getRecipeDe), nie die Anzeige-Sicht (T3).
 */
export async function updateRecipe(id, fn) {
  const idx = recipesDe.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Rezept nicht gefunden: " + id);
  const copy = { ...recipesDe[idx] };
  fn(copy);
  const v = validateRecipe(copy);
  if (!v.valid) throw new Error("Ungültiges Rezept:\n" + v.errors.join("\n"));
  recipesDe = recipesDe.map((r, i) => (i === idx ? copy : r));
  recomputeView();
  emit();
  await persist();
  return getRecipe(id) || copy;
}

/** Neues Rezept (vorn einfügen, v1-Verhalten). Gibt das Rezept mit ID zurück. */
export async function addRecipe(fields) {
  const nextId = makeIdFactory(recipesDe.map((r) => r.id));
  const recipe = withDefaults({ id: nextId(), lastCooked: "", ...fields });
  const v = validateRecipe(recipe);
  if (!v.valid) throw new Error("Ungültiges Rezept:\n" + v.errors.join("\n"));
  recipesDe = [recipe, ...recipesDe];
  recomputeView();
  emit();
  await persist();
  return recipe;
}

export async function deleteRecipe(id) {
  recipesDe = recipesDe.filter((r) => r.id !== id);
  recomputeView();
  emit();
  await persist();
}
