// logic.js — PURE Einkaufslisten-Logik (unit-getestet, kein DOM/DB).
// Vorrats-Abzug nach der 🛒-Konvention (SCHEMA.md): markiert = kaufen,
// unmarkiert = Vorrat. Fallback für Rezepte OHNE Marker: Vorratsliste
// (Projektwissen) per Substring-Match.

import { parseIngredient, scaleIngredient } from "../../data/derive.js";
import { ingMatchCat } from "./catalog.js";

/** Vorrats-Grundausstattung aus Projektwissen1.md — in Phase 3 editierbar (Settings). */
export const DEFAULT_STAPLES = [
  // Trockenwaren
  "Mehl", "Roggenmehl", "Brotmehl", "Zucker", "Salz", "Spaghetti", "Pasta", "Nudeln",
  "Reis", "Couscous", "Bulgur", "Haferflocken", "Rote Bohnen", "Kichererbsen",
  "Erbsen", "Karotten (Dose)", "Thunfisch", "Mandeln", "Pudding", "Erdnussbutter",
  "Honig", "Kokosmilch",
  // Gemüse/Obst (regelmäßig da)
  "Zucchini", "Paprika", "Tomaten", "Gurke", "Zwiebel", "Äpfel", "Bananen", "TK-Gemüse",
  // Milchprodukte & Eier
  "Eier", "Ei", "Butter", "Sahne", "Milch", "Buttermilch", "Käse",
  // Konserven & Soßen
  "Dosentomaten", "Tomatensoße", "Tomatensauce",
  // Backen
  "Backpulver", "Hefe", "Sonnenblumenkerne", "Leinsamen",
  // Gewürze (bestätigt vorhanden) + Basics
  "Pfeffer", "Paprikapulver", "Kreuzkümmel", "Cumin", "Curry", "Chiliflocken",
  "Rosmarin", "Muskat", "Zimt", "Öl", "Olivenöl", "Wasser",
];

function matchesStaples(itemText, staples) {
  const low = itemText.toLowerCase();
  return staples.some((s) => {
    const base = s.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
    return base.length >= 2 && low.includes(base);
  });
}

/**
 * Muss diese Zutat gekauft werden?
 * - Rezept nutzt 🛒-Marker (mindestens einer): markiert=kaufen, unmarkiert=Vorrat.
 * - Rezept ohne Marker (alte/manuelle Rezepte): Vorratslisten-Match entscheidet.
 */
export function needsBuying(rawIngredient, { recipeUsesMarkers, staples = DEFAULT_STAPLES }) {
  if (/🛒/.test(rawIngredient)) return true;
  if (recipeUsesMarkers) return false;
  const p = parseIngredient(rawIngredient);
  return !matchesStaples(p.item || rawIngredient, staples);
}

/** Normalisierter Schlüssel zum Zusammenfassen: (Artikeltext, Einheit). */
export function itemKey(item, unit) {
  return `${(item || "").toLowerCase().replace(/\s+/g, " ").trim()}|${(unit || "").toLowerCase()}`;
}

/**
 * Aggregiert die Kauf-Zutaten mehrerer Rezepte zu Einkaufsartikeln.
 * factorById: optionaler Skalierungsfaktor pro Rezept (Portions-Anpassung).
 * Gleicher Artikeltext + gleiche Einheit → Mengen werden summiert.
 * Rückgabe: [{ name, amount, unit, cat, icon, qty, done, sources }]
 */
export function aggregateIngredients(recipes, { staples = DEFAULT_STAPLES, factorById = {} } = {}) {
  const map = new Map();
  let skipped = 0;

  for (const r of recipes) {
    const list = r.ingredients || [];
    const usesMarkers = list.some((i) => /🛒/.test(i));
    const factor = factorById[r.id] || 1;

    for (const raw of list) {
      if (!needsBuying(raw, { recipeUsesMarkers: usesMarkers, staples })) { skipped++; continue; }
      const scaled = factor !== 1 ? scaleIngredient(raw, factor) : raw;
      const p = parseIngredient(scaled);
      const name = (p.item || p.raw.replace(/🛒/g, "").trim()).replace(/\s+/g, " ").trim();
      const key = itemKey(name, p.unit);
      const m = ingMatchCat(name);
      const existing = map.get(key);
      if (existing) {
        if (existing.amount !== null && p.amount !== null) existing.amount += p.amount;
        else existing.qty++;
        if (!existing.sources.includes(r.id)) existing.sources.push(r.id);
      } else {
        map.set(key, {
          name,
          amount: p.amount,
          unit: p.unit,
          cat: m ? m.cat : "Aus Rezepten",
          icon: m ? m.icon : "🍳",
          qty: 1,
          done: false,
          sources: [r.id],
        });
      }
    }
  }
  return { items: [...map.values()], skipped };
}

/**
 * Mischt neue Artikel in eine bestehende Liste (mutiert nicht; gibt neue Liste).
 * Gleicher Schlüssel: Mengen summieren bzw. qty erhöhen, done zurücksetzen (v1-Verhalten).
 */
export function mergeItems(existing, incoming) {
  const out = existing.map((x) => ({ ...x }));
  for (const inc of incoming) {
    const key = itemKey(inc.name, inc.unit);
    const hit = out.find((x) => itemKey(x.name, x.unit) === key);
    if (hit) {
      if (hit.amount !== null && hit.amount !== undefined && inc.amount !== null && inc.amount !== undefined) {
        hit.amount += inc.amount;
      } else {
        hit.qty += inc.qty || 1;
      }
      hit.done = false;
    } else {
      out.push({ ...inc });
    }
  }
  return out;
}

/** Anzeige-Label eines Artikels: "800g Kichererbsen (Dose)" / "Zitronen ×2". */
export function itemLabel(it) {
  if (it.amount !== null && it.amount !== undefined) {
    const n = Math.round(it.amount * 100) / 100;
    const numStr = String(n).replace(".", ",");
    const unitPart = it.unit ? (/^(kg|g|ml|l)$/i.test(it.unit) ? it.unit : " " + it.unit) : "";
    return `${numStr}${unitPart} ${it.name}`.trim();
  }
  return it.name;
}
