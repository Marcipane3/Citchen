// store.js — In-Memory-Zustand + Mutations-Aktionen. Einzige Schreibstelle
// für die Rezeptsammlung; persistiert über sync.js (IndexedDB sofort, Drive danach).

import * as sync from "./data/sync.js";
import { makeIdFactory, withDefaults, validateRecipe } from "./data/schema.js";

export const state = {
  recipes: [],
  meta: null,
  signedIn: false,
};

const listeners = new Set();
export function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) fn(state); }

export function setRecipes(recipes, meta) {
  state.recipes = recipes;
  if (meta) state.meta = meta;
  emit();
}

export function setSignedIn(v) { state.signedIn = v; emit(); }

export function getRecipe(id) { return state.recipes.find((r) => r.id === id); }

/** Persistiert den aktuellen Stand (IndexedDB sofort, Drive im Hintergrund). */
async function persist() {
  const meta = await sync.saveCollection(state.recipes);
  state.meta = { ...(state.meta || {}), ...meta };
}

/** Einzelnes Rezept ändern: fn(recipe) mutiert eine Kopie; danach speichern. */
export async function updateRecipe(id, fn) {
  const idx = state.recipes.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Rezept nicht gefunden: " + id);
  const copy = { ...state.recipes[idx] };
  fn(copy);
  const v = validateRecipe(copy);
  if (!v.valid) throw new Error("Ungültiges Rezept:\n" + v.errors.join("\n"));
  state.recipes = state.recipes.map((r, i) => (i === idx ? copy : r));
  emit();
  await persist();
  return copy;
}

/** Neues Rezept (vorn einfügen, v1-Verhalten). Gibt das Rezept mit ID zurück. */
export async function addRecipe(fields) {
  const nextId = makeIdFactory(state.recipes.map((r) => r.id));
  const recipe = withDefaults({ id: nextId(), lastCooked: "", ...fields });
  const v = validateRecipe(recipe);
  if (!v.valid) throw new Error("Ungültiges Rezept:\n" + v.errors.join("\n"));
  state.recipes = [recipe, ...state.recipes];
  emit();
  await persist();
  return recipe;
}

export async function deleteRecipe(id) {
  state.recipes = state.recipes.filter((r) => r.id !== id);
  emit();
  await persist();
}
