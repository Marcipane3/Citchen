// filter.js — PURE Such-/Filterlogik des Kochbuchs (unit-getestet, kein DOM).
// v1-Parität: Suche über Name ODER Zutaten; Spezial-Chips ♥/⚡/✨/🍱/🆕;
// Kategorie-Chips nur für benutzte Kategorien. v2-Erweiterung: Zeit-Filter (≤30),
// Küche- und Saison-Filter über dieselbe Chip-Mechanik.

import { CATEGORIES } from "../../data/schema.js";
import { getTotalMinutes } from "../../data/derive.js";
import { t, tCat } from "../../i18n.js";

const SPECIAL_KEYS = {
  "__fav": "chip.fav", "__alltag": "chip.alltag", "__besonders": "chip.besonders",
  "__mealprep": "chip.mealprep", "__totry": "chip.totry", "__quick": "chip.quick",
};

/** Ist der Chip ein Spezial-Chip (♥/⚡/✨/🍱/🆕/≤30) statt einer Kategorie? */
export function isSpecialChip(chip) {
  return Object.prototype.hasOwnProperty.call(SPECIAL_KEYS, chip);
}

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

/** Kurz-Label eines Chips. Spezial-Chips i18n; Kategorie-Chips über tCat (Anzeige). */
export function chipLabel(chip) {
  if (chip === "Alle") return t("chip.all");
  if (SPECIAL_KEYS[chip]) return t(SPECIAL_KEYS[chip]);
  return tCat(chip).split(":")[0].split(" & ")[0].split(" ")[0];
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

/**
 * Auswahl normalisieren — akzeptiert sowohl die alte Einzel-Signatur
 * ({ chip, cuisine, season }) als auch die neue Mehrfach-Auswahl
 * ({ chips, cuisines, seasons }). Liefert Facetten-Gruppen für den Filter.
 *
 * Facetten-Modell (F2): innerhalb einer Facette ODER ("Fisch ODER Fleisch"),
 * über Facetten hinweg UND (mode "and") bzw. ODER (mode "or", reine Vereinigung).
 */
function normalizeSelection({ chip = "Alle", cuisine = null, season = null,
  chips = null, cuisines = null, seasons = null } = {}) {
  let chipSel = chips ? chips.slice() : (chip && chip !== "Alle" ? [chip] : []);
  chipSel = chipSel.filter((c) => c && c !== "Alle");
  const cuisineSel = cuisines ? cuisines.filter(Boolean) : (cuisine ? [cuisine] : []);
  const seasonSel = seasons ? seasons.filter(Boolean) : (season ? [season] : []);
  return {
    cats: chipSel.filter((c) => !isSpecialChip(c)),
    specials: chipSel.filter(isSpecialChip),
    cuisineSel,
    seasonSel,
  };
}

/**
 * Hauptfilter: query (Name/Zutat) immer als UND-Bedingung, dazu bis zu vier
 * Facetten (Kategorien / Spezial-Chips / Küche / Saison). `mode` bestimmt, wie
 * die *belegten* Facetten verknüpft werden: "and" (Default) oder "or".
 * Rückwärtskompatibel zur alten Einzel-Signatur.
 */
export function filterRecipes(recipes, opts = {}) {
  const { query = "", mode = "and" } = opts;
  const { cats, specials, cuisineSel, seasonSel } = normalizeSelection(opts);

  const facets = [];
  if (cats.length) facets.push((r) => cats.includes(r.category));
  if (specials.length) facets.push((r) => specials.some((s) => matchesChip(r, s)));
  if (cuisineSel.length) facets.push((r) => cuisineSel.includes(r.cuisine));
  if (seasonSel.length) facets.push((r) => seasonSel.includes(r.season));

  return recipes.filter((r) => {
    if (!matchesQuery(r, query)) return false;
    if (!facets.length) return true;
    return mode === "or" ? facets.some((f) => f(r)) : facets.every((f) => f(r));
  });
}

/** Wie viele Facetten-Werte sind aktiv? (für UI: Modus-Toggle/Reset einblenden). */
export function activeFilterCount(opts = {}) {
  const { cats, specials, cuisineSel, seasonSel } = normalizeSelection(opts);
  return cats.length + specials.length + cuisineSel.length + seasonSel.length;
}

/** Vorhandene Küchen/Saisons für Filter-Dropdowns. */
export function distinctValues(recipes, field) {
  return [...new Set(recipes.map((r) => r[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}
