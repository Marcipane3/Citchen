// schema.js — Schema-Konstanten, Validierung, ID-Vergabe.
// Vertrag: SCHEMA.md (v3, flach). Auf der Platte/Drive bleibt IMMER das flache
// v3-Format — v1 und der Chat-Claude-Workflow lesen dieselbe Datei.
// Strukturierte Sichten (tags/tipps/Mengen) liefert derive.js NUR im Speicher.

export const SCHEMA_VERSION = 3;

export const CATEGORIES = Object.freeze([
  "Frühstück & Brunch",
  "Schnelle Wochentags-Gerichte",
  "Pasta & Nudeln",
  "Reis & Getreide",
  "Suppen & Eintöpfe",
  "Salate & leichte Gerichte",
  "Wochenend-Gerichte",
  "Vegetarische Hauptgerichte",
  "Deutsche Hausmannskost",
  "Middle Eastern & Mediterran",
  "Asiatisch inspiriert",
  "Backen: Brot & Herzhaftes",
  "Backen: Süßes & Kuchen",
  "Muffins & Kleingebäck",
  "Sourdough & Sauerteig",
  "Grundrezepte & Basissoßen",
]);

export const EFFORT_VALUES = Object.freeze(["", "alltag", "besonders"]);
export const DIFFICULTY_VALUES = Object.freeze(["", "einfach", "mittel", "aufwändig"]);

const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isBool = (v) => typeof v === "boolean";
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);

/** Validiert ein einzelnes Rezept gegen Schema v3. Gibt {valid, errors[]} zurück. */
export function validateRecipe(r) {
  const errors = [];
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    return { valid: false, errors: ["Rezept ist kein Objekt"] };
  }
  if (!isStr(r.id) || !r.id.trim()) errors.push("id fehlt oder leer");
  if (!isStr(r.name) || !r.name.trim()) errors.push("name fehlt oder leer");
  if (!CATEGORIES.includes(r.category)) errors.push(`category ungültig: ${JSON.stringify(r.category)}`);

  // Optionale Felder: nur Typen prüfen, wenn vorhanden
  const optStr = ["time", "servings", "lastCooked", "image", "feedback", "tips", "cuisine", "season"];
  for (const f of optStr) {
    if (r[f] !== undefined && !isStr(r[f])) errors.push(`${f} muss String sein`);
  }
  if (r.rating !== undefined && (!isNum(r.rating) || r.rating < 0 || r.rating > 5)) {
    errors.push("rating muss Zahl 0–5 sein");
  }
  if (r.favorite !== undefined && !isBool(r.favorite)) errors.push("favorite muss Boolean sein");
  if (r.cookedCount !== undefined && (!isNum(r.cookedCount) || r.cookedCount < 0)) {
    errors.push("cookedCount muss Zahl ≥ 0 sein");
  }
  if (r.ingredients !== undefined && !isStrArr(r.ingredients)) errors.push("ingredients muss String-Array sein");
  if (r.steps !== undefined && !isStrArr(r.steps)) errors.push("steps muss String-Array sein");
  if (r.tags !== undefined && !isStrArr(r.tags)) errors.push("tags muss String-Array sein");
  if (r.effort !== undefined && !EFFORT_VALUES.includes(r.effort)) errors.push(`effort ungültig: ${JSON.stringify(r.effort)}`);
  if (r.difficulty !== undefined && !DIFFICULTY_VALUES.includes(r.difficulty)) errors.push(`difficulty ungültig: ${JSON.stringify(r.difficulty)}`);
  for (const f of ["prepTime", "cookTime", "totalTime"]) {
    if (r[f] !== undefined && (!isNum(r[f]) || r[f] < 0)) errors.push(`${f} muss Zahl ≥ 0 sein`);
  }
  for (const f of ["mealPrep", "toTry"]) {
    if (r[f] !== undefined && !isBool(r[f])) errors.push(`${f} muss Boolean sein`);
  }
  if (r.photos !== undefined) {
    const ok = Array.isArray(r.photos) &&
      r.photos.every((p) => p && typeof p === "object" && isStr(p.id));
    if (!ok) errors.push("photos muss Array von {id, added} sein");
  }
  return { valid: errors.length === 0, errors };
}

/** Validiert die ganze Sammlung {version, updated, recipes}. */
export function validateCollection(data) {
  const errors = [];
  if (!data || typeof data !== "object") return { valid: false, errors: ["Keine Daten"] };
  if (!isNum(data.version)) errors.push("version fehlt");
  if (!Array.isArray(data.recipes)) {
    errors.push("recipes fehlt");
    return { valid: false, errors };
  }
  const ids = new Set();
  data.recipes.forEach((r, i) => {
    const res = validateRecipe(r);
    if (!res.valid) errors.push(`Rezept[${i}] (${r && r.id}): ${res.errors.join("; ")}`);
    if (r && r.id) {
      if (ids.has(r.id)) errors.push(`Doppelte ID: ${r.id}`);
      ids.add(r.id);
    }
  });
  return { valid: errors.length === 0, errors };
}

/**
 * ID-Fabrik: "r" + Timestamp; bei Kollision (Batch / gleiche Millisekunde)
 * wird der Timestamp inkrementiert, bis die ID frei ist.
 */
export function makeIdFactory(existingIds = [], now = Date.now) {
  const used = new Set(existingIds);
  let last = 0;
  return function nextId() {
    let ts = Math.max(now(), last + 1);
    while (used.has("r" + ts)) ts++;
    last = ts;
    const id = "r" + ts;
    used.add(id);
    return id;
  };
}

/**
 * v1-Parität (normalize): fehlende optionale Felder mit Defaults füllen.
 * Verändert das Original nicht; gibt ein neues Objekt zurück.
 */
export function withDefaults(r) {
  const out = { ...r };
  if (typeof out.rating !== "number") out.rating = 0;
  if (!Array.isArray(out.photos)) out.photos = [];
  if (typeof out.favorite !== "boolean") out.favorite = false;
  if (typeof out.cookedCount !== "number") out.cookedCount = 0;
  if (typeof out.image !== "string") out.image = out.image || "";
  if (typeof out.feedback !== "string") out.feedback = "";
  return out;
}
