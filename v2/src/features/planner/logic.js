// logic.js — PURE Wochenplan-Generator (deterministisch via Seed, kein DOM/DB/KI).
// Regeln (03_FEATURES §3 / 02_DATA_SCHEMA §5):
//  - Mo–Fr: bevorzugt effort=alltag und ≤30 Min; Sa/So: bevorzugt effort=besonders.
//  - Rotation: avoidIds (kürzlich geplant/gekocht) werden gemieden.
//  - Abwechslung: nicht zweimal dieselbe Küche hintereinander, max. 2× pro Woche.
//  - Saison: passende Saison belohnt, falsche bestraft.
//  - Reste-Tage (optional): Mo→Di und Mi→Do als Leftover eines Meal-Prep-Gerichts.
//  - Locks: gesperrte Tage bleiben unangetastet.

import { getTotalMinutes } from "../../data/derive.js";

export const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Nur Hauptgericht-Kategorien landen im Abendessens-Plan. */
export const MEAL_CATEGORIES = [
  "Schnelle Wochentags-Gerichte", "Pasta & Nudeln", "Reis & Getreide",
  "Suppen & Eintöpfe", "Salate & leichte Gerichte", "Wochenend-Gerichte",
  "Vegetarische Hauptgerichte", "Deutsche Hausmannskost",
  "Middle Eastern & Mediterran", "Asiatisch inspiriert",
];

/** Deterministischer RNG (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jahreszeit zum Datum (für Saison-Scoring). */
export function seasonOf(date) {
  const m = (date instanceof Date ? date : new Date(date)).getMonth() + 1;
  if (m === 12 || m <= 2) return "Winter";
  if (m <= 5) return "Frühling";
  if (m <= 8) return "Sommer";
  return "Herbst";
}

function seasonMatches(recipeSeason, current) {
  if (!recipeSeason) return null; // keine Angabe → neutral
  const rs = recipeSeason.toLowerCase();
  if (rs.includes(current.toLowerCase())) return true;
  if (rs === "spätsommer" && (current === "Sommer" || current === "Herbst")) return true;
  return false;
}

/** Montag der Woche eines Datums (ISO-Datum als String). */
export function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mo=0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function score(r, { slot, prevCuisine, cuisineCount, currentSeason, avoidIds }) {
  let s = 0;
  const mins = getTotalMinutes(r);
  if (slot === "alltag") {
    if (r.effort === "alltag") s += 3;
    else if (r.effort === "besonders") s -= 2;
    if (mins !== null && mins <= 30) s += 2;
    else if (mins !== null && mins <= 40) s += 1;
    else if (mins !== null && mins > 60) s -= 2;
  } else {
    if (r.effort === "besonders") s += 3;
    if (mins !== null && mins >= 40) s += 1;
    if (r.toTry) s += 1; // Wochenende = Experimente
  }
  if (r.cuisine) {
    if (prevCuisine && r.cuisine === prevCuisine) s -= 2;
    if ((cuisineCount.get(r.cuisine) || 0) >= 2) s -= 1.5;
  }
  const sm = seasonMatches(r.season, currentSeason);
  if (sm === true) s += 1;
  else if (sm === false) s -= 2;
  if (avoidIds.has(r.id)) s -= 3;
  if (r.rating >= 4) s += 0.5;
  return s;
}

/**
 * Erzeugt einen 7-Tage-Plan.
 * options:
 *  - weekOf: ISO-Datum (Montag); default: aktueller Montag
 *  - avoidIds: Set kürzlich geplanter/gekochter Rezept-IDs (Rotation)
 *  - locked: { "Mo": dayEntry, ... } — bleibt unverändert
 *  - leftovers: true → Mo→Di & Mi→Do als Reste-Tage (Meal-Prep bevorzugt)
 *  - seed: Zahl für deterministische Auswahl
 * Rückgabe: { id, weekOf, days:[{day, recipeId, slot, leftoverOf?}], createdAt }
 */
export function generatePlan(recipes, {
  weekOf = mondayOf(new Date()),
  avoidIds = new Set(),
  locked = {},
  leftovers = false,
  seed = 1,
  now = () => new Date().toISOString(),
} = {}) {
  const rng = makeRng(seed);
  const pool = recipes.filter((r) => MEAL_CATEGORIES.includes(r.category));
  const currentSeason = seasonOf(weekOf);

  const usedIds = new Set(Object.values(locked).map((e) => e && e.recipeId).filter(Boolean));
  const cuisineCount = new Map();
  for (const e of Object.values(locked)) {
    if (!e || !e.recipeId) continue;
    const r = pool.find((x) => x.id === e.recipeId);
    if (r && r.cuisine) cuisineCount.set(r.cuisine, (cuisineCount.get(r.cuisine) || 0) + 1);
  }

  const days = [];
  let prevCuisine = null;
  let leftoverFrom = null; // {day, recipeId} wartet auf Reste-Tag

  for (let i = 0; i < 7; i++) {
    const day = DAYS[i];
    const slot = i < 5 ? "alltag" : "besonders";

    if (locked[day] && locked[day].recipeId) {
      const entry = { ...locked[day], day, locked: true };
      days.push(entry);
      const r = pool.find((x) => x.id === entry.recipeId);
      prevCuisine = r && r.cuisine ? r.cuisine : prevCuisine;
      leftoverFrom = null;
      continue;
    }

    // Reste-Tag: Di erbt Mo, Do erbt Mi (wenn Vortag Meal-Prep war)
    if (leftovers && leftoverFrom && (day === "Di" || day === "Do")) {
      days.push({ day, recipeId: leftoverFrom.recipeId, slot, leftoverOf: leftoverFrom.day });
      leftoverFrom = null;
      continue;
    }

    let candidates = pool.filter((r) => !usedIds.has(r.id) && !avoidIds.has(r.id));
    if (candidates.length < 3) candidates = pool.filter((r) => !usedIds.has(r.id)); // Rotation lockern
    if (!candidates.length) { days.push({ day, recipeId: null, slot }); continue; }

    // Reste-Modus: an Koch-Tagen Meal-Prep bevorzugen
    const wantMealPrep = leftovers && (day === "Mo" || day === "Mi");
    const scored = candidates
      .map((r) => ({ r, s: score(r, { slot, prevCuisine, cuisineCount, currentSeason, avoidIds }) + (wantMealPrep && r.mealPrep ? 2 : 0) }))
      .sort((a, b) => b.s - a.s);

    const top = scored.slice(0, Math.min(5, scored.length));
    const pick = top[Math.floor(rng() * top.length)].r;

    days.push({ day, recipeId: pick.id, slot });
    usedIds.add(pick.id);
    if (pick.cuisine) cuisineCount.set(pick.cuisine, (cuisineCount.get(pick.cuisine) || 0) + 1);
    prevCuisine = pick.cuisine || prevCuisine;
    if (wantMealPrep && pick.mealPrep) leftoverFrom = { day, recipeId: pick.id };
    else leftoverFrom = null;
  }

  return { id: "plan_" + weekOf, weekOf, days, createdAt: now() };
}

/** Rezept-IDs eines Plans (für Rotation/Einkauf; Reste-Tage nicht doppelt). */
export function planRecipeIds(plan, { unique = true } = {}) {
  const ids = (plan.days || []).filter((d) => d.recipeId && !d.leftoverOf).map((d) => d.recipeId);
  return unique ? [...new Set(ids)] : ids;
}
