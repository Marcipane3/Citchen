// nutrition.js — L2.1: kcal und Makros pro Portion aus items[] + Zutaten-Stamm (ADR-R1 §4, R1-Q5/Q6/Q7).
// Pur, ohne DOM. Wird beim Lesen berechnet, nichts wird gespeichert, das Rezept nie verändert.
import { gramsOf, buildIndex } from "./ingredientMatch.js";

const KEYS = ["kcal", "protein", "carbs", "fat"];
export const MATCHED_NONE_BELOW = 0.5;
export const MATCHED_EXACT_FROM = 0.8;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Portionen aus dem Freitext `servings` („~4“, „4“, „2–3“, „1 Zucchini, 2 Paprika“):
 * erste ganze Zahl, bei Bereichen die Untergrenze; nicht lesbar oder 0 → null.
 */
export function parseServings(str) {
  if (typeof str === "number") return Number.isInteger(str) && str > 0 ? str : null;
  if (typeof str !== "string") return null;
  const m = str.match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return n > 0 ? n : null;
}

const validPer100 = (p) => p && typeof p === "object" && KEYS.every((k) => typeof p[k] === "number" && Number.isFinite(p[k]));

/**
 * @param recipe Rezept mit `items[]` und `servings`
 * @param master Stamm-Datei ({ ingredients }), nackte Liste oder ein Index aus buildIndex
 * @returns {{ perServing: object|null, total: object|null, matched: number, approx: boolean, none: boolean } | null}
 *  null, wenn nichts zu sagen ist (keine items, kein Stamm, kein Gewicht).
 */
export function estimateNutrition(recipe, master) {
  if (!recipe || !Array.isArray(recipe.items) || !recipe.items.length || !master) return null;
  const index = master.byId instanceof Map ? master : buildIndex(master);
  if (!index.byId.size) return null;

  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let weighed = 0, known = 0;
  for (const item of recipe.items) {
    const g = gramsOf(item, index);
    if (typeof g !== "number" || !Number.isFinite(g) || g <= 0) continue; // ohne Menge: zählt nirgends
    weighed += g;
    const per100 = item.ing ? index.byId.get(item.ing)?.per100 : null;
    if (!validPer100(per100)) continue;
    known += g;
    for (const k of KEYS) sum[k] += (per100[k] * g) / 100;
  }
  if (weighed <= 0) return null;

  const matched = known / weighed;
  if (matched < MATCHED_NONE_BELOW) return { perServing: null, total: null, matched, approx: false, none: true };

  const total = Object.fromEntries(KEYS.map((k) => [k, round1(sum[k])]));
  const n = parseServings(recipe.servings);
  const perServing = n ? Object.fromEntries(KEYS.map((k) => [k, round1(sum[k] / n)])) : null;
  return { perServing, total, matched, approx: matched < MATCHED_EXACT_FROM, none: false };
}
