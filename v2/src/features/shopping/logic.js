// logic.js — PURE Einkaufslisten-Logik (unit-getestet, kein DOM/DB).
// Vorrats-Abzug nach der 🛒-Konvention (SCHEMA.md): markiert = kaufen,
// unmarkiert = Vorrat. Fallback für Rezepte OHNE Marker: Vorratsliste
// (Projektwissen) per Substring-Match. Seit v2.15.3 (T6): was im Lager als vorhanden
// steht, wird nie gekauft — auch nicht mit 🛒.
// Seit v2.15.3 (T5): EINE Regel „derselbe Artikel?“ (sameKey/findSame) für Rezepte, Plan,
// Katalog-Kacheln, Freitext, Freunde und den Partner-Abgleich.

import { parseIngredient, scaleIngredient } from "../../data/derive.js";
import { CATALOG, ingMatchCat, SECTION_ORDER, sectionIcon } from "../../data/catalog.js";

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

/* ============================================================
   T6 (BH-04): Lager schlägt 🛒
   ============================================================ */

const words = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Suchformen eines Lager-Namens: ohne Klammerzusatz, dazu Einzahl/Mehrzahl auf -n/-en. */
function stockForms(name) {
  const base = words(String(name ?? "").replace(/\(.*?\)/g, " "));
  if (base.length < 2) return [];
  if (base.length < 4) return [base];
  return [...new Set([base, base.replace(/en$/, ""), base.replace(/n$/, ""), base + "n", base + "en"])].filter((f) => f.length >= 3);
}

/**
 * Steht dieser Artikel im Lager (Vorrat an / Kühlschrank)? Verglichen wird auf GANZE Wörter —
 * „Ei“ trifft nicht „Reis“, „Ingwer“ nicht „Ingwerpulver“, „Milch“ nicht „Kokosmilch“.
 */
export function inStockMatch(itemName, stock = []) {
  const hay = ` ${words(baseName(itemName))} `;
  if (hay.trim() === "") return false;
  return stock.some((s) => stockForms(s).some((f) => hay.includes(` ${f} `)));
}

/**
 * Muss diese Zutat gekauft werden?
 * - T6: Steht sie im Lager (`inStock`, Vorrat an + Kühlschrank) → nein, auch mit 🛒.
 * - Rezept nutzt 🛒-Marker (mindestens einer): markiert=kaufen, unmarkiert=Vorrat.
 * - Rezept ohne Marker (alte/manuelle Rezepte): Vorratslisten-Match entscheidet.
 */
export function needsBuying(rawIngredient, { recipeUsesMarkers, staples = DEFAULT_STAPLES, inStock = [] }) {
  const p = parseIngredient(rawIngredient);
  if (inStock.length && inStockMatch(p.item || rawIngredient, inStock)) return false;
  if (/🛒/.test(rawIngredient)) return true;
  if (recipeUsesMarkers) return false;
  return !matchesStaples(p.item || rawIngredient, staples);
}

/** Normalisierter Schlüssel (Artikeltext, Einheit) — nur noch für alte Aufrufer; die Liste nutzt sameKey. */
export function itemKey(item, unit) {
  return `${(item || "").toLowerCase().replace(/\s+/g, " ").trim()}|${(unit || "").toLowerCase()}`;
}

/* ============================================================
   T5: EINE Regel „derselbe Artikel?“ (BH-05…08, DG-08/09, SI-04/05, AR-08, UX-11)
   ============================================================ */

/**
 * Name ohne Zubereitungs-Zusatz: „Ingwer, gerieben“ → „Ingwer“. Abgeschnitten wird nur ein Zusatz,
 * der klein beginnt — „Salz, Pfeffer“ sind zwei Nomen und bleiben. Klammern bleiben (Anzeige).
 */
export function stripNote(name) {
  const s = String(name ?? "").replace(/🛒/g, " ").replace(/\s+/g, " ").trim();
  const cut = s.search(/\s*,\s*(?=\p{Ll})/u);
  return (cut > 0 ? s.slice(0, cut) : s).trim();
}

/** Kern des Namens für Vergleiche: ohne Zusatz und ohne Klammern („Ingwer (ca. 3 cm)“ → „Ingwer“). */
export function baseName(name) {
  return stripNote(String(name ?? "").replace(/\(.*?\)/g, " "));
}

/** Katalog-Formen → Katalogname („zwiebel“ → „zwiebeln“, „karotte“ → „karotten“). */
const CANON = new Map();
for (const sec of CATALOG) {
  for (const it of sec.items) {
    const base = it.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
    CANON.set(base, base);
    if (base.length >= 6 && base.endsWith("n") && !CANON.has(base.slice(0, -1))) CANON.set(base.slice(0, -1), base);
  }
}

/**
 * Der eine Schlüssel „derselbe Artikel“: Name ohne Zusatz, klein, Einheit egal; Einzahl/Mehrzahl
 * eines Katalog-Artikels zählen gleich. Beschreibende Wörter bleiben: „passierte Tomaten“ ≠ „Tomaten“.
 */
export function sameKey(name) {
  const b = baseName(name).toLowerCase();
  return CANON.get(b) || b;
}

/** Die Zeile für diesen Namen: eine OFFENE vor einer gelöschten (Tombstone); sonst null. */
export function findSame(items, name) {
  const k = sameKey(name);
  if (!k) return null;
  const is = (x) => sameKey(x.nameDe || x.name) === k || sameKey(x.name) === k;
  return items.find((x) => !x.deleted && is(x)) || items.find(is) || null;
}

/* ---------- Mengen über Einheiten hinweg ---------- */

const COUNT_UNIT = /^(stück|stk|st)\.?$/i;
/** Einheiten-Art: "" = Stückzahl (keine Einheit oder „Stück“), sonst die Einheit klein. */
const unitKind = (u) => (!u || COUNT_UNIT.test(String(u).trim()) ? "" : String(u).trim().toLowerCase());

/** Mengen einer Zeile als Teile: [{amount, unit}] — eine Zeile ohne Menge ist „qty Stück“. */
export function partsOf(row) {
  if (row.amount === null || row.amount === undefined) return [{ amount: row.qty || 1, unit: null }];
  return [{ amount: row.amount, unit: row.unit ?? null }, ...(Array.isArray(row.more) ? row.more.map((p) => ({ ...p })) : [])];
}

function setParts(row, parts) {
  const [first, ...rest] = parts;
  if ((row.amount === null || row.amount === undefined) && !rest.length && first.unit === null) {
    row.qty = first.amount;                       // bleibt eine Zählzeile (mit +/−)
  } else {
    if (row.amount === null || row.amount === undefined) row.qty = 1;
    row.amount = first.amount;
    row.unit = first.unit;
  }
  if (rest.length) row.more = rest; else delete row.more;
}

/**
 * Menge zu einer Zeile addieren (mutiert): gleiche Einheiten-Art wird summiert („2 Stück“ + 1 → 3),
 * eine andere Einheit kommt als weiterer Teil dazu („200g + 2 EL Joghurt“) — nie eine zweite Zeile.
 */
export function addAmount(row, amount, unit = null) {
  const parts = partsOf(row);
  const kind = unitKind(unit);
  const hit = parts.find((p) => unitKind(p.unit) === kind);
  if (hit) hit.amount = Math.round((hit.amount + amount) * 1e6) / 1e6;
  else parts.push({ amount, unit: unit ?? null });
  setParts(row, parts);
  return row;
}

/** Menge einer anderen Zeile einrechnen. Ohne Mengenangabe („Feta 🛒“) zählt sie nur bei Zählzeilen. */
export function mergeQuantity(target, other) {
  if (other.amount === null || other.amount === undefined) {
    if (target.amount === null || target.amount === undefined) target.qty = (target.qty || 1) + (other.qty || 1);
    return target;
  }
  for (const p of partsOf(other)) addAmount(target, p.amount, p.unit);
  return target;
}

/** Zahl fürs Kachel-Badge: die Stückzahl der Zeile, sonst ✓ (sie steht mit Gramm o. Ä. drauf). */
export function badgeOf(row) {
  const count = partsOf(row).find((p) => unitKind(p.unit) === "");
  return count ? String(Math.round(count.amount * 100) / 100).replace(".", ",") : "✓";
}

/**
 * Ein Tipp auf eine Katalog-Kachel / Freitext / Freundes-Vorschlag: +1 auf DIE Zeile dieses
 * Artikels (offene vor gelöschter), sonst eine neue. Mutiert `items`, gibt die Zeile zurück.
 */
export function addOne(items, { name, cat, icon }, { now = new Date().toISOString(), id, author = "local" } = {}) {
  const it = findSame(items, name);
  if (it && it.deleted) {
    Object.assign(it, { deleted: false, done: false, qty: 1, amount: null, unit: null });
    delete it.more;
  } else if (it) {
    addAmount(it, 1, null);
    it.done = false;
  }
  if (it) { it.updated = now; return it; }
  const row = { id, name, cat: cat || "Sonstiges", icon: icon || "🛒", qty: 1, done: false, amount: null, unit: null, updated: now, author, deleted: false };
  items.push(row);
  return row;
}

/** Artikelname aus einer (ggf. skalierten) Zutatenzeile. */
function nameOf(raw) {
  const p = parseIngredient(raw);
  return (p.item || p.raw.replace(/🛒/g, "").trim()).replace(/\s+/g, " ").trim();
}

/**
 * BH-09: Zwei Zutaten in einer Zeile („0,5 TL Nelken , 1 TL Ingwerpulver 🛒“) → zwei Zeilen.
 * Getrennt wird nur an „, <Zahl>“ mit Leerzeichen danach (nicht „1,5 kg“), und nur, wenn jedes Stück
 * einen Artikel hat. Ein 🛒 am Zeilenende gilt für alle Stücke.
 */
export function splitLine(raw) {
  const pieces = String(raw).split(/\s*,\s+(?=[\d½¼¾⅓⅔⅛])/).map((x) => x.trim()).filter(Boolean);
  if (pieces.length < 2 || !pieces.every((x) => parseIngredient(x).item.replace(/🛒/g, "").trim())) return [raw];
  const marked = (x) => /🛒/.test(x);
  if (marked(pieces[pieces.length - 1]) && !pieces.slice(0, -1).some(marked)) return pieces.map((x) => (marked(x) ? x : x + " 🛒"));
  return pieces;
}

/**
 * Aggregiert die Kauf-Zutaten mehrerer Rezepte zu Einkaufsartikeln.
 * recipes MÜSSEN die deutschen (kanonischen) Rezepte sein: Vorrat, Katalog-Gang und Icon
 * matchen deutsch. factorById: optionaler Skalierungsfaktor pro Rezept (Portions-Anpassung).
 * displayById (S3): optional { id: lokalisiertes Rezept } — dann zeigt `name` die Zutat in der
 * UI-Sprache (gleiche Position, Overlay garantiert 1:1), `nameDe` behält den deutschen Schlüssel.
 * Derselbe Artikel (sameKey, T5) → EINE Zeile; Mengen werden summiert, andere Einheiten als Zusatz.
 * inStock (T6): Lager-Namen — was dort vorhanden ist, wird übersprungen, auch mit 🛒.
 * Rückgabe: [{ name, nameDe, amount, unit, more?, cat, icon, qty, done, sources }]
 */
export function aggregateIngredients(recipes, { staples = DEFAULT_STAPLES, inStock = [], factorById = {}, displayById = {} } = {}) {
  const map = new Map();
  const vague = new Set(); // Zeilen, die bisher nur aus „ohne Menge“ bestehen („Feta 🛒“)
  let skipped = 0;

  for (const r of recipes) {
    const list = r.ingredients || [];
    const usesMarkers = list.some((i) => /🛒/.test(i));
    const factor = factorById[r.id] || 1;
    const disp = displayById[r.id];
    const dispList = disp && Array.isArray(disp.ingredients) && disp.ingredients.length === list.length ? disp.ingredients : null;

    for (let j = 0; j < list.length; j++) {
      const pieces = splitLine(list[j]);
      const dispPieces = dispList ? splitLine(dispList[j]) : null;
      for (let k = 0; k < pieces.length; k++) {
        const raw = pieces[k];
        if (!needsBuying(raw, { recipeUsesMarkers: usesMarkers, staples, inStock })) { skipped++; continue; }
        const scaled = factor !== 1 ? scaleIngredient(raw, factor) : raw;
        const p = parseIngredient(scaled);
        const full = nameOf(scaled);
        const name = stripNote(full) || full;
        // Anzeige in der UI-Sprache; ein Zusatz wird dort nur abgeschnitten, wenn er es im Deutschen wurde.
        const dispRaw = dispPieces && dispPieces.length === pieces.length ? nameOf(dispPieces[k]) : "";
        const shown = dispRaw ? (name !== full ? dispRaw.split(",")[0].trim() : dispRaw) : name;
        const key = sameKey(name);
        const existing = map.get(key);
        if (existing) {
          if (p.amount !== null) {
            if (vague.has(key)) { existing.amount = p.amount; existing.unit = p.unit; vague.delete(key); }
            else addAmount(existing, p.amount, p.unit);
          }
          if (!existing.sources.includes(r.id)) existing.sources.push(r.id);
        } else {
          const m = ingMatchCat(name);
          if (p.amount === null) vague.add(key);
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
  }
  return { items: [...map.values()], skipped };
}

/**
 * Mischt neue Artikel in eine bestehende Liste (mutiert nicht; gibt neue Liste).
 * Derselbe Artikel (findSame, T5 — offene Zeile vor Tombstone, BH-07): Mengen einrechnen,
 * done zurücksetzen (v1-Verhalten), Quellen-Rezepte vereinigen. Nur wenn es ausschließlich
 * eine gelöschte Zeile gibt, wird sie wiederbelebt (gleiche id → der Partner sieht es).
 * Jede Änderung setzt `updated`, damit der Partner-Sync sie übernimmt.
 */
export function mergeItems(existing, incoming, now = new Date().toISOString()) {
  const out = existing.map((x) => ({ ...x }));
  for (const inc of incoming) {
    const hit = findSame(out, inc.nameDe || inc.name);
    if (hit && hit.deleted) {
      Object.assign(hit, { ...inc, id: hit.id, author: hit.author, deleted: false, done: false });
      if (!inc.more) delete hit.more;
    } else if (hit) {
      mergeQuantity(hit, inc);
      if (Array.isArray(inc.sources)) hit.sources = [...new Set([...(hit.sources || []), ...inc.sources])];
      if (inc.plan) hit.plan = true;
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

/** Eine Menge als Text: "800g", "2 EL", "1,5". */
function fmtPart({ amount, unit }) {
  const numStr = String(Math.round(amount * 100) / 100).replace(".", ",");
  const unitPart = unit ? (/^(kg|g|ml|l)$/i.test(unit) ? unit : " " + unit) : "";
  return numStr + unitPart;
}

/** Anzeige-Label eines Artikels: "800g Kichererbsen (Dose)" / "200g + 2 EL Joghurt" / "Zitronen ×2". */
export function itemLabel(it) {
  if (it.amount !== null && it.amount !== undefined) {
    return `${partsOf(it).map(fmtPart).join(" + ")} ${it.name}`.trim();
  }
  return it.name;
}

/* ============================================================
   T9 (v2.16b): Herkunft zeigen, Rückgängig für jede Aktion, Ergebnis nach „Auf die Liste“
   ============================================================ */

/**
 * Woher kommt eine Zeile? → { recipes: [ids], plan, friend, other }
 * friend: null = kein Freundes-Artikel, "" = Freund ohne Namen, sonst sein Name.
 * other: auf einem ANDEREN Gerät angelegt (Partner oder dein zweites Gerät) — `by` ≠ dieses Gerät.
 */
export function originOf(row, { device = "" } = {}) {
  const a = typeof row.author === "string" ? row.author : "";
  return {
    recipes: Array.isArray(row.sources) ? row.sources.filter((x) => typeof x === "string") : [],
    plan: row.plan === true,
    friend: a === "friend" ? "" : a.startsWith("friend:") ? a.slice(7) : null,
    other: !!(device && typeof row.by === "string" && row.by && row.by !== device),
  };
}

const rowJson = (x) => JSON.stringify(x);

/** Tiefe Kopie der Liste vor einer Aktion (für Rückgängig). */
export function snapshotItems(items = []) {
  return items.map((x) => JSON.parse(JSON.stringify(x)));
}

/** ids, die eine Aktion geändert oder neu angelegt hat (Vergleich vorher/nachher). */
export function changedIds(before = [], after = []) {
  const prev = new Map(before.map((x) => [x.id, rowJson(x)]));
  return after.filter((x) => x.id && prev.get(x.id) !== rowJson(x)).map((x) => x.id);
}

/**
 * Eine Aktion rückgängig machen — NUR die Zeilen, die sie geändert hat (`ids`); was ein
 * Abgleich inzwischen anderswo geändert hat, bleibt. Geänderte Zeilen → alter Stand, neue → gelöscht.
 * Immer mit neuer Marke, sonst gewinnt beim Partner-Abgleich wieder die Aktion. Mutiert `items`.
 */
export function undoChange(items, before, ids, now = new Date().toISOString()) {
  const prev = new Map(before.map((x) => [x.id, x]));
  const want = new Set(ids);
  let n = 0;
  for (const it of items) {
    if (!want.has(it.id)) continue;
    const old = prev.get(it.id);
    if (!old) {
      if (!it.deleted) { it.deleted = true; it.updated = now; n++; }
      continue;
    }
    for (const k of Object.keys(it)) if (!(k in old)) delete it[k];
    Object.assign(it, JSON.parse(JSON.stringify(old)), { updated: now });
    n++;
  }
  return n;
}

/**
 * UX-14: Was hat „Auf die Liste“ getan? Pro eingemischtem Artikel die Zeile, wie sie jetzt aussieht,
 * und ob sie neu ist oder auf eine schon vorhandene aufaddiert wurde.
 * → [{ label, merged }]
 */
export function addSummary(before = [], after = [], incoming = []) {
  const wasLive = before.filter((x) => !x.deleted);
  const nowLive = after.filter((x) => !x.deleted);
  const seen = new Set();
  const out = [];
  for (const inc of incoming) {
    const name = inc.nameDe || inc.name;
    const row = findSame(nowLive, name);
    if (!row || seen.has(row)) continue;
    seen.add(row);
    out.push({ label: itemLabel(row), merged: !!findSame(wasLive, name) });
  }
  return out;
}
