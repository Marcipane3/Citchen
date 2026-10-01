// logic.js — PURE Einkaufslisten-Logik (unit-getestet, kein DOM/DB).
// Vorrats-Abzug nach der 🛒-Konvention (SCHEMA.md): markiert = kaufen,
// unmarkiert = Vorrat. Fallback für Rezepte OHNE Marker: Vorratsliste
// (Projektwissen) per Substring-Match.

import { parseIngredient, scaleIngredient } from "../../data/derive.js";
import { ingMatchCat, SECTION_ORDER, sectionIcon } from "../../data/catalog.js";

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

/** Artikelname aus einer (ggf. skalierten) Zutatenzeile. */
function nameOf(raw) {
  const p = parseIngredient(raw);
  return (p.item || p.raw.replace(/🛒/g, "").trim()).replace(/\s+/g, " ").trim();
}

/**
 * Aggregiert die Kauf-Zutaten mehrerer Rezepte zu Einkaufsartikeln.
 * recipes MÜSSEN die deutschen (kanonischen) Rezepte sein: Vorrat, Katalog-Gang und Icon
 * matchen deutsch. factorById: optionaler Skalierungsfaktor pro Rezept (Portions-Anpassung).
 * displayById (S3): optional { id: lokalisiertes Rezept } — dann zeigt `name` die Zutat in der
 * UI-Sprache (gleiche Position, Overlay garantiert 1:1), `nameDe` behält den deutschen Schlüssel.
 * Gleicher Artikeltext + gleiche Einheit → Mengen werden summiert.
 * Rückgabe: [{ name, nameDe, amount, unit, cat, icon, qty, done, sources }]
 */
export function aggregateIngredients(recipes, { staples = DEFAULT_STAPLES, factorById = {}, displayById = {} } = {}) {
  const map = new Map();
  let skipped = 0;

  for (const r of recipes) {
    const list = r.ingredients || [];
    const usesMarkers = list.some((i) => /🛒/.test(i));
    const factor = factorById[r.id] || 1;
    const disp = displayById[r.id];
    const dispList = disp && Array.isArray(disp.ingredients) && disp.ingredients.length === list.length ? disp.ingredients : null;

    for (let j = 0; j < list.length; j++) {
      const raw = list[j];
      if (!needsBuying(raw, { recipeUsesMarkers: usesMarkers, staples })) { skipped++; continue; }
      const scaled = factor !== 1 ? scaleIngredient(raw, factor) : raw;
      const p = parseIngredient(scaled);
      const name = nameOf(scaled);
      const shown = (dispList && nameOf(dispList[j])) || name;
      const key = itemKey(name, p.unit);
      const m = ingMatchCat(name);
      const existing = map.get(key);
      if (existing) {
        if (existing.amount !== null && p.amount !== null) existing.amount += p.amount;
        else existing.qty++;
        if (!existing.sources.includes(r.id)) existing.sources.push(r.id);
      } else {
        map.set(key, {
          name: shown,
          nameDe: name,
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
 * Gleicher Schlüssel (deutscher Name + Einheit): Mengen summieren bzw. qty erhöhen,
 * done zurücksetzen (v1-Verhalten). Gelöschte Artikel (Tombstones) werden wiederbelebt
 * statt aufaddiert. Jede Änderung setzt `updated`, damit der Partner-Sync sie übernimmt.
 */
export function mergeItems(existing, incoming, now = new Date().toISOString()) {
  const out = existing.map((x) => ({ ...x }));
  const keyOf = (x) => itemKey(x.nameDe || x.name, x.unit);
  for (const inc of incoming) {
    const key = keyOf(inc);
    const hit = out.find((x) => keyOf(x) === key);
    if (hit && hit.deleted) {
      Object.assign(hit, { ...inc, id: hit.id, author: hit.author, deleted: false, done: false });
    } else if (hit) {
      if (hit.amount !== null && hit.amount !== undefined && inc.amount !== null && inc.amount !== undefined) {
        hit.amount += inc.amount;
      } else {
        hit.qty += inc.qty || 1;
      }
      hit.done = false;
    } else {
      out.push({ ...inc, updated: now });
      continue;
    }
    hit.updated = now;
  }
  return out;
}

/**
 * Formatiert die Einkaufsliste als Klartext für Teilen / Zwischenablage.
 * Aisle-grouped (SECTION_ORDER), offene Artikel vor erledigten, ✓-Prefix für done.
 */
export function formatListAsText(items) {
  if (!items.length) return "";
  const cats = [...new Set(items.map((x) => x.cat))].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const lines = [];
  for (const cat of cats) {
    const group = items.filter((x) => x.cat === cat);
    const open = group.filter((x) => !x.done);
    const done = group.filter((x) => x.done);
    lines.push(`\n${sectionIcon(cat)} ${cat}`);
    for (const it of [...open, ...done]) {
      const label = itemLabel(it);
      const suffix = (it.amount === null || it.amount === undefined) && it.qty > 1 ? ` ×${it.qty}` : "";
      lines.push(`${it.done ? "✓" : "•"} ${label}${suffix}`);
    }
  }
  return lines.join("\n").trim();
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
