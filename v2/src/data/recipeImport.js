// recipeImport.js — reiner Import-Kern (G2.1): Datei parsen, Rezepte prüfen, gegen den
// Bestand planen. Kein DOM, kein Store. Dateiform = rezepte.json ({version, updated, recipes[]}).
// Eine Import-ID überschreibt NIE ein vorhandenes Rezept: Kollisionen bekommen eine frische ID.

import { validateRecipe, withDefaults, makeIdFactory } from "./schema.js";

/** Text → {recipes, errors}. Ungültige Rezepte werden mit Index + Grund gemeldet und übersprungen. */
export function parseImportFile(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { return { recipes: [], errors: ["Datei ist kein gültiges JSON"] }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { recipes: [], errors: ["Datei enthält kein Objekt"] };
  }
  if (typeof data.version !== "number" || !Number.isFinite(data.version)) {
    return { recipes: [], errors: ["version fehlt oder ist keine Zahl"] };
  }
  if (!Array.isArray(data.recipes)) return { recipes: [], errors: ["recipes fehlt oder ist kein Array"] };

  const recipes = [], errors = [];
  data.recipes.forEach((r, i) => {
    const res = validateRecipe(r);
    if (!res.valid) { errors.push(`Rezept[${i}]: ${res.errors.join("; ")}`); return; }
    const { photos, ...rest } = r; // Drive-Datei-IDs sind für ein anderes Konto wertlos (SCHEMA.md §Bilder)
    recipes.push(withDefaults(rest));
  });
  return { recipes, errors };
}

/** Plant das Hinzufügen: → {toAdd, skipped, renamed}. Mutiert keine Eingabe. */
export function planImport(incoming, existing, now = Date.now) {
  const nextId = makeIdFactory(existing.map((r) => r.id), now);
  const taken = new Set(existing.map((r) => r.id));
  const toAdd = [], renamed = [];
  for (const r of incoming) {
    if (taken.has(r.id)) {
      const id = nextId();
      renamed.push({ from: r.id, to: id, name: r.name });
      toAdd.push({ ...r, id });
      taken.add(id);
    } else {
      toAdd.push({ ...r });
      taken.add(r.id);
    }
  }
  return { toAdd, skipped: [], renamed };
}
