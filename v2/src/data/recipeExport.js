// recipeExport.js — reine Builder für die Export-Datei (G2.2). Gleiche Form wie rezepte.json,
// damit der Import (recipeImport.js) sie direkt liest. Persönliche Felder bleiben draußen (G2-Q1).

import { SCHEMA_VERSION } from "./schema.js";

const PERSONAL = ["photos", "feedback", "favorite", "rating", "cookedCount", "lastCooked"];

/** {version, updated, recipes} ohne persönliche Felder; Eingabe wird nicht verändert. */
export function buildExportFile(recipes, now = new Date()) {
  const out = (recipes || []).map((r) => {
    const copy = JSON.parse(JSON.stringify(r));
    for (const f of PERSONAL) delete copy[f];
    return copy;
  });
  return { version: SCHEMA_VERSION, updated: new Date(now).toISOString(), recipes: out };
}

/** Dateiname: ein Rezept → <name>.citchen.json, sonst citchen-rezepte-YYYY-MM-DD.json. */
export function exportFileName(recipes, date = new Date()) {
  if (recipes && recipes.length === 1) {
    const base = String(recipes[0].name || "")
      .replace(/[\/\\:*?"<>|]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
    return `${base || "rezept"}.citchen.json`;
  }
  return `citchen-rezepte-${new Date(date).toISOString().slice(0, 10)}.json`;
}
