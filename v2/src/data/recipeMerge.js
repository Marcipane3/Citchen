// recipeMerge.js — v2.15.1 (T1/T12, T2): reine Logik für den sicheren Rezept-Sync. Keine I/O.
//
// Drei-Wege-Merge pro Rezept und Feld. „Basis“ = der Drive-Stand, auf den sich dieses Gerät beim
// letzten Abgleich geeinigt hat (in IndexedDB gemerkt). Damit lässt sich für jedes Feld sagen, WER
// es seitdem geändert hat:
//   nur lokal geändert  → lokal          nur auf Drive geändert → Drive (Projekt-Claude, v1, 2. Gerät)
//   beide gleich        → egal           beide verschieden       → lokal gewinnt („App gewinnt“, Marcel 2026-10-26)
// Rezept fehlt auf einer Seite: Löschen gilt nur, wenn die andere Seite das Rezept seit der Basis
// nicht geändert hat (Bearbeiten schlägt Löschen). Ohne Basis (erster Abgleich nach dem Update)
// wird nie gelöscht — beide Seiten werden vereinigt.
//
// checkInbound: Schutz gegen kaputte Dateien von externen Schreibern (DG-03, DG-05, DG-06).
// Strukturell kaputt ({} / null / recipes kein Array) → ok:false, die App fasst lokal nichts an.
// Einzelne kaputte Einträge werden gerettet statt die Sammlung zu kürzen: null fliegt raus,
// fehlende oder doppelte id bekommt eine neue id. Alles Gerettete steht in `repaired`.

import { loadCollection } from "./migrate.js";
import { makeIdFactory, withDefaults } from "./schema.js";

/** JSON mit sortierten Schlüsseln — Vergleich unabhängig von der Feld-Reihenfolge des Schreibers. */
export function stableStringify(v) {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

export const same = (a, b) => stableStringify(a) === stableStringify(b);

/** Kurzer Fingerabdruck (djb2) — merkt sich, welche kaputte Drive-Datei der Nutzer schon abgelehnt hat. */
export function fingerprint(value) {
  const s = typeof value === "string" ? value : stableStringify(value);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + s.length;
}

/**
 * Eingehende rezepte.json prüfen und retten.
 * → { ok:false, errors } | { ok:true, collection:{version, updated, recipes}, errors, repaired:[{id, why}] }
 */
export function checkInbound(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, errors: ["Keine Daten"] };
  if (!Array.isArray(json.recipes)) return { ok: false, errors: ["recipes fehlt oder ist kein Array"] };

  const repaired = [];
  const seen = new Map(); // id → Rezept
  const nextId = makeIdFactory(json.recipes.map((r) => r && typeof r === "object" ? r.id : null).filter(Boolean));
  const recipes = [];
  json.recipes.forEach((r, i) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) { repaired.push({ id: null, why: `Eintrag ${i} ist kein Rezept — entfernt` }); return; }
    if (typeof r.id !== "string" || !r.id.trim()) {
      const id = nextId();
      repaired.push({ id, why: `„${r.name || "?"}“ hatte keine id — neue id ${id}` });
      r = { ...r, id };
    } else if (seen.has(r.id)) {
      if (same(withDefaults(seen.get(r.id)), withDefaults(r))) { repaired.push({ id: r.id, why: `doppelte Kopie von ${r.id} — entfernt` }); return; }
      const id = nextId();
      repaired.push({ id, why: `doppelte id ${r.id} („${r.name || "?"}“) — neue id ${id}` });
      r = { ...r, id };
    }
    seen.set(r.id, r);
    recipes.push(r);
  });

  const { collection, report } = loadCollection({ ...json, recipes });
  return { ok: true, collection, errors: report.errors, repaired };
}

const byId = (list) => new Map((list || []).map((r) => [r.id, r]));

/** Felder eines Rezepts zusammenführen. b darf fehlen (dann gewinnt bei Unterschied lokal). */
function mergeFields(b, l, r) {
  const out = {};
  const clashes = [];
  const keys = [...new Set([...Object.keys(l), ...Object.keys(r)])];
  for (const k of keys) {
    const lv = l[k], rv = r[k], bv = b ? b[k] : undefined;
    let v;
    if (same(lv, rv)) v = lv;
    else if (b && same(lv, bv)) v = rv;       // nur Drive hat es geändert
    else if (b && same(rv, bv)) v = lv;       // nur lokal geändert
    else { v = lv; clashes.push(k); }         // beide → App gewinnt
    if (v !== undefined) out[k] = v;
  }
  return { recipe: out, clashes };
}

/**
 * Drei-Wege-Merge. base = null → Vereinigung ohne Löschen.
 * → { recipes, conflicts:[{id, fields}], removed:[ids aus lokal], added:[ids neu für lokal] }
 */
export function mergeRecipes({ base, local, remote }) {
  const B = base ? byId(base) : null;
  const L = byId(local), R = byId(remote);
  const conflicts = [];
  const keep = (id) => {
    const b = B ? B.get(id) : undefined, l = L.get(id), r = R.get(id);
    if (l && r) {
      if (same(l, r)) return l;
      const { recipe, clashes } = mergeFields(b, l, r);
      if (clashes.length && b) conflicts.push({ id, fields: clashes });
      return recipe;
    }
    if (l) return !b || !same(l, b) ? l : null;   // Drive hat gelöscht: nur wenn lokal unverändert
    if (!B || !b) return r;                       // neu auf Drive (oder keine Basis)
    return !same(r, b) ? r : null;                // lokal gelöscht: nur wenn Drive unverändert
  };

  const out = [];
  const done = new Set();
  const push = (id) => { if (done.has(id)) return; done.add(id); const x = keep(id); if (x) out.push(x); };
  // Neue lokale Rezepte zuerst (die App legt neue vorn an), dann Drive-Reihenfolge, dann Rest von lokal.
  for (const r of local || []) if (!R.has(r.id) && !(B && B.has(r.id))) push(r.id);
  for (const r of remote || []) push(r.id);
  for (const r of local || []) push(r.id);

  const outIds = new Set(out.map((r) => r.id));
  return {
    recipes: out,
    conflicts,
    removed: (local || []).filter((r) => !outIds.has(r.id)).map((r) => r.id),
    added: out.filter((r) => !L.has(r.id)).map((r) => r.id),
  };
}

/** Würde das Übernehmen so viele Rezepte löschen, dass gefragt werden muss? (≥ 5 oder ≥ 20 %, Marcel 2026-10-26) */
export function isMassDelete(removedCount, localCount) {
  return removedCount >= 5 || (localCount > 0 && removedCount / localCount >= 0.2);
}
