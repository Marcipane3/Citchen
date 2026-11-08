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

// Persönliche Felder gehören dem Nutzer, nicht dem Rezeptinhalt: sie zählen beim Vergleich nicht mit.
const PERSONAL = new Set(["rating", "favorite", "cookedCount", "lastCooked", "feedback", "photos"]);

function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  }
  return v;
}

function contentKey(r) {
  const full = withDefaults(r), o = {}; // fehlende Optionalfelder gleich behandeln
  for (const k of Object.keys(full)) if (!PERSONAL.has(k)) o[k] = full[k];
  return JSON.stringify(stable(o));
}

/** Gleiche ID und gleicher Inhalt (ohne persönliche Felder + Fotos) → dasselbe Rezept. */
export function isSameRecipe(a, b) { return a.id === b.id && contentKey(a) === contentKey(b); }

/** Plant das Hinzufügen: → {toAdd, skipped, renamed}. Identische Rezepte werden übersprungen. Mutiert keine Eingabe. */
export function planImport(incoming, existing, now = Date.now) {
  const nextId = makeIdFactory([...existing, ...incoming].map((r) => r.id), now); // auch Import-IDs sperren
  const taken = new Set(existing.map((r) => r.id));
  const byId = new Map(existing.map((r) => [r.id, r]));
  const toAdd = [], renamed = [], skipped = [];
  for (const r of incoming) {
    if (byId.has(r.id) && isSameRecipe(r, byId.get(r.id))) {
      skipped.push({ id: r.id, name: r.name, reason: `${r.name}: bereits vorhanden` });
    } else if (taken.has(r.id)) {
      const id = nextId();
      renamed.push({ from: r.id, to: id, name: r.name });
      toAdd.push({ ...r, id });
      taken.add(id);
    } else {
      toAdd.push({ ...r });
      taken.add(r.id);
    }
  }
  return { toAdd, skipped, renamed };
}

/** Plan + Parse-Fehler → Zähler für das Ergebnis-Blatt (G2.3): {imported, skipped, reasons, renamed}. */
export function summarizeImport(plan, errors = []) {
  return {
    imported: plan.toAdd.length,
    skipped: errors.length + plan.skipped.length,
    reasons: errors, // Duplikate nur zählen: bis zu 105 Zeilen Liste wären Rauschen
    renamed: plan.renamed.length,
    duplicates: plan.skipped.length,
  };
}
