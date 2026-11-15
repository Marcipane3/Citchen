// portions.js — QW-2: zuletzt gewählter Portions-Faktor pro Rezept im Kochmodus.
// Liegt NUR auf diesem Gerät (localStorage), nie in rezepte.json und nie im Sync.
// Reine Funktionen; der Speicher ist injizierbar (Node-Tests haben kein localStorage).

export const PORTIONS_KEY = "kochv2_cookPortions"; // { [rezeptId]: faktor }

const MIN_TARGET = 1, MAX_TARGET = 24;

const defaultStore = () => (typeof localStorage !== "undefined" ? localStorage : null);
const valid = (f) => typeof f === "number" && Number.isFinite(f) && f > 0;

/** Gespeicherte Karte als Map; kaputtes oder fremdes JSON zählt als leer. */
function read(store) {
  try {
    const o = JSON.parse(store.getItem(PORTIONS_KEY));
    if (o && typeof o === "object" && !Array.isArray(o)) return new Map(Object.entries(o));
  } catch (e) { /* kein Speicher, privater Modus oder kaputtes JSON */ }
  return new Map();
}

function write(store, map) {
  try {
    if (map.size) store.setItem(PORTIONS_KEY, JSON.stringify(Object.fromEntries(map)));
    else store.removeItem(PORTIONS_KEY);
  } catch (e) { /* privater Modus: gilt nur für diese Sitzung */ }
}

/** Gespeicherter Faktor für das Rezept; ohne (brauchbaren) Wert 1. */
export function getFactor(id, store = defaultStore()) {
  const f = read(store).get(String(id));
  return valid(f) ? f : 1;
}

/** Merkt den Faktor; Faktor 1 (die eigene Portionsgröße) oder Unsinn entfernt den Wert. */
export function setFactor(id, factor, store = defaultStore()) {
  const map = read(store);
  if (valid(factor) && factor !== 1) map.set(String(id), factor);
  else map.delete(String(id));
  write(store, map);
}

export function clearFactor(id, store = defaultStore()) {
  setFactor(id, 1, store);
}

/** Ziel-Portionen zu einem Faktor (null, wenn das Rezept keine Zahl bei servings hat). */
export function targetFor(baseServings, factor) {
  if (baseServings === null) return null;
  return Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(baseServings * factor)));
}

/**
 * Startwerte beim Öffnen des Kochmodus. Ohne gemerkten Wert (Faktor 1) exakt wie vor QW-2:
 * die eigene Portionsgröße, ungerundet und unbegrenzt (z. B. 40 Kekse). Nur ein gemerkter
 * Wert geht durch targetFor; eine Basis, die nicht > 0 ist, kann nicht skaliert werden.
 */
export function startFor(baseServings, storedFactor) {
  if (baseServings === null) return { target: null, factor: storedFactor };
  if (storedFactor === 1 || !(baseServings > 0) || !Number.isFinite(baseServings)) {
    return { target: baseServings, factor: 1 };
  }
  const target = targetFor(baseServings, storedFactor);
  return { target, factor: target / baseServings };
}
