// logic.js — PURE Lager-Logik (Vorrat + Kühlschrank), unit-getestet, kein DOM/DB.
// Vorrat (Section A): Artikel mit binärem on/off, gruppiert. Kühlschrank (Section B):
// Liste {name, menge}. getInStockNames() liefert die Namen, die die Einkaufsliste abzieht.

/** Default-Vorrat aus Projektwissen — alles startet als "vorhanden" (on:true). */
export const DEFAULT_PANTRY = [
  // Trockenwaren
  ...["Spaghetti", "Pasta (klein)", "Chinesische Nudeln", "Reis", "Couscous", "Bulgur",
    "Haferflocken", "Mehl (405)", "Roggenmehl", "Zucker", "Salz"].map((name) => ({ name, cat: "Trockenwaren" })),
  // Konserven
  ...["Rote Bohnen", "Kichererbsen", "Erbsen+Karotten", "Thunfisch", "Dosentomaten", "Kokosmilch"]
    .map((name) => ({ name, cat: "Konserven" })),
  // Gewürze
  ...["Pfeffer", "Paprikapulver", "Kreuzkümmel", "Curry", "Chiliflocken", "Rosmarin", "Muskatnuss", "Zimt"]
    .map((name) => ({ name, cat: "Gewürze" })),
  // Backzutaten / Sonstiges
  ...["Backpulver", "Hefe", "Mandeln"].map((name) => ({ name, cat: "Backzutaten" })),
  ...["Erdnussbutter", "Honig", "Öl"].map((name) => ({ name, cat: "Sonstiges" })),
].map((x) => ({ ...x, on: true }));

export const PANTRY_CATEGORIES = ["Trockenwaren", "Konserven", "Gewürze", "Backzutaten", "Sonstiges"];

/** Frische Pantry-Liste (Defaults), als neue Objekte (kein geteilter State). */
export function seedPantry() {
  return DEFAULT_PANTRY.map((x) => ({ ...x }));
}

const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Vorrats-Artikel an/aus schalten (immutabel). */
export function togglePantry(pantry, name) {
  return pantry.map((p) => (norm(p.name) === norm(name) ? { ...p, on: !p.on } : p));
}

/** Eigenen Vorrats-Artikel hinzufügen (Duplikat → unverändert). */
export function addPantryItem(pantry, name, cat) {
  name = (name || "").trim();
  if (!name) return pantry;
  if (pantry.some((p) => norm(p.name) === norm(name))) return pantry;
  return [...pantry, { name, cat: cat || "Sonstiges", on: true, custom: true }];
}

export function removePantryItem(pantry, name) {
  return pantry.filter((p) => norm(p.name) !== norm(name));
}

/** Pantry nach Kategorie gruppieren (Anzeige-Reihenfolge PANTRY_CATEGORIES). */
export function groupPantry(pantry) {
  const cats = [...new Set([...PANTRY_CATEGORIES, ...pantry.map((p) => p.cat)])];
  return cats
    .map((cat) => ({ cat, items: pantry.filter((p) => p.cat === cat) }))
    .filter((g) => g.items.length);
}

/* ---------- Kühlschrank ---------- */

/** Frischware-Eintrag hinzufügen/aktualisieren (Dedup auf Namen, neue Menge gewinnt).
 *  icon optional (D1: Katalog-Symbol). Bei Dedup gewinnt ein neues Icon, sonst bleibt das alte. */
export function addFridgeItem(fridge, name, menge = "", icon = "") {
  name = (name || "").trim();
  if (!name) return fridge;
  const i = fridge.findIndex((f) => norm(f.name) === norm(name));
  if (i >= 0) {
    const out = fridge.slice();
    out[i] = { ...out[i], menge: menge || out[i].menge, icon: icon || out[i].icon };
    return out;
  }
  return [...fridge, { name, menge, icon }];
}

export function removeFridgeItem(fridge, name) {
  return fridge.filter((f) => norm(f.name) !== norm(name));
}

/** Mehrere erkannte Artikel (aus dem Scan) zusammenführen. items = [{name, menge}]. */
export function mergeFridge(fridge, items) {
  let out = fridge.slice();
  for (const it of items || []) out = addFridgeItem(out, it.name, it.menge || "", it.icon || "");
  return out;
}

/* ---------- Einkaufslisten-Integration ---------- */

/** Namen, die als "vorhanden" gelten (Vorrat on + alles im Kühlschrank). */
export function getInStockNames(pantry, fridge) {
  const names = [];
  for (const p of pantry || []) if (p.on) names.push(p.name);
  for (const f of fridge || []) names.push(f.name);
  return names;
}
