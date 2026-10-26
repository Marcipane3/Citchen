// listFile.js — T10 (AR-11, DG-14): der Vertrag für einkaufsliste.json, beim Lesen geprüft.
// Die Datei kann auch ein Partner (und jeder, mit dem er sie teilt) beschreiben — sie ist also
// nur halb vertrauenswürdig. Rein: keine Imports außer listMerge.js, kein I/O (Node-testbar).
//
// Format (Version 1, dokumentiert in SCHEMA.md → „einkaufsliste.json“):
//   { version: 1, updated: ISO, prunedBefore?: ISO, items: [ { id, name, … } ] }
// - Kein Objekt / `items` kein Array / `version` > 1 → ABGELEHNT (ListRejected): die lokale Liste
//   bleibt, die Datei wird NICHT überschrieben (früher: still durch die lokale Liste ersetzt).
// - Einzelne Artikel werden repariert (Typen, Längen) oder verworfen (kein Name) — mit Notiz,
//   dann wird die reparierte Datei einmal zurückgeschrieben.
// - Artikel ohne id (Altbestand vor v2.11) bekommen eine stabile id (T4, listMerge.adoptLegacy).

import { adoptLegacy, LEGACY_STAMP } from "../features/shopping/listMerge.js";

export const LIST_VERSION = 1;

/** Die Drive-Datei wird nicht übernommen (Status „rejected“, nichts wird geschrieben). */
export class ListRejected extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ListRejected";
    this.code = code;
    this.rejected = true;
  }
}

const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const MAX_NAME = 200, MAX_SHORT = 80, MAX_ICON = 16, MAX_ID = 100;

/**
 * Einen Artikel prüfen. → null (verwerfen) | dasselbe Objekt (in Ordnung) | eine reparierte Kopie.
 * Unbekannte Felder bleiben erhalten (ein neuerer Build darf mehr speichern).
 */
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const deleted = raw.deleted === true;
  const nameOk = isStr(raw.name) && raw.name.trim() !== "";
  const idOk = isStr(raw.id) && raw.id !== "" && raw.id.length <= MAX_ID;
  if (!nameOk && !deleted) return null;   // ein offener Artikel ohne Namen ist nichts
  if (!idOk && !nameOk) return null;      // ohne id UND ohne Namen nicht zuzuordnen
  const fix = {};
  if (raw.id !== undefined && !idOk) fix.id = undefined;
  if (!isStr(raw.name)) fix.name = "";
  else if (raw.name.length > MAX_NAME) fix.name = raw.name.slice(0, MAX_NAME);
  if (raw.nameDe !== undefined && !(isStr(raw.nameDe) && raw.nameDe.length <= MAX_NAME)) fix.nameDe = undefined;
  if (raw.updated !== undefined && !isStr(raw.updated)) fix.updated = LEGACY_STAMP;
  if (raw.deleted !== undefined && typeof raw.deleted !== "boolean") fix.deleted = deleted;
  if (raw.done !== undefined && typeof raw.done !== "boolean") fix.done = raw.done === true;
  if (raw.qty !== undefined && !(isNum(raw.qty) && raw.qty >= 0)) fix.qty = 1;
  if (raw.amount !== undefined && raw.amount !== null && !isNum(raw.amount)) fix.amount = null;
  if (raw.unit !== undefined && raw.unit !== null && !(isStr(raw.unit) && raw.unit.length <= MAX_SHORT)) fix.unit = null;
  if (raw.cat !== undefined && !(isStr(raw.cat) && raw.cat.length <= MAX_SHORT)) fix.cat = "Sonstiges";
  if (raw.icon !== undefined && !(isStr(raw.icon) && raw.icon.length <= MAX_ICON)) fix.icon = undefined;
  if (raw.author !== undefined && !(isStr(raw.author) && raw.author.length <= MAX_SHORT)) fix.author = undefined;
  if (raw.sources !== undefined && !Array.isArray(raw.sources)) fix.sources = undefined;
  // v2.16b (T9): Herkunft — Gerät, das die Zeile angelegt hat, und „aus dem Wochenplan“
  if (raw.by !== undefined && !(isStr(raw.by) && raw.by.length <= MAX_SHORT)) fix.by = undefined;
  if (raw.plan !== undefined && typeof raw.plan !== "boolean") fix.plan = undefined;
  // v2.15.3 (T5): weitere Mengen in anderer Einheit — [{amount: Zahl, unit: Text|null}]
  if (raw.more !== undefined && !(Array.isArray(raw.more) && raw.more.length <= 10
    && raw.more.every((p) => p && isNum(p.amount) && (p.unit === null || (isStr(p.unit) && p.unit.length <= MAX_SHORT))))) fix.more = undefined;
  if (!Object.keys(fix).length) return raw;
  const out = { ...raw, ...fix };
  for (const k of Object.keys(fix)) if (fix[k] === undefined) delete out[k];
  return out;
}

/**
 * Die gelesene Drive-Datei prüfen. Wirft ListRejected bei falscher Form; sonst
 * → { items, legacy, notes, prunedBefore }
 *   items  — geprüfte Artikel (Altbestand schon mit stabiler id)
 *   legacy — die Artikel davon, die ohne id kamen (T4: ihre Kopien werden aufgeräumt)
 *   notes  — was repariert/verworfen wurde (leer = Datei war in Ordnung)
 */
export function inspectList(remote) {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) throw new ListRejected("shape", "Listen-Datei ist kein JSON-Objekt");
  if (remote.version !== undefined && !(isNum(remote.version) && remote.version <= LIST_VERSION)) {
    throw new ListRejected("version", `Listen-Datei hat Version ${JSON.stringify(remote.version)} (bekannt: ≤ ${LIST_VERSION})`);
  }
  if (!Array.isArray(remote.items)) throw new ListRejected("items", "Listen-Datei hat keine Artikel-Liste (items)");

  const notes = [];
  const checked = [];
  remote.items.forEach((raw, i) => {
    const it = sanitizeItem(raw);
    if (!it) { notes.push(`Artikel ${i} verworfen (kein Name)`); return; }
    if (it !== raw) notes.push(`Artikel ${i} repariert`);
    checked.push(it);
  });
  const items = adoptLegacy(checked);
  const legacy = items.filter((it, i) => it !== checked[i]);
  if (legacy.length) notes.push(`${legacy.length} Artikel ohne id → stabile id`);
  const prunedBefore = isStr(remote.prunedBefore) ? remote.prunedBefore : "";
  return { items, legacy, notes, prunedBefore };
}
