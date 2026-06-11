// derive.js — Deterministische In-Memory-Sichten auf das flache v3-Schema.
// NICHTS hiervon wird in rezepte.json zurückgeschrieben — die Datei bleibt v3-flach.
// Hier leben: Zeit-Parsing, strukturierte Tipps, Zutaten-Parsing (Mengen/Einheiten/🛒),
// Portionsskalierung und die tags-Sicht für Filter/Planer.

/* ---------- Zeit ---------- */

/**
 * Minuten aus Freitext lesen (v1-Parität fürs Timer-Parsing):
 * "12–15 Min" -> 15, "5 Min" -> 5, sonst null. Zusätzlich: "2 Std" -> 120.
 */
export function parseMinutes(text) {
  if (!text) return null;
  const m = String(text).match(/(\d+)\s*(?:[–\-]\s*(\d+)\s*)?Min/i);
  if (m) return parseInt(m[2] || m[1], 10);
  const h = String(text).match(/(\d+)\s*(?:[–\-]\s*(\d+)\s*)?Std/i);
  if (h) return parseInt(h[2] || h[1], 10) * 60;
  return null;
}

/** Gesamtminuten eines Rezepts: totalTime (Zahl) bevorzugt, sonst aus time-String. */
export function getTotalMinutes(r) {
  if (typeof r.totalTime === "number" && Number.isFinite(r.totalTime)) return r.totalTime;
  return parseMinutes(r.time);
}

/* ---------- Tags-Sicht (02_DATA_SCHEMA §4) ---------- */

/** Strukturierte tags-Sicht aus den flachen v3-Feldern. */
export function getTags(r) {
  return {
    effort: r.effort || null,                 // "alltag" | "besonders" | null
    cuisine: r.cuisine || null,
    mealPrep: r.mealPrep === true,
    toTry: r.toTry === true,
    season: r.season ? [r.season] : [],
    free: Array.isArray(r.tags) ? r.tags : [], // freie v3-Schlagworte
  };
}

/* ---------- Strukturierte Tipps (02_DATA_SCHEMA §3) ---------- */

// Labels, die in den Bestandsdaten vorkommen ("Topping: … Swap: … Alltags-Upgrade: … Technik: …")
const TIPP_LABELS = [
  { key: "toppings", re: /^Toppings?$/i },
  { key: "variationen", re: /^(Swap|Variante|Variation(en)?)$/i },
  { key: "alltagsUpgrade", re: /^Alltags[- ]?Upgrade$/i },
  { key: "technik", re: /^Technik$/i },
];

/**
 * Zerlegt den tips-String in eine strukturierte Sicht:
 * { toppings: [], variationen: [], alltagsUpgrade: "", technik: "", rest: "", raw: "" }
 * Best-effort: unbekannte/unlabelte Teile landen in rest (Anzeige-Fallback).
 */
export function parseTipps(tips) {
  const out = { toppings: [], variationen: [], alltagsUpgrade: "", technik: "", rest: "", raw: tips || "" };
  if (!tips || typeof tips !== "string") return out;

  // Segmente an "Label:" Grenzen schneiden. Label = 1–2 Wörter vor einem Doppelpunkt.
  const re = /(?:^|(?<=[.!?])\s+)([A-ZÄÖÜ][\wÄÖÜäöüß-]*(?:[- ][A-ZÄÖÜ][\wÄÖÜäöüß-]*)?):\s*/g;
  const segments = [];
  let lastLabel = null, lastIndex = 0, m;
  while ((m = re.exec(tips)) !== null) {
    if (m.index > lastIndex) segments.push({ label: lastLabel, text: tips.slice(lastIndex, m.index).trim() });
    lastLabel = m[1];
    lastIndex = re.lastIndex;
  }
  segments.push({ label: lastLabel, text: tips.slice(lastIndex).trim() });

  const restParts = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const hit = seg.label && TIPP_LABELS.find((l) => l.re.test(seg.label));
    if (!hit) {
      restParts.push(seg.label ? `${seg.label}: ${seg.text}` : seg.text);
    } else if (hit.key === "toppings" || hit.key === "variationen") {
      out[hit.key].push(seg.text);
    } else {
      out[hit.key] = out[hit.key] ? out[hit.key] + " " + seg.text : seg.text;
    }
  }
  out.rest = restParts.join(" ").trim();
  return out;
}

/** true, wenn parseTipps mindestens ein strukturiertes Feld gefüllt hat. */
export function hasStructuredTipps(parsed) {
  return parsed.toppings.length > 0 || parsed.variationen.length > 0 ||
    !!parsed.alltagsUpgrade || !!parsed.technik;
}

/* ---------- Zutaten: Parsing, 🛒, Skalierung ---------- */

// Einheiten, die direkt an der Zahl oder mit Leerzeichen folgen können.
const UNITS = [
  "kg", "g", "ml", "l", "EL", "TL", "Pck\\.?", "Päckchen", "Prise[n]?", "Dose[n]?",
  "Bund", "Zehe[n]?", "Stück", "Scheibe[n]?", "Tasse[n]?", "Becher", "Glas", "Würfel",
];
const UNIT_RE = new RegExp(`^(${UNITS.join("|")})\\b\\.?`, "i");

const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

function parseAmountToken(s) {
  // "1,5" | "1.5" | "400" | "½" | "1 ½"
  s = s.trim();
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/);
  if (m) return parseInt(m[1], 10) + FRACTIONS[m[2]];
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  m = s.match(/^(\d+(?:[.,]\d+)?)$/);
  if (m) return parseFloat(m[1].replace(",", "."));
  return null;
}

/**
 * Zerlegt eine Zutaten-Zeile (Freitext) in:
 * { raw, group, amount, amountHigh, unit, item, toBuy, optional }
 * - group:  "Teig" | "Belag" | "Streusel" | … (Prefix "Xyz: …"), sonst null
 * - amount: Zahl oder null (z.B. "Salz, Pfeffer, Öl" -> null)
 * - amountHigh: bei Bereichen "2–3 EL" die Obergrenze, sonst null
 * - toBuy:  true, wenn 🛒-Marker (SCHEMA.md-Konvention: nicht im Vorrat)
 */
export function parseIngredient(raw) {
  const out = {
    raw, group: null, amount: null, amountHigh: null, unit: null,
    item: "", toBuy: /🛒/.test(raw), optional: /\boptional\b/i.test(raw),
  };
  let s = raw.replace(/🛒/g, "").trim();

  // Gruppen-Prefix "Teig: 300g Mehl"
  const g = s.match(/^([A-ZÄÖÜ][\wÄÖÜäöüß-]{1,20}):\s+(.*)$/);
  if (g) { out.group = g[1]; s = g[2]; }

  // Menge (inkl. Bereich "12–15", Bruch "½", Komma "1,5")
  const a = s.match(/^((?:\d+\s*)?[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)\s*(?:[–\-]\s*(\d+(?:[.,]\d+)?))?\s*/);
  if (a && a[0].trim()) {
    out.amount = parseAmountToken(a[1]);
    if (a[2]) out.amountHigh = parseFloat(a[2].replace(",", "."));
    s = s.slice(a[0].length);
    // Einheit direkt nach der Zahl ("400g", "2 EL")
    const u = s.match(UNIT_RE);
    if (u) {
      out.unit = u[1].replace(/\.$/, "");
      s = s.slice(u[0].length).trim();
    }
  }
  out.item = s.trim();
  return out;
}

const METRIC_UNITS = /^(kg|g|ml|l)$/i;

function fmtAmount(n, { metric = false } = {}) {
  if (n === null || n === undefined) return "";
  if (!metric) {
    // Stück-Mengen: Brüche sind küchenüblich ("½ Zwiebel", "1 ½ Zehen")
    const whole = Math.floor(n + 1e-9);
    const frac = n - whole;
    const fracStr = Object.entries(FRACTIONS).find(([, v]) => Math.abs(v - frac) < 0.01);
    if (fracStr && frac > 0.01) return (whole ? whole + " " : "") + fracStr[0];
  }
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/**
 * Skaliert eine Zutaten-Zeile um factor und gibt den neuen Anzeige-String zurück.
 * Zeilen ohne erkennbare Menge bleiben unverändert ("Salz, Pfeffer, Öl").
 * Auch eingebettete Mengen in Klammern etc. werden NICHT angefasst — nur die führende Menge.
 */
export function scaleIngredient(raw, factor) {
  const p = parseIngredient(raw);
  if (p.amount === null) return raw;
  const metric = p.unit !== null && METRIC_UNITS.test(p.unit);
  const lead = fmtAmount(p.amount * factor, { metric }) +
    (p.amountHigh !== null ? "–" + fmtAmount(p.amountHigh * factor, { metric }) : "");
  const unitPart = p.unit ? (METRIC_UNITS.test(p.unit) ? p.unit : " " + p.unit) : "";
  const groupPart = p.group ? p.group + ": " : "";
  const buyPart = p.toBuy ? " 🛒" : "";
  // 🛒 stand evtl. mitten im String — wir hängen ihn normiert ans Ende (Konvention laut SCHEMA.md)
  const item = p.item ? " " + p.item : "";
  return `${groupPart}${lead}${unitPart}${item}${buyPart}`.replace(/\s+/g, " ").trim();
}

/**
 * Portionsfaktor aus servings-String ableiten: "~4" -> 4, "12 Stücke" -> 12.
 * Nicht-numerische Angaben ("1 Zucchini, 2 Paprika") -> null (Scaler zeigt dann nur Faktor).
 */
export function parseServings(servings) {
  if (typeof servings === "number") return servings;
  if (!servings) return null;
  const m = String(servings).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
