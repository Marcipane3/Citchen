// parse.js — Robustes Parsen der Modell-Antworten (pur, unit-getestet).
// Modelle halten sich meist, aber nicht immer an "nur JSON" — wir extrahieren
// das erste JSON-Objekt und koerzieren das Rezept ins flache v3-Schema.

import { CATEGORIES, validateRecipe, EFFORT_VALUES, DIFFICULTY_VALUES, RECIPE_FIELDS, PERSONAL_FIELDS } from "../data/schema.js";

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

/**
 * G3.2 (#73): Inhaltsfelder, die der Assistent bei einer Änderung anfassen darf. id, origin, image
 * und die persönlichen Felder (PERSONAL_FIELDS) gehören nicht dazu: die kommen immer aus dem
 * gespeicherten Rezept. Abgeleitet aus RECIPE_FIELDS, damit ein neues Inhaltsfeld automatisch mitläuft.
 */
export const CONTENT_FIELDS = Object.freeze(RECIPE_FIELDS.filter((f) =>
  !["id", "origin", "image"].includes(f) && !PERSONAL_FIELDS.includes(f)));

/** Inhaltsfelder von `source` auf `target` übertragen (fehlt eins in source, fällt es in target weg). */
export function applyContentFields(target, source) {
  for (const f of CONTENT_FIELDS) {
    if (source[f] === undefined) delete target[f];
    else target[f] = Array.isArray(source[f]) ? source[f].slice() : source[f];
  }
  return target;
}

/**
 * Update-Antwort {"type":"update","id","recipe"} → das komplette geänderte Rezept.
 * `recipeDe` = das gespeicherte (deutsche) Rezept. Unbekannte/abweichende id → Fehler.
 * Nur Inhaltsfelder kommen vom Modell; was es weglässt, bleibt wie gespeichert. Alles andere
 * (id, origin, Herz, Bewertung, Notiz, Fotos, Koch-Daten, Bild, unbekannte Zusatzfelder) bleibt.
 */
export function coerceUpdate(json, recipeDe) {
  if (!recipeDe || !json || typeof json !== "object" || toStr(json.id) !== recipeDe.id) {
    return { recipe: null, errors: ["Unbekanntes Rezept: " + toStr(json && json.id)] };
  }
  const raw = json.recipe;
  const { recipe: content, errors } = coerceRecipe(raw);
  if (!content) return { recipe: null, errors };
  const given = (f) => raw[f] !== undefined || (f === "tips" && raw.tipps !== undefined);
  const out = { ...recipeDe };
  for (const f of CONTENT_FIELDS) {
    if (!given(f)) continue;
    if (content[f] === undefined) delete out[f];
    else out[f] = content[f];
  }
  const v = validateRecipe(out);
  return v.valid ? { recipe: out, errors: [] } : { recipe: null, errors: v.errors };
}

/** Mehrfachmengen-Differenz: Zeilen aus a, die in b (gleich oft) fehlen. */
function linesMissing(a, b) {
  const left = new Map();
  for (const x of b) left.set(x, (left.get(x) || 0) + 1);
  return a.filter((x) => {
    const n = left.get(x) || 0;
    if (n) { left.set(x, n - 1); return false; }
    return true;
  });
}

/**
 * Was eine Änderung an den Inhaltsfeldern bewirkt: [{field, before, after}] für einfache Felder,
 * [{field, added, removed}] für ingredients und steps (Zeilen). Leer = nichts geändert.
 */
export function recipeChanges(before, after) {
  const out = [];
  for (const f of CONTENT_FIELDS) {
    const a = before ? before[f] : undefined, b = after ? after[f] : undefined;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (f === "ingredients" || f === "steps") {
      const x = Array.isArray(a) ? a : [], y = Array.isArray(b) ? b : [];
      out.push({ field: f, added: linesMissing(y, x), removed: linesMissing(x, y) });
    } else {
      out.push({ field: f, before: a, after: b });
    }
  }
  return out;
}

/** Offener Chat, Änderungswunsch: {"type":"change","id"} → {id, intro}; nur bekannte ids. */
export function coerceChange(json, knownIds) {
  if (!json || !json.id || !knownIds.has(json.id)) return null;
  return { id: json.id, intro: toStr(json.intro) };
}
