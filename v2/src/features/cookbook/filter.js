// filter.js — PURE Such-/Filterlogik des Kochbuchs (unit-getestet, kein DOM).
// v1-Parität: Suche über Name ODER Zutaten; Spezial-Chips ♥/⚡/✨/🍱/🆕;
// Kategorie-Chips nur für benutzte Kategorien. v2-Erweiterung: Zeit-Filter (≤30),
// Küche- und Saison-Filter über dieselbe Chip-Mechanik.

import { CATEGORIES } from "../../data/schema.js";
import { getTotalMinutes } from "../../data/derive.js";

export const SPECIAL_LABELS = {
  "__fav": "♥ Favoriten",
  "__alltag": "⚡ Alltag",
  "__besonders": "✨ Besonders",
  "__mealprep": "🍱 Meal-Prep",
  "__totry": "🆕 Probieren",
  "__quick": "⏱ ≤ 30 Min",
};

/** Chip-Liste abhängig von den Daten (v1-Verhalten: nur, was vorkommt). */
export function availableChips(recipes) {
  const chips = ["Alle", "__fav"];
  if (recipes.some((r) => r.effort === "alltag")) chips.push("__alltag");
  if (recipes.some((r) => r.effort === "besonders")) chips.push("__besonders");
  if (recipes.some((r) => r.mealPrep)) chips.push("__mealprep");
  if (recipes.some((r) => r.toTry)) chips.push("__totry");
  if (recipes.some((r) => { const m = getTotalMinutes(r); return m !== null && m <= 30; })) chips.push("__quick");
  for (const c of CATEGORIES) if (recipes.some((r) => r.category === c)) chips.push(c);
  return chips;
}

/** Kurz-Label eines Chips (v1: erstes Wort der Kategorie). */
export function chipLabel(chip) {
  if (chip === "Alle") return "Alle";
  if (SPECIAL_LABELS[chip]) return SPECIAL_LABELS[chip];
  return chip.split(":")[0].split(" & ")[0].split(" ")[0];
}

function matchesChip(r, chip) {
  switch (chip) {
    case "Alle": return true;
    case "__fav": return !!r.favorite;
    case "__alltag": return r.effort === "alltag";
    case "__besonders": return r.effort === "besonders";
    case "__mealprep": return !!r.mealPrep;
    case "__totry": return !!r.toTry;
    case "__quick": { const m = getTotalMinutes(r); return m !== null && m <= 30; }
    default: return r.category === chip;
  }
}

function matchesQuery(r, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  if ((r.name || "").toLowerCase().includes(needle)) return true;
  return (r.ingredients || []).join(" ").toLowerCase().includes(needle);
}

/** Erweiterte Filter (v2): cuisine / season — null = aus. */
function matchesExtra(r, { cuisine, season }) {
  if (cuisine && r.cuisine !== cuisine) return false;
  if (season && r.season !== season) return false;
  return true;
}

/**
 * Hauptfilter: query (Name/Zutat) + chip (Kategorie/Spezial) + optionale Extras.
 */
export function filterRecipes(recipes, { query = "", chip = "Alle", cuisine = null, season = null } = {}) {
  return recipes.filter((r) => matchesChip(r, chip) && matchesQuery(r, query) && matchesExtra(r, { cuisine, season }));
}

/** Vorhandene Küchen/Saisons für Filter-Dropdowns. */
export function distinctValues(recipes, field) {
  return [...new Set(recipes.map((r) => r[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}
