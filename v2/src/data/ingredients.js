// ingredients.js — R2.1: Prüfung des Zutaten-Stamms (v2/data/ingredients.json, ADR-R1 §3).
// Pur, unit-testbar. Die App lädt die Datei noch nicht; Matcher (R3.1) und UI kommen später.
import { UNITS } from "./units.js";

const LANGS = ["de", "en", "es", "da"];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Neutrale Gang-Schlüssel → Gang in catalog.js (bis der Stamm den Katalog ablöst, D2). */
export const AISLES = {
  vegetables: "Gemüse", fruit: "Obst", dairy: "Milch & Eier", cheese: "Käse", "meat-fish": "Fleisch & Fisch",
  vegetarian: "Vegetarisch", grains: "Nudeln, Reis & Co.", pantry: "Konserven & Vorrat", spices: "Gewürze & Öl",
  bakery: "Brot & Backwaren", frozen: "Tiefkühl", drinks: "Getränke", snacks: "Snacks & Süßes",
  household: "Haushalt & Drogerie",
};

/** Vergleichsform eines Namens: Groß-/Kleinschreibung, Akzente und Leerraum egal. */
export function foldName(s) {
  return String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const filled = (s) => typeof s === "string" && s.trim().length > 0;

/**
 * Prüft einen Zutaten-Stamm. Sammelt ALLE Verstöße; jeder Fehler beginnt mit dem Regelnamen:
 * id-format · id-unique · names · base · shop · units-key · units-value · per100 · name-unique.
 * Ein Name/Alias gehört je SPRACHE zu genau einer Zutat (de „Paprika“ ist die Schote, en „paprika“
 * das Pulver — beides richtig; der Matcher kennt die Sprache der Zeile).
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateMaster(json) {
  const errors = [];
  if (!json || !Array.isArray(json.ingredients)) return { valid: false, errors: ["format: ingredients muss eine Liste sein"] };

  const ids = new Set();
  const owner = new Map(); // "<lang>|<gefalteter Name>" → id
  json.ingredients.forEach((r, i) => {
    if (!r || typeof r !== "object") { errors.push(`format: Eintrag ${i} ist kein Objekt`); return; }
    const at = filled(r.id) ? r.id : `#${i}`;

    if (!filled(r.id) || !ID_RE.test(r.id)) errors.push(`id-format: ${at}`);
    else if (ids.has(r.id)) errors.push(`id-unique: ${at}`);
    else ids.add(r.id);

    for (const l of LANGS) if (!filled(r.names?.[l])) errors.push(`names: ${at} — names.${l} fehlt`);
    if (r.base !== "g" && r.base !== "ml") errors.push(`base: ${at} — „${r.base}“`);
    if (!Object.hasOwn(UNITS, r.shop ?? "")) errors.push(`shop: ${at} — „${r.shop}“`);

    for (const [u, v] of Object.entries(r.units || {})) {
      if (!Object.hasOwn(UNITS, u)) errors.push(`units-key: ${at} — „${u}“`);
      if (typeof v !== "number" || !(v > 0)) errors.push(`units-value: ${at} — ${u}: ${v}`);
    }
    for (const [k, v] of Object.entries(r.per100 || {})) {
      if (typeof v !== "number" || !(v >= 0)) errors.push(`per100: ${at} — ${k}: ${v}`);
    }

    for (const l of LANGS) {
      const forms = [r.names?.[l], r.plural?.[l], ...(Array.isArray(r.aliases?.[l]) ? r.aliases[l] : [])];
      for (const key of new Set(forms.filter(filled).map((n) => `${l}|${foldName(n)}`))) {
        if (owner.has(key) && owner.get(key) !== at) errors.push(`name-unique: „${key.slice(3)}“ (${l}) bei ${owner.get(key)} und ${at}`);
        else owner.set(key, at);
      }
    }
  });
  return { valid: errors.length === 0, errors };
}
