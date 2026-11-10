// recipeImport.js — reiner Import-Kern (G2.1): Datei parsen, Rezepte prüfen, gegen den
// Bestand planen. Kein DOM, kein Store. Dateiform = rezepte.json ({version, updated, recipes[]}).
// Eine Import-ID überschreibt NIE ein vorhandenes Rezept: Kollisionen bekommen eine frische ID.

import { validateRecipe, withDefaults, makeIdFactory, envelopeProblem, RECIPE_FIELDS, PERSONAL_FIELDS } from "./schema.js";
import { sameContent } from "./recipeMerge.js";

// Eine Import-Datei ist ein FREMDER Kanal (#36): Grenzen weit über echten Rezepten (längster Name im
// Grundbestand: 52 Zeichen, längster Schritt: 208, ganzes Kochbuch: 147 KB), aber unter Missbrauch.
export const IMPORT_LIMITS = Object.freeze({ fileChars: 2_000_000, name: 200, line: 500, lines: 200, tips: 5000, image: 2000 });

const PERSONAL = new Set(PERSONAL_FIELDS);
const KEPT_FIELDS = RECIPE_FIELDS.filter((f) => !PERSONAL.has(f)); // unbekannte Felder fallen weg

function limitProblems(r) {
  const L = IMPORT_LIMITS, out = [];
  if (r.name.length > L.name) out.push(`name länger als ${L.name} Zeichen`);
  for (const f of ["time", "servings", "cuisine", "season"]) {
    if (typeof r[f] === "string" && r[f].length > L.line) out.push(`${f} länger als ${L.line} Zeichen`);
  }
  if (typeof r.tips === "string" && r.tips.length > L.tips) out.push(`tips länger als ${L.tips} Zeichen`);
  if (typeof r.image === "string" && r.image.length > L.image) out.push(`image länger als ${L.image} Zeichen`);
  for (const f of ["ingredients", "steps", "tags"]) {
    if (!Array.isArray(r[f])) continue;
    if (r[f].length > L.lines) out.push(`${f} hat mehr als ${L.lines} Zeilen`);
    else if (r[f].some((line) => line.length > L.line)) out.push(`${f}: Zeile länger als ${L.line} Zeichen`);
  }
  return out;
}

/** Nur https-Bilder: ein http-Bild wird bei jedem Anzeigen unverschlüsselt geladen, javascript:/data: gehören nie in ein Rezept. */
function isHttpsUrl(v) {
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}

/**
 * Text → {recipes, errors, notes}. Ungültige oder übergroße Rezepte werden mit Index + Grund gemeldet
 * (errors) und übersprungen; `notes` nennt, was an einem übernommenen Rezept entfernt wurde.
 * Übernommen werden nur Inhaltsfelder des Vertrags — persönliche und unbekannte Felder fallen weg.
 */
export function parseImportFile(text) {
  const none = (msg) => ({ recipes: [], errors: [msg], notes: [] });
  if (typeof text !== "string") return none("Datei ist kein Text");
  if (text.length > IMPORT_LIMITS.fileChars) return none("Datei ist größer als 2 MB");
  let data;
  try { data = JSON.parse(text); }
  catch { return none("Datei ist kein gültiges JSON"); }
  const problem = envelopeProblem(data);
  if (problem === "notObject") return none("Datei enthält kein Objekt");
  if (typeof data.version !== "number" || !Number.isFinite(data.version)) return none("version fehlt oder ist keine Zahl");
  if (problem === "noRecipes") return none("recipes fehlt oder ist kein Array");
  if (problem === "newerFormat") return none(`Datei stammt aus einer neueren App-Version (Format ${data.version})`);

  const recipes = [], errors = [], notes = [];
  data.recipes.forEach((r, i) => {
    const res = validateRecipe(r);
    const problems = res.valid ? limitProblems(r) : res.errors;
    if (problems.length) { errors.push(`Rezept[${i}]: ${problems.join("; ")}`); return; }
    const clean = {};
    for (const f of KEPT_FIELDS) if (r[f] !== undefined) clean[f] = r[f];
    clean.id = r.id.trim(); // „ r01 “ ist dasselbe Rezept wie „r01“ (#50)
    if (clean.image && !isHttpsUrl(clean.image)) {
      clean.image = "";
      notes.push(`Rezept[${i}] „${r.name}“: Bild-Adresse entfernt (nur https erlaubt)`);
    }
    recipes.push(withDefaults(clean));
  });
  return { recipes, errors, notes };
}

/** Gleiche ID und gleicher Inhalt (ohne persönliche Felder + Fotos) → dasselbe Rezept. */
export function isSameRecipe(a, b) { return a.id === b.id && sameContent(a, b); }

/** Plant das Hinzufügen: → {toAdd, skipped, renamed}. Identische Rezepte werden übersprungen. Mutiert keine Eingabe. */
export function planImport(incoming, existing, now = Date.now) {
  const nextId = makeIdFactory([...existing, ...incoming].map((r) => r.id), now); // auch Import-IDs sperren
  const taken = new Set(existing.map((r) => r.id));
  const byId = new Map(existing.map((r) => [r.id, r]));
  const toAdd = [], renamed = [], skipped = [];
  for (const r of incoming) {
    if (byId.has(r.id) && isSameRecipe(r, byId.get(r.id))) {
      skipped.push({ id: r.id, name: r.name, reason: `${r.name}: bereits vorhanden` });
    } else if (taken.has(r.id)) {
      const id = nextId();
      renamed.push({ from: r.id, to: id, name: r.name });
      toAdd.push({ ...r, id });
      taken.add(id);
    } else {
      toAdd.push({ ...r });
      taken.add(r.id);
    }
  }
  return { toAdd, skipped, renamed };
}

/** Plan + Parse-Fehler (+ Hinweise) → Zähler für das Ergebnis-Blatt (G2.3): {imported, skipped, reasons, renamed}. */
export function summarizeImport(plan, errors = [], notes = []) {
  return {
    imported: plan.toAdd.length,
    skipped: errors.length + plan.skipped.length, // Hinweise zählen nicht: das Rezept wurde übernommen
    reasons: [...errors, ...notes], // Duplikate nur zählen: bis zu 105 Zeilen Liste wären Rauschen
    renamed: plan.renamed.length,
    duplicates: plan.skipped.length,
  };
}
