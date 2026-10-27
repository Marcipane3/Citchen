// filter.js — PURE Such-/Filter-/Sortierlogik des Kochbuchs (unit-getestet, kein DOM).
// v1-Parität: Suche über Name ODER Zutaten; Spezial-Chips ♥/⚡/✨/🍱/🆕;
// Kategorie-Chips nur für benutzte Kategorien. v2-Erweiterung: Zeit-Filter,
// Küche- und Saison-Filter über dieselbe Chip-Mechanik.
// v2.17 (F4): Suche mit mehreren Wörtern (alle müssen vorkommen) auch über Tipps, ohne Akzent-
// und ß-Unterschiede · Zeit-Chips ≤ 15 / ≤ 30 / ≤ 60 · sortRecipes (neueste, zuletzt/oft gekocht, ♥, A–Z).

import { CATEGORIES } from "../../data/schema.js";
import { getTotalMinutes } from "../../data/derive.js";
import { t, tCat, DE_MONTHS } from "../../i18n.js";

const SPECIAL_KEYS = {
  "__fav": "chip.fav", "__alltag": "chip.alltag", "__besonders": "chip.besonders",
  "__mealprep": "chip.mealprep", "__totry": "chip.totry",
  "__t15": "chip.t15", "__quick": "chip.quick", "__t60": "chip.t60",
};

/** Zeit-Chips → Höchstdauer in Minuten (`__quick` = ≤ 30 bleibt der alte Schlüssel). */
const TIME_CHIPS = { "__t15": 15, "__quick": 30, "__t60": 60 };
const withinMinutes = (r, max) => { const m = getTotalMinutes(r); return m !== null && m <= max; };

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
  // Ein Zeit-Chip erscheint nur, wenn er etwas anderes zeigt als der kürzere davor.
  let shown = -1;
  for (const [chip, max] of Object.entries(TIME_CHIPS)) {
    const n = recipes.filter((r) => withinMinutes(r, max)).length;
    if (n > 0 && n !== shown) { chips.push(chip); shown = n; }
  }
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
    case "__t15": case "__quick": case "__t60": return withinMinutes(r, TIME_CHIPS[chip]);
    default: return r.category === chip;
  }
}

/** Für die Suche vergleichbar machen: klein, ohne Akzente, ß → ss („Süß“ und „suss“ finden dasselbe). */
export function searchNorm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");
}

/** Jedes Wort der Suche muss in Name, Zutaten, Tipps oder Küche vorkommen (Reihenfolge egal). */
function matchesQuery(r, q) {
  const words = searchNorm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = searchNorm([r.name, ...(r.ingredients || []), r.tips, r.cuisine].filter(Boolean).join(" | "));
  return words.every((w) => hay.includes(w));
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

/* ---------- v2.17 (F4): Sortieren ---------- */

/** Sortier-Schlüssel in Menü-Reihenfolge; der erste ist der Standard beim ersten Öffnen. */
export const SORTS = Object.freeze(["newest", "lastCooked", "mostCooked", "fav", "az"]);

/**
 * „Zuletzt gekocht“ wird als Monat gespeichert („Mai 2026“, geschrieben von „Heute gekocht“).
 * → vergleichbare Zahl JJJJMM; auch „06/2026“ oder „2026-06“; unbekannt/leer → 0 (= nie gekocht).
 */
export function cookedMonthKey(v) {
  if (!v || typeof v !== "string") return 0;
  const iso = /(\d{4})-(\d{1,2})/.exec(v);
  if (iso) return +iso[1] * 100 + +iso[2];
  const num = /(\d{1,2})[./](\d{4})/.exec(v);
  if (num) return +num[2] * 100 + +num[1];
  const y = /(\d{4})/.exec(v);
  if (!y) return 0;
  const m = DE_MONTHS.findIndex((name) => v.includes(name));
  return +y[1] * 100 + (m >= 0 ? m + 1 : 0);
}

/** Anlegezeit aus der id („r“ + Millisekunden); Basis-ids wie „r01“ → 0. */
const idTime = (id) => { const m = /^r(\d{10,})$/.exec(id || ""); return m ? +m[1] : 0; };

/** Neue sortierte Liste (stabil; Gleichstand → neueste zuerst, dann bisherige Reihenfolge). */
export function sortRecipes(recipes, sort = "newest") {
  const pos = new Map(recipes.map((r, i) => [r.id, i]));
  const newest = (a, b) => idTime(b.id) - idTime(a.id) || pos.get(a.id) - pos.get(b.id);
  const cooked = (r) => cookedMonthKey(r.lastCooked);
  const count = (r) => r.cookedCount || 0;
  const cmp = {
    newest,
    lastCooked: (a, b) => cooked(b) - cooked(a) || count(b) - count(a) || newest(a, b),
    mostCooked: (a, b) => count(b) - count(a) || cooked(b) - cooked(a) || newest(a, b),
    fav: (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || newest(a, b),
    az: (a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }) || newest(a, b),
  }[sort] || newest;
  return [...recipes].sort(cmp);
}
