// lager.js (data) — Persistenz für Vorrat + Kühlschrank (IndexedDB kv).
// Wird von der Lager-Ansicht UND von settings.getStaples (Einkaufsliste) genutzt.

import * as db from "./db.js";
import { seedPantry, getInStockNames } from "../features/lager/logic.js";

const PANTRY_KEY = "lagerPantry";
const FRIDGE_KEY = "lagerFridge";

export async function getPantry() {
  const p = await db.kvGet(PANTRY_KEY, null);
  return Array.isArray(p) ? p : seedPantry();
}
export async function setPantry(pantry) { await db.kvSet(PANTRY_KEY, pantry); }

export async function getFridge() {
  const f = await db.kvGet(FRIDGE_KEY, null);
  return Array.isArray(f) ? f : [];
}
export async function setFridge(fridge) { await db.kvSet(FRIDGE_KEY, fridge); }

/** Vorhandene Namen (Vorrat on + Kühlschrank) — für die Einkaufslisten-Subtraktion. */
export async function getInStock() {
  const [pantry, fridge] = await Promise.all([getPantry(), getFridge()]);
  return getInStockNames(pantry, fridge);
}
