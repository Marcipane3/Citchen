// items.js — R3.2: abgeleitetes `items[]` am Rezept (ADR-R1 §5). Pur, unit-testbar.
// `ingredients` (Freitext) bleibt der Vertrag und wird hier nie verändert; `items` ist optional und
// abgeleitet. Die Zuordnung läuft über den Zeilentext (`item.text`), nie über die Position: ein
// alter Client, der Zeilen entfernt oder umsortiert, kann so keinen Eintrag an die falsche Zeile hängen.
import { matchLine } from "./ingredientMatch.js";

const isItem = (it) => !!it && typeof it === "object" && !Array.isArray(it) && typeof it.text === "string";

/**
 * Neues `items[]` für ein Rezept (das Rezept selbst bleibt unverändert).
 * - Zeile, zu der es schon Items mit gleichem `text` gibt → diese bleiben (manuelle Korrekturen überleben).
 * - sonst läuft die Zeile durch `matchLine`; ohne Treffer entsteht ein freies Item ohne `ing`.
 * - Items, deren `text` in `ingredients` nicht mehr vorkommt, fallen weg.
 * @param index Ergebnis von buildIndex (oder die Stamm-Datei — dann wird der Index hier gebaut)
 * @returns {object[]} Items in Zeilenreihenfolge
 */
export function relinkItems(recipe, index) {
  const lines = Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter((l) => typeof l === "string") : [];
  const known = new Map(); // text → vorhandene Items dieser Zeile
  for (const it of Array.isArray(recipe?.items) ? recipe.items : []) {
    if (isItem(it)) known.set(it.text, [...(known.get(it.text) || []), it]);
  }
  const count = new Map(); // text → wie oft die Zeile vorkommt
  for (const line of lines) count.set(line, (count.get(line) || 0) + 1);
  const seen = new Map();
  const out = [];
  for (const line of lines) {
    const kept = known.get(line);
    const n = count.get(line);
    const k = seen.get(line) || 0;
    seen.set(line, k + 1);
    // Gleiche Zeile n-mal: die vorhandenen Items verteilen sich gleichmäßig auf die Vorkommen (idempotent);
    // passt die Zahl nicht auf, wird die Zeile neu abgeleitet statt Items zu vervielfachen.
    if (kept && kept.length % n === 0) {
      const per = kept.length / n;
      out.push(...kept.slice(k * per, (k + 1) * per));
    } else out.push(...matchLine(line, index));
  }
  return out;
}

/** Stabile Form für den Vergleich (Schlüsselreihenfolge egal). */
const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

/**
 * Das Rezept mit relinkten Items. Ändert sich nichts, kommt DASSELBE Objekt zurück (kein Churn);
 * ohne Index (Stamm nicht geladen) bleibt das Rezept, wie es ist.
 */
export function withItems(recipe, index) {
  if (!recipe || !index?.byName?.size) return recipe;
  const items = relinkItems(recipe, index);
  if (Array.isArray(recipe.items) && stable(recipe.items) === stable(items)) return recipe;
  return { ...recipe, items };
}
