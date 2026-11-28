// nutritionGoal.js — M1 (#138): Ernährungsziel des Kochprofils. Rein, ohne DOM/IndexedDB.
// Bleibt auf diesem Gerät (kv "nutritionGoal"): nie in rezepte.json, einkaufsliste.json oder Freunde-Inbox.
// Bewusst kein Kalorien-Vorschlag und keine Diät-Wortwahl (Leitplanke Epic M).

export const GOAL_KEY = "nutritionGoal";
export const GOAL_PRESETS = ["balanced", "highProtein", "lowCarb", "lowFat", "keto", "calorieAware"];
export const DEFAULT_PRESET = "balanced";
export const KCAL_RANGE = [800, 6000];
export const PROTEIN_RANGE = [10, 400];

function intIn(v, [min, max]) {
  if (typeof v === "string") { if (!/^\s*\d+\s*$/.test(v)) return null; v = Number(v); }
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}

/** Beliebige Eingabe → { preset, dailyKcal, dailyProtein } (ungültig → balanced / null). */
export function cleanGoal(input) {
  const g = input && typeof input === "object" ? input : {};
  return {
    preset: GOAL_PRESETS.includes(g.preset) ? g.preset : DEFAULT_PRESET,
    dailyKcal: intIn(g.dailyKcal, KCAL_RANGE),
    dailyProtein: intIn(g.dailyProtein, PROTEIN_RANGE),
  };
}
