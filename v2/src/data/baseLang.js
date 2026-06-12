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

/** Baut eine id→{name,ingredients,steps,tips}-Map aus Sprach-Snapshot-Rezepten. */
export function buildLangMap(langRecipes) {
  const map = new Map();
  for (const r of langRecipes || []) {
    if (!r || !r.id) continue;
    map.set(r.id, { name: r.name, ingredients: r.ingredients, steps: r.steps, tips: r.tips });
  }
  return map;
}

/**
 * ANZEIGE-Overlay: liefert eine neue Rezeptliste, in der Basis-Rezepte (id in der
 * Map) ihre vier Inhaltsfelder aus der Zielsprache zeigen — Nutzer-Status,
 * category und alle übrigen Felder bleiben aus dem (deutschen) Original. Rezepte
 * ohne Map-Eintrag (selbst hinzugefügt) bleiben unverändert.
 * Mutiert NICHTS und schreibt NICHTS zurück.
 */
export function localizeRecipes(recipes, langMap) {
  if (!langMap || !langMap.size) return recipes;
  return recipes.map((r) => {
    const tr = langMap.get(r.id);
    if (!tr) return r;
    const out = { ...r };
    if (typeof tr.name === "string" && tr.name.trim()) out.name = tr.name;
    if (Array.isArray(tr.ingredients) && tr.ingredients.length) out.ingredients = tr.ingredients.slice();
    if (Array.isArray(tr.steps) && tr.steps.length) out.steps = tr.steps.slice();
    if (typeof tr.tips === "string") out.tips = tr.tips;
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
