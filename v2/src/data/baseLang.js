// baseLang.js — PURE Logik für die Übersetzung der Basis-Rezepte (B2).
//
// WICHTIG (Architektur): Die Drive-Datei rezepte.json ist die KANONISCHE
// deutsche Quelle, geteilt mit v1 und der Projekt-Claude-Instanz. Übersetzter
// Inhalt wird daher NIE nach Drive/IndexedDB zurückgeschrieben — er ist eine
// reine ANZEIGE-Überlagerung aus gebündelten Sprach-Snapshots
// (data/rezepte.snapshot.<lang>.json). Hier lebt nur reine, getestete Logik;
// genutzt von (a) der App (Anzeige-Overlay), (b) dem Generator-Skript
// (tools/build-snapshots.mjs), (c) den Unit-Tests.
//
// Übersetzbar sind NUR vier Felder: name, ingredients[], steps[], tips.
// Unangetastet bleiben: id, category (kanonischer DE-Enum — Filter/Validierung),
// time, servings sowie aller Nutzer-Status (favorite, rating, cookedCount,
// photos, image, feedback, lastCooked).

const CONTENT_FIELDS = ["name", "ingredients", "steps", "tips"];

/**
 * Überlagert die übersetzten Inhaltsfelder auf ein deutsches Basis-Rezept.
 * Fehlt/leer eine Übersetzung, bleibt der deutsche Wert (graceful fallback).
 * Genutzt vom Generator, um vollständige Sprach-Snapshots zu bauen.
 */
export function overlayTranslation(base, tr) {
  const out = { ...base };
  if (!tr || typeof tr !== "object") return out;
  if (typeof tr.name === "string" && tr.name.trim()) out.name = tr.name;
  if (Array.isArray(tr.ingredients) && tr.ingredients.length) out.ingredients = tr.ingredients.slice();
  if (Array.isArray(tr.steps) && tr.steps.length) out.steps = tr.steps.slice();
  if (typeof tr.tips === "string" && tr.tips.trim()) out.tips = tr.tips;
  return out;
}

/**
 * Baut eine id→{name,ingredients,steps,tips}-Map aus Sprach-Snapshot-Rezepten.
 * deRecipes (optional, der deutsche Snapshot): merkt pro Eintrag das deutsche Original, aus dem
 * die Übersetzung entstand — localizeRecipes überdeckt dann nur Felder, die noch so lauten.
 */
export function buildLangMap(langRecipes, deRecipes = null) {
  const de = new Map((deRecipes || []).filter((r) => r && r.id).map((r) => [r.id, r]));
  const map = new Map();
  for (const r of langRecipes || []) {
    if (!r || !r.id) continue;
    const entry = { name: r.name, ingredients: r.ingredients, steps: r.steps, tips: r.tips };
    const o = de.get(r.id);
    if (o) entry.de = { name: o.name, ingredients: o.ingredients, steps: o.steps, tips: o.tips };
    map.set(r.id, entry);
  }
  return map;
}

/**
 * Feld seit dem Snapshot bearbeitet (in der App, von Projekt-Claude …)? Dann zeigt die alte
 * Übersetzung nicht mehr den Inhalt — das gespeicherte (deutsche) Feld bleibt sichtbar.
 */
const edited = (tr, r, f) => !!tr.de && JSON.stringify(r[f] ?? null) !== JSON.stringify(tr.de[f] ?? null);

/**
 * ANZEIGE-Overlay: liefert eine neue Rezeptliste, in der Basis-Rezepte (id in der
 * Map) ihre vier Inhaltsfelder aus der Zielsprache zeigen — Nutzer-Status,
 * category und alle übrigen Felder bleiben aus dem (deutschen) Original. Rezepte
 * ohne Map-Eintrag (selbst hinzugefügt) bleiben unverändert. Ein Feld, das seit dem
 * Snapshot bearbeitet wurde (Eintrag kennt sein deutsches Original), bleibt wie gespeichert.
 * Mutiert NICHTS und schreibt NICHTS zurück.
 */
export function localizeRecipes(recipes, langMap) {
  if (!langMap || !langMap.size) return recipes;
  return recipes.map((r) => {
    const tr = langMap.get(r.id);
    if (!tr) return r;
    const out = { ...r };
    if (typeof tr.name === "string" && tr.name.trim() && !edited(tr, r, "name")) out.name = tr.name;
    if (Array.isArray(tr.ingredients) && tr.ingredients.length && !edited(tr, r, "ingredients")) out.ingredients = tr.ingredients.slice();
    if (Array.isArray(tr.steps) && tr.steps.length && !edited(tr, r, "steps")) out.steps = tr.steps.slice();
    if (typeof tr.tips === "string" && !edited(tr, r, "tips")) out.tips = tr.tips;
    return out;
  });
}

/** Zählt 🛒-Einkaufsmarker in den Zutaten — Generator-Schutz gegen Marker-Verlust. */
export function countShoppingMarkers(recipe) {
  const join = (recipe && Array.isArray(recipe.ingredients) ? recipe.ingredients : []).join(" ");
  return (join.match(/🛒/g) || []).length;
}

/**
 * Validiert eine Übersetzung gegen das deutsche Original. Gibt Warnungen zurück
 * (leeres Array = sauber). Der Generator nutzt das als Qualitäts-Gate.
 */
export function checkTranslation(base, tr) {
  const warns = [];
  if (!tr || typeof tr !== "object") return ["Übersetzung fehlt komplett"];
  if (!tr.name || !String(tr.name).trim()) warns.push("name leer");
  const baseIng = Array.isArray(base.ingredients) ? base.ingredients.length : 0;
  const trIng = Array.isArray(tr.ingredients) ? tr.ingredients.length : 0;
  if (baseIng !== trIng) warns.push(`Zutaten-Anzahl ${trIng}≠${baseIng}`);
  const baseSteps = Array.isArray(base.steps) ? base.steps.length : 0;
  const trSteps = Array.isArray(tr.steps) ? tr.steps.length : 0;
  if (baseSteps !== trSteps) warns.push(`Schritt-Anzahl ${trSteps}≠${baseSteps}`);
  const baseMk = countShoppingMarkers(base);
  const trMk = countShoppingMarkers({ ingredients: tr.ingredients });
  if (baseMk !== trMk) warns.push(`🛒-Marker ${trMk}≠${baseMk}`);
  return warns;
}

export const _CONTENT_FIELDS = CONTENT_FIELDS;
