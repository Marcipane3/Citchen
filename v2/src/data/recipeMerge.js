// recipeMerge.js — v2.15.1 (Epic T): sichere Rezept-Synchronisation, reine Funktionen (kein I/O).
//
// T1 — Drei-Wege-Merge pro Rezept statt „ganze Datei überschreiben“:
//   Jedes Gerät merkt sich die BASIS = der Stand, auf den es sich zuletzt mit Drive geeinigt hat.
//   Beim Abgleich (und damit bei jedem Speichern) wird pro Rezept-id verglichen:
//     nur lokal geändert → lokal · nur auf Drive geändert (Claude, v1, anderes Gerät) → Drive ·
//     beide geändert → pro Feld zusammenführen (lokale Feldänderung gewinnt bei Gleichstand).
//   Neu hinzugefügte Rezepte beider Seiten bleiben; gelöscht wird nur, was die andere Seite
//   unverändert gelassen hat (Bearbeiten schlägt Löschen).
// T2 — Kaputte Drive-Dateien nie übernehmen:
//   inspectRemote() lehnt Dateien ohne Rezept-Liste / in neuerem Format ab und rettet einzelne
//   kaputte Einträge (fehlende oder doppelte id → neue id, null → verworfen), statt den lokalen
//   Bestand zu leeren.

import { SCHEMA_VERSION, withDefaults, makeIdFactory } from "./schema.js";

/** Fehler, bei dem die Drive-Datei NICHT übernommen werden darf (lokal bleibt alles). */
export class RemoteRejected extends Error {
  constructor(code, detail = "") { super(detail || code); this.code = code; this.rejected = true; }
}

/* ---------- T2: eingehende Datei prüfen ---------- */

/**
 * Prüft eine geparste rezepte.json, BEVOR irgendetwas lokal ersetzt wird.
 * → { collection: {version, updated, recipes}, notes: [string] } oder wirft RemoteRejected:
 *   "notObject"   — null, Zahl, Array …
 *   "noRecipes"   — kein `recipes`-Array (z. B. {} oder falscher Schlüssel)
 *   "newerFormat" — version > SCHEMA_VERSION (diese App versteht das Format nicht; nie überschreiben)
 * Einzelne kaputte Rezepte werden gerettet und in `notes` gemeldet, nie stillschweigend verloren.
 */
export function inspectRemote(json, { now = Date.now } = {}) {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new RemoteRejected("notObject");
  if (!Array.isArray(json.recipes)) throw new RemoteRejected("noRecipes");
  if (typeof json.version === "number" && json.version > SCHEMA_VERSION) throw new RemoteRejected("newerFormat", `version ${json.version}`);

  const notes = [];
  const valid = json.recipes.filter((r) => r && typeof r === "object" && !Array.isArray(r));
  if (valid.length !== json.recipes.length) notes.push(`${json.recipes.length - valid.length} leere Einträge verworfen`);

  const seen = new Set();
  const nextId = makeIdFactory(valid.map((r) => r.id).filter((id) => typeof id === "string"), now);
  const recipes = valid.map((r) => {
    let id = typeof r.id === "string" && r.id.trim() ? r.id : null;
    if (!id) { id = nextId(); notes.push(`Rezept „${r.name || "?"}“ ohne id → ${id}`); }
    else if (seen.has(id)) { const fresh = nextId(); notes.push(`doppelte id ${id} („${r.name || "?"}“) → ${fresh}`); id = fresh; }
    seen.add(id);
    return withDefaults({ ...r, id });
  });

  return {
    collection: {
      version: typeof json.version === "number" ? json.version : SCHEMA_VERSION,
      updated: typeof json.updated === "string" ? json.updated : null,
      recipes,
    },
    notes,
  };
}

/* ---------- T1: Drei-Wege-Merge ---------- */

/** Stabiler Vergleich (Schlüsselreihenfolge egal). */
export function sameRecipe(a, b) { return stable(a) === stable(b); }
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v);
}

/** Feldweise: was lokal gegenüber der Basis geändert wurde, gewinnt; sonst der Drive-Stand. */
function mergeFields(base, local, remote) {
  const out = {};
  for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const localChanged = !sameRecipe(local[k], base[k]);
    const v = localChanged ? local[k] : remote[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const byId = (list) => new Map((list || []).map((r) => [r.id, r]));
export const sameCollection = (a, b) => a.length === b.length && a.every((r, i) => b[i] && r.id === b[i].id && sameRecipe(r, b[i]));

/**
 * base   — letzter gemeinsamer Stand mit Drive (null = unbekannt, z. B. vor v2.15.1)
 * local  — lokale Sammlung · remote — geprüfte Drive-Sammlung (inspectRemote)
 * prefer — nur ohne Basis: wer bei Unterschieden gewinnt ("local" | "remote")
 * → { merged, removedRemotely: [ids lokal gelöscht, weil Drive sie löschte], conflicts: [ids beidseitig geändert] }
 *
 * Reihenfolge: neue lokale Rezepte vorn (App fügt vorn ein), danach die Drive-Reihenfolge,
 * dann übrige lokale. Ohne Basis wird nichts gelöscht (Vereinigung) — kein Datenverlust beim Umstieg.
 */
export function mergeRecipes({ base, local, remote, prefer = "remote" }) {
  const B = base ? byId(base) : null, L = byId(local), R = byId(remote);
  const merged = new Map();
  const removedRemotely = [], conflicts = [];

  const decide = (id) => {
    const b = B ? B.get(id) : undefined, l = L.get(id), r = R.get(id);
    if (l && r) {
      if (sameRecipe(l, r)) return l;
      if (!B || !b) return prefer === "local" ? l : r;
      if (sameRecipe(l, b)) return r;                 // nur Drive geändert
      if (sameRecipe(r, b)) return l;                 // nur lokal geändert
      conflicts.push(id);
      return mergeFields(b, l, r);                    // beide geändert → pro Feld
    }
    if (l) {                                          // fehlt auf Drive
      if (!B || !b) return l;                         // lokal neu (oder ohne Basis: behalten)
      if (sameRecipe(l, b)) { removedRemotely.push(id); return null; } // auf Drive gelöscht
      return l;                                       // lokal geändert schlägt Löschen
    }
    if (r) {                                          // fehlt lokal
      if (!B || !b) return r;                         // auf Drive neu (Claude, v1, anderes Gerät)
      if (sameRecipe(r, b)) return null;              // lokal gelöscht → bleibt gelöscht
      return r;                                       // auf Drive geändert schlägt Löschen
    }
    return null;
  };

  const order = [
    ...(local || []).filter((r) => !R.has(r.id) && !(B && B.has(r.id))).map((r) => r.id),
    ...(remote || []).map((r) => r.id),
    ...(local || []).map((r) => r.id),
  ];
  for (const id of order) {
    if (merged.has(id)) continue;
    const v = decide(id);
    merged.set(id, v);
  }
  return { merged: [...merged.values()].filter(Boolean), removedRemotely, conflicts };
}

/**
 * T2: Würde der Merge auffällig viele Rezepte lokal löschen (Drive-Datei verstümmelt?), muss
 * vorher gefragt werden. Schwelle: mehr als 3 und mehr als 20 % der Basis.
 */
export function suspiciousDrop(removedCount, baseCount) {
  return removedCount > 3 && removedCount > baseCount * 0.2;
}
