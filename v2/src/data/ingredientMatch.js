// ingredientMatch.js — R3.1: Rezeptzeile (Freitext) → strukturierte Items mit Verweis auf den
// Zutaten-Stamm (ADR-R1 §4 Umrechnung, §5 Rezeptzeile). Pur, unit-testbar.
// Rezepte werden hier NICHT verändert und nichts wird gespeichert (das ist R3.2).
import { parseIngredient } from "./derive.js";
import { UNITS, unitFromText } from "./units.js";
import { splitLine } from "../features/shopping/logic.js";
import { searchNorm } from "../features/cookbook/filter.js";

const AMOUNT_START = /^[\d½¼¾⅓⅔⅛]/;
const GROUP_RE = /^(\p{Lu}[\p{L}\d-]{1,20}):\s+(.*)$/su;
// „(7g)“, „(400 g)“, „(ca. 1,5 kg)“ — die ganze Klammer ist ein Gewicht
const BRACKET_WEIGHT_RE = /\(\s*(?:ca\.?|etwa|à|je|~)?\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\s*\)/i;
const OPTIONAL_BRACKET_RE = /\(\s*optional\s*\)/gi;
const CLOVE_RE = /^(.{3,})zehen?$/;
const PLURAL_ENDINGS = ["en", "n", "e", "s"];

const fold = (s) => searchNorm(s).replace(/\s+/g, " ").trim();
/**
 * Ein Wort der Zeile in Vergleichsform: Satzzeichen an den Rändern weg, „&“ bleibt ein Wort.
 * „Öl/Butter“ ist eine Alternative: verglichen wird die erste Option.
 */
const foldWord = (w) => (w === "&" ? w : fold(w.split("/")[0]).replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""));
const round = (n) => Math.round(n * 1000) / 1000;
const listOf = (master) => (Array.isArray(master) ? master : Array.isArray(master?.ingredients) ? master.ingredients : []);

/**
 * Nachschlage-Index über Namen, Plurale und Aliase einer Sprache (gespeicherte Daten sind deutsch).
 * Groß-/Kleinschreibung, Akzente und ß sind egal (searchNorm).
 * @param master die Stamm-Datei ({ ingredients }) oder die nackte Liste
 * @returns {{ byName: Map<string,string>, byId: Map<string,object>, maxWords: number }}
 */
export function buildIndex(master, lang = "de") {
  const byName = new Map(), byId = new Map();
  let maxWords = 1;
  for (const rec of listOf(master)) {
    if (!rec || typeof rec.id !== "string" || !rec.id) continue;
    byId.set(rec.id, rec);
    const aliases = Array.isArray(rec.aliases?.[lang]) ? rec.aliases[lang] : [];
    for (const form of [rec.names?.[lang], rec.plural?.[lang], ...aliases]) {
      if (typeof form !== "string") continue;
      const key = form.split(/\s+/).map(foldWord).filter(Boolean).join(" ");
      if (!key || byName.has(key)) continue;
      byName.set(key, rec.id);
      maxWords = Math.max(maxWords, key.split(" ").length);
    }
  }
  return { byName, byId, maxWords };
}

/**
 * Ein einzelnes Wort: als „…zehe(n)“ (→ Einheit clove), genau oder mit abgeschnittener Plural-Endung.
 * Die Zehe kommt zuerst: „Knoblauchzehen“ steht im Stamm auch als Alias, die Einheit darf dabei nicht verloren gehen.
 */
function lookupWord(word, index) {
  const clove = word.match(CLOVE_RE);
  if (clove && index.byName.has(clove[1])) return { ing: index.byName.get(clove[1]), unit: "clove" };
  if (index.byName.has(word)) return { ing: index.byName.get(word) };
  for (const end of PLURAL_ENDINGS) {
    const stem = word.slice(0, -end.length);
    if (word.endsWith(end) && stem.length >= 4 && index.byName.has(stem)) return { ing: index.byName.get(stem) };
  }
  return null;
}

/**
 * Längster Name in einer Wortfolge; bei gleicher Länge der früheste.
 * anchored: der Name muss mit dem ersten Wort beginnen (für die Frage „ist dieses Stück eine Zutat?“).
 * @returns {{ ing, unit?, from, to } | null}
 */
function findName(words, index, anchored = false) {
  const lastStart = anchored ? 0 : words.length - 1;
  for (let n = Math.min(index.maxWords, words.length); n >= 1; n--) {
    for (let from = 0; from <= lastStart && from + n <= words.length; from++) {
      const slice = words.slice(from, from + n);
      if (slice.some((w) => !w)) continue;
      const hit = n === 1 ? lookupWord(slice[0], index) : (index.byName.has(slice.join(" ")) ? { ing: index.byName.get(slice.join(" ")) } : null);
      if (hit) return { ...hit, from, to: from + n };
    }
  }
  return null;
}

/** Teilt an `sep` außerhalb von Klammern. sep: "," oder eine Menge ganzer Wörter ("und", "&"). */
function splitTop(s, isSep) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const len = isSep(s, i);
      if (len) { out.push(s.slice(start, i)); start = i + len; i = start - 1; }
    }
  }
  out.push(s.slice(start));
  return out;
}
const isComma = (s, i) => (s[i] === "," ? 1 : 0);
const isConj = (s, i) => {
  if (s[i] !== " ") return 0;
  if (s.startsWith(" und ", i)) return 5;
  if (s.startsWith(" & ", i)) return 3;
  return 0;
};

const clean = (s) => s.replace(/🛒/g, "").replace(/\s+/g, " ").trim();
/** Kopf eines Stücks: Text vor der ersten Klammer bzw. dem ersten Komma, ohne führende Menge + Einheit. */
function headWords(piece) {
  const item = parseIngredient(clean(piece)).item;
  const cut = item.search(/[(,]/);
  return (cut < 0 ? item : item.slice(0, cut)).split(/\s+/).filter(Boolean);
}
/** Ist dieses Stück für sich eine Zutat (Name gleich am Anfang)? */
const isIngredient = (piece, index) => !!findName(headWords(piece).map(foldWord), index, true);

/** Zeile → Stücke, je eines pro Zutat. Getrennt wird nur, wenn JEDES Stück eine Zutat ist. */
function splitParts(body, index) {
  const parts = [];
  for (const numbered of splitLine(body)) {
    // „Salz, Pfeffer, Öl“ / „600ml Milch, Muskat“: Kommaliste. Sonst beginnt am Komma die Zubereitung.
    const segs = splitTop(numbered, isComma).map((x) => x.trim());
    const list = segs.length > 1 && segs.every((x) => x && isIngredient(x, index));
    for (const seg of list ? segs : [numbered]) {
      // „Feta und Petersilie“ → zwei; „Erbsen & Karotten“ (ein Name im Stamm) bleibt eins.
      const head = seg.slice(0, (seg + "(").search(/[(,]/));
      const sides = splitTop(head, isConj);
      const whole = findName(headWords(head).map(foldWord), index);
      const spansConj = whole && headWords(head).slice(whole.from, whole.to).some((w) => w === "&" || fold(w) === "und");
      if (sides.length > 1 && !spansConj && sides.every((x) => x.trim() && isIngredient(x, index))) {
        const rest = seg.slice(head.length);
        sides.forEach((x, i) => parts.push(i === sides.length - 1 ? x + rest : x));
      } else parts.push(seg);
    }
  }
  return parts;
}

/** Ein Stück → Felder des Items (ohne text/group/buy/optional) oder null, wenn keine Zutat passt. */
function readPart(part, index) {
  const p = parseIngredient(clean(part));
  let rest = p.item.replace(OPTIONAL_BRACKET_RE, " ");
  let unit = p.unit ? unitFromText(p.unit) : null;

  // Regel 2: Gewicht in Klammern neben einer anderen Einheit („1 Päckchen Trockenhefe (7g)“)
  let bracketG = null;
  const bw = rest.match(BRACKET_WEIGHT_RE);
  if (bw && p.amount !== null && UNITS[unit]?.kind !== "mass") {
    bracketG = parseFloat(bw[1].replace(",", ".")) * UNITS[bw[2].toLowerCase()].factor;
    rest = rest.replace(bw[0], " ");
  }

  const cut = rest.search(/[(,]/);
  let head = cut < 0 ? rest : rest.slice(0, cut);
  const tail = (cut < 0 ? "" : rest.slice(cut)).replace(/^\s*,\s*/, "").replace(/\s+/g, " ").trim();

  // Alternative: „Buttermilch oder Joghurt“ → erste Option; der Rest bleibt Text.
  let alt = "";
  const or = head.search(/\s+oder\s+/);
  if (or >= 0) { alt = head.slice(or).trim(); head = head.slice(0, or); }

  let words = head.split(/\s+/).filter(Boolean);
  let hit = findName(words.map(foldWord), index);
  if (!hit && alt) {
    // geteiltes Hauptwort: „rote oder weiße Bohnen“ → „rote Bohnen“
    const shared = alt.split(/\s+/).slice(2);
    const joined = [...words, ...shared];
    hit = findName(joined.map(foldWord), index);
    if (hit && hit.to > words.length) { words = joined; alt = alt.split(/\s+/).slice(0, 2).join(" "); }
    else hit = null;
  }
  if (!hit) return null;

  const out = { ing: hit.ing };
  if (p.amount !== null) {
    out.amount = p.amount;
    if (p.amountHigh !== null) out.amountMax = p.amountHigh;
    if (!p.unit) unit = hit.unit || "piece";
    if (unit) out.unit = unit;
    // Regel 1: Gewicht steht da · Regel 2: Gewicht in Klammern
    if (UNITS[unit]?.kind === "mass") out.g = round(p.amount * UNITS[unit].factor);
    else if (bracketG !== null) out.g = round(bracketG);
  }
  const prep = [...words.slice(0, hit.from), ...words.slice(hit.to), alt, tail].filter(Boolean).join(" ");
  if (prep) out.prep = prep;
  return out;
}

/**
 * Zerlegt eine Zutatenzeile in Items der Form von ADR-R1 §5:
 * { text, ing?, amount?, amountMax?, unit?, g?, group?, prep?, buy, optional }.
 * `text` ist immer der unveränderte Eingabe-String; eine Zeile kann mehrere Items ergeben.
 * Passt irgendein Stück zu keiner Zutat, kommt EIN Item nur mit text (+ buy/optional) zurück.
 */
export function matchLine(text, index) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const line = { buy: /🛒/.test(raw), optional: /\boptional\b/i.test(raw) };
  const free = [{ text: raw, ...line }];
  if (!index?.byName?.size || !clean(raw)) return free;

  let body = raw.trim(), group = null;
  const g = body.match(GROUP_RE);
  if (g) { group = g[1]; body = g[2]; }

  const parts = splitParts(body, index);
  // Ein 🛒 nur am letzten Stück gilt für alle (wie splitLine); sonst zählt die Marke je Stück.
  const marked = parts.map((x) => /🛒/.test(x));
  const allBuy = marked[marked.length - 1] && !marked.slice(0, -1).some(Boolean);

  const items = [];
  for (let i = 0; i < parts.length; i++) {
    const f = readPart(parts[i], index);
    if (!f) return free;
    const it = { text: raw, ing: f.ing };
    for (const k of ["amount", "amountMax", "unit", "g"]) if (f[k] !== undefined) it[k] = f[k];
    if (group) it.group = group;
    if (f.prep) it.prep = f.prep;
    it.buy = parts.length > 1 ? allBuy || marked[i] : line.buy;
    it.optional = line.optional;
    items.push(it);
  }
  return items;
}

/**
 * Gewicht eines Items in der Basis-Einheit der Zutat (g, bei `base: "ml"` ml) oder null.
 * Reihenfolge ADR-R1 §4, erster Treffer gewinnt: Gewicht in der Zeile → Klammergewicht (beides
 * steht als `g` am Item) → `units` der Zutat → Volumen mit `density` oder `base: "ml"` → null.
 * Bereiche rechnen mit der Untergrenze (`amount`).
 * @param master Stamm-Datei, nackte Liste oder ein Index aus buildIndex
 */
export function gramsOf(item, master) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.g === "number" && Number.isFinite(item.g)) return item.g;
  const { amount, unit } = item;
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Object.hasOwn(UNITS, unit ?? "")) return null;
  const u = UNITS[unit];
  if (u.kind === "mass") return round(amount * u.factor);

  const rec = master?.byId instanceof Map ? master.byId.get(item.ing) : listOf(master).find((r) => r && r.id === item.ing);
  if (!rec) return null;
  const own = rec.units && Object.hasOwn(rec.units, unit) ? rec.units[unit] : null;
  if (typeof own === "number" && own > 0) return round(amount * own);
  if (u.kind === "volume") {
    if (rec.base === "ml") return round(amount * u.factor);
    if (typeof rec.density === "number" && rec.density > 0) return round(amount * u.factor * rec.density);
    return null;
  }
  if (u.kind === "vague") return round(amount * u.factor); // Prise: fest 0,5 g
  return null;
}
