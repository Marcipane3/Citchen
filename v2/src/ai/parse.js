// parse.js — Robustes Parsen der Modell-Antworten (pur, unit-getestet).
// Modelle halten sich meist, aber nicht immer an "nur JSON" — wir extrahieren
// das erste JSON-Objekt und koerzieren das Rezept ins flache v3-Schema.

import { CATEGORIES, validateRecipe, EFFORT_VALUES, DIFFICULTY_VALUES } from "../data/schema.js";

/** Erstes vollständiges JSON-Objekt aus Text ziehen (auch in ```-Zäunen). */
export function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

const toStr = (v) => (v === null || v === undefined) ? "" : String(v).trim();
const toNum = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
};
const toStrArr = (v) => Array.isArray(v) ? v.map(toStr).filter(Boolean) : [];

/** Strukturierte tipps{} (falls das Modell sie nested liefert) → Konventions-String. */
export function tippsToString(t) {
  if (!t || typeof t !== "object") return "";
  const parts = [];
  const toppings = toStrArr(t.toppings);
  const vars = toStrArr(t.variationen || t.variations);
  if (toppings.length) parts.push("Topping: " + toppings.join(" oder ") + ".");
  if (vars.length) parts.push("Swap: " + vars.join(" ") + ".");
  if (t.alltagsUpgrade) parts.push("Alltags-Upgrade: " + toStr(t.alltagsUpgrade) + ".");
  if (t.technik) parts.push("Technik: " + toStr(t.technik) + ".");
  return parts.join(" ").replace(/\.\.+/g, ".");
}

/**
 * Modell-JSON → flaches v3-Rezept (ohne id — vergibt addRecipe).
 * Gibt { recipe, errors } zurück; errors leer = validateRecipe-konform.
 */
export function coerceRecipe(raw) {
  if (!raw || typeof raw !== "object") return { recipe: null, errors: ["Kein Rezept-Objekt erhalten"] };
  const r = {};
  r.name = toStr(raw.name);
  r.category = toStr(raw.category);
  // Kategorie tolerant matchen (Groß/klein, Teilstring)
  if (!CATEGORIES.includes(r.category)) {
    const low = r.category.toLowerCase();
    const hit = CATEGORIES.find((c) => c.toLowerCase() === low) ||
      CATEGORIES.find((c) => low && c.toLowerCase().includes(low));
    if (hit) r.category = hit;
  }
  r.time = toStr(raw.time);
  r.servings = toStr(raw.servings) || "~4";
  r.effort = EFFORT_VALUES.includes(raw.effort) ? raw.effort : "";
  r.difficulty = DIFFICULTY_VALUES.includes(raw.difficulty) ? raw.difficulty : "";
  r.cuisine = toStr(raw.cuisine);
  r.season = toStr(raw.season);
  const pt = toNum(raw.prepTime), ct = toNum(raw.cookTime), tt = toNum(raw.totalTime);
  if (pt !== undefined) r.prepTime = pt;
  if (ct !== undefined) r.cookTime = ct;
  if (tt !== undefined) r.totalTime = tt;
  if (r.totalTime === undefined && r.prepTime !== undefined && r.cookTime !== undefined) {
    r.totalTime = r.prepTime + r.cookTime;
  }
  if (!r.time && r.totalTime) r.time = r.totalTime + " Min";
  r.mealPrep = raw.mealPrep === true;
  r.toTry = raw.toTry !== false; // KI-generiert = noch nie gekocht
  r.tags = toStrArr(raw.tags);
  r.ingredients = toStrArr(raw.ingredients);
  r.steps = toStrArr(raw.steps);
  r.tips = typeof raw.tips === "string" ? raw.tips.trim() : tippsToString(raw.tipps || raw.tips);

  // Validierung (mit Dummy-id — die echte vergibt addRecipe)
  const v = validateRecipe({ ...r, id: "r0" });
  const errors = [...v.errors];
  if (!r.ingredients.length) errors.push("Keine Zutaten");
  if (!r.steps.length) errors.push("Keine Zubereitungsschritte");
  return { recipe: errors.length ? null : r, errors };
}

/** Vorschlags-Antwort koerzieren: nur existierende ids behalten. */
export function coerceSuggestions(raw, knownIds) {
  if (!raw || !Array.isArray(raw.items)) return null;
  const items = raw.items.map((it) => ({
    id: it.id && knownIds.has(it.id) ? it.id : null,
    name: toStr(it.name),
    reason: toStr(it.reason),
  })).filter((it) => it.name);
  return items.length ? { intro: toStr(raw.intro), items } : null;
}

/** Plan-Antwort koerzieren: Map Tag→Rezept-ID, nur bekannte IDs. */
export function coercePlanDays(raw, knownIds) {
  if (!raw || !raw.days || typeof raw.days !== "object") return null;
  const out = {};
  for (const [day, id] of Object.entries(raw.days)) {
    if (["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].includes(day) && knownIds.has(id)) out[day] = id;
  }
  return Object.keys(out).length ? { days: out, note: toStr(raw.note) } : null;
}
