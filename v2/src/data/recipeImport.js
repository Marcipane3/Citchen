// recipeImport.js — reiner Import-Kern (G2.1): Datei parsen, Rezepte prüfen, gegen den
// Bestand planen. Kein DOM, kein Store. Dateiform = rezepte.json ({version, updated, recipes[]}).
// Eine Import-ID überschreibt NIE ein vorhandenes Rezept: Kollisionen bekommen eine frische ID.

import { validateRecipe, withDefaults, makeIdFactory, envelopeProblem, withoutBadItems, RECIPE_FIELDS, PERSONAL_FIELDS, ORIGIN_USER } from "./schema.js";
import { sameContent } from "./recipeMerge.js";

// Eine Import-Datei ist ein FREMDER Kanal (#36): Grenzen weit über echten Rezepten (längster Name im
// Grundbestand: 52 Zeichen, längster Schritt: 208, ganzes Kochbuch: 147 KB), aber unter Missbrauch.
export const IMPORT_LIMITS = Object.freeze({ fileChars: 2_000_000, name: 200, line: 500, lines: 200, tips: 5000, image: 2000 });

const PERSONAL = new Set(PERSONAL_FIELDS);
const KEPT_FIELDS = RECIPE_FIELDS.filter((f) => !PERSONAL.has(f)); // unbekannte Felder fallen weg

/** Felder, die über den Grenzen liegen (technische Namen; die App-Sprache formuliert den Satz). */
function limitProblems(r) {
  const L = IMPORT_LIMITS, out = [];
  if (r.name.length > L.name) out.push("name");
  for (const f of ["time", "servings", "cuisine", "season"]) {
    if (typeof r[f] === "string" && r[f].length > L.line) out.push(f);
  }
  if (typeof r.tips === "string" && r.tips.length > L.tips) out.push("tips");
  if (typeof r.image === "string" && r.image.length > L.image) out.push("image");
  for (const f of ["ingredients", "steps", "tags"]) {
    if (!Array.isArray(r[f])) continue;
    if (r[f].length > L.lines || r[f].some((line) => line.length > L.line)) out.push(f);
  }
  return out;
}

/** Feldname aus einer validateRecipe-Meldung ("category ungültig: …" → "category"); leer, wenn kein Feld. */
function fieldOf(message) {
  const m = /^([A-Za-z]+) (?:fehlt|muss|ungültig)/.exec(message);
  return m ? m[1] : null;
}

/** Nur https-Bilder: ein http-Bild wird bei jedem Anzeigen unverschlüsselt geladen, javascript:/data: gehören nie in ein Rezept. */
function isHttpsUrl(v) {
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}

/** Die eine Bereinigung für Import UND Vergleich: nur Vertragsfelder, id getrimmt, nur https-Bild, Defaults. Mutiert nichts. */
function cleanRecipe(r) {
  const clean = {};
  for (const f of KEPT_FIELDS) if (r[f] !== undefined) clean[f] = r[f];
  clean.id = r.id.trim(); // „ r01 “ ist dasselbe Rezept wie „r01“ (#50)
  const imageRemoved = !!clean.image && !isHttpsUrl(clean.image);
  if (imageRemoved) clean.image = "";
  return { clean: withDefaults(clean), imageRemoved };
}

/**
 * Text → {recipes, errors, notes}. Ungültige oder übergroße Rezepte werden mit Nummer + Feldnamen gemeldet
 * (errors) und übersprungen; `notes` nennt, was an einem übernommenen Rezept entfernt wurde.
 * Probleme sind STRUKTURIERT ({code, …}), nie Sätze: die Oberfläche übersetzt sie (#84).
 *   Datei:  {code: "notText"|"tooLarge"|"notJson"|"notObject"|"noVersion"|"noRecipes"|"newerFormat", version?}
 *   Rezept: {code: "recipeInvalid", index (0-basiert), name, fields[]} · {code: "recipeNotObject", index}
 *   Hinweis: {code: "imageRemoved", index, name}
 * Eine gültige Datei mit `recipes: []` ist kein Fehler: errors bleibt leer.
 * Übernommen werden nur Inhaltsfelder des Vertrags — persönliche und unbekannte Felder fallen weg.
 */
export function parseImportFile(text) {
  const none = (code, extra = {}) => ({ recipes: [], errors: [{ code, ...extra }], notes: [] });
  if (typeof text !== "string") return none("notText");
  if (text.length > IMPORT_LIMITS.fileChars) return none("tooLarge");
  let data;
  try { data = JSON.parse(text); }
  catch { return none("notJson"); }
  const problem = envelopeProblem(data);
  if (problem === "notObject") return none("notObject");
  if (typeof data.version !== "number" || !Number.isFinite(data.version)) return none("noVersion");
  if (problem === "noRecipes") return none("noRecipes");
  if (problem === "newerFormat") return none("newerFormat", { version: data.version });

  const recipes = [], errors = [], notes = [];
  data.recipes.forEach((raw, i) => {
    const r = withoutBadItems(raw); // items ist abgeleitet: ein kaputter Wert verwirft nicht das Rezept
    const res = validateRecipe(r);
    if (!r || typeof r !== "object" || Array.isArray(r)) { errors.push({ code: "recipeNotObject", index: i }); return; }
    const fields = res.valid ? limitProblems(r) : [...new Set(res.errors.map(fieldOf).filter(Boolean))];
    if (!res.valid || fields.length) {
      errors.push({ code: "recipeInvalid", index: i, name: typeof r.name === "string" ? r.name : "", fields });
      return;
    }
    const { clean, imageRemoved } = cleanRecipe(r);
    if (imageRemoved) notes.push({ code: "imageRemoved", index: i, name: r.name });
    recipes.push(clean);
  });
  return { recipes, errors, notes };
}

/** Gleiche ID und gleicher Inhalt (ohne persönliche Felder, Fotos und `origin`) → dasselbe Rezept. */
export function isSameRecipe(a, b) {
  // sameContent ignoriert origin (#72): sonst käme dieselbe Datei beim zweiten Mal als „anderer Inhalt“ an.
  return a.id === b.id && sameContent(a, b);
}

/**
 * Plant das Hinzufügen: → {toAdd, skipped, renamed}. Identische Rezepte werden übersprungen. Mutiert keine Eingabe.
 * Alles in toAdd bekommt `origin: "user"`, egal was die Datei sagt: importiert = vom Nutzer angelegt (#72).
 */
export function planImport(incoming, existing, now = Date.now) {
  const nextId = makeIdFactory([...existing, ...incoming].map((r) => r.id), now); // auch Import-IDs sperren
  const taken = new Set(existing.map((r) => r.id));
  const byId = new Map(existing.map((r) => [r.id, r]));
  const cleanedById = new Map(); // nur für den Vergleich; der Bestand selbst bleibt unangetastet (#89)
  const toAdd = [], renamed = [], skipped = [];
  const cleanedExisting = (id) => {
    if (!cleanedById.has(id)) cleanedById.set(id, cleanRecipe(byId.get(id)).clean);
    return cleanedById.get(id);
  };
  for (const r of incoming) {
    if (byId.has(r.id) && isSameRecipe(r, cleanedExisting(r.id))) {
      skipped.push({ id: r.id, name: r.name, reason: `${r.name}: bereits vorhanden` });
    } else if (taken.has(r.id)) {
      const id = nextId();
      renamed.push({ from: r.id, to: id, name: r.name });
      toAdd.push({ ...r, id, origin: ORIGIN_USER });
      taken.add(id);
    } else {
      toAdd.push({ ...r, origin: ORIGIN_USER });
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
    reasons: [...errors, ...notes], // strukturiert (s. parseImportFile). Duplikate nur zählen: bis zu 105 Zeilen Liste wären Rauschen
    renamed: plan.renamed.length,
    duplicates: plan.skipped.length,
  };
}
