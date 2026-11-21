// moveFile.js — P5 (#108): Umzugs-Datei für den Wechsel auf die neue Adresse (5. Dez.).
// IndexedDB und localStorage gehören zur Adresse (Origin): was Drive nicht trägt, wäre nach der
// Weiterleitung weg. Auf der alten Adresse exportieren, auf der neuen importieren.
//
// Rein: kein DOM, kein IndexedDB, kein localStorage. Lesen/Schreiben läuft über übergebene
// Funktionen (collectValues / writeValues), damit Node-Tests alles prüfen können.
//
// Was in der Datei steht, regelt allein ENTRIES (Erlaubnisliste). Bewusst NIE dabei:
//   kochv2_apikey (Anthropic-Schlüssel), kochv2_token / kochv2_connected (Google-Anmeldung),
//   koch.supabase (Entwickler-Weiche) — und die Rezepte (trägt Drive; vorher synchronisieren).
// Bewusst dabei (Marcel, 21.11.): das Besitzer-Token des Freunde-Links, damit der Link nach dem
// Umzug weiter funktioniert. Deshalb ist die Datei privat (Hinweis in der Oberfläche).
//
// Import-Regel (Marcel, 21.11.): leere Speicher werden gefüllt; ein Speicher, der auf der neuen
// Adresse schon andere Daten hat, wird nur nach Rückfrage ersetzt. Einkaufsliste und
// KI-Verbrauch werden stattdessen verlustfrei zusammengeführt (keine Rückfrage nötig).

import { DEFAULT_PROFILE } from "../ai/prompts.js";
import { CHAT_MODELS, CHAT_MODEL_SUCCESSORS } from "../ai/models.js";
import { LANGS } from "../i18n.js";
import { SORTS } from "../features/cookbook/filter.js";
import { sanitizeItem } from "./listFile.js";
import { adoptLegacy, mergeList, sameItems } from "../features/shopping/listMerge.js";

export const MOVE_KIND = "citchen-move";
export const MOVE_VERSION = 1;
export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_USAGE = 500; // wie ai/usage.js MAX_ENTRIES

/** Datei abgelehnt (nichts wird importiert). code → UI-Text settings.move.err.<code>. */
export class MoveRejected extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MoveRejected";
    this.code = code;
  }
}

/* ---------- Prüfer: Wert → bereinigter Wert | undefined (verwerfen) ---------- */

const isStr = (v) => typeof v === "string";
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v, max) => (isStr(v) && v.length <= max ? v : undefined);
const nonEmpty = (v, max) => (isStr(v) && v.trim() !== "" && v.length <= max ? v : undefined);
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** Liste prüfen: kein Array oder zu lang → verwerfen; einzelne kaputte Einträge fallen raus. */
function list(v, max, each) {
  if (!Array.isArray(v) || v.length > max) return undefined;
  const out = [];
  for (const x of v) { const y = each(x); if (y !== undefined) out.push(y); }
  return out;
}

const strList = (max, maxLen) => (v) => list(v, max, (x) => nonEmpty(x, maxLen));

function pantryItem(x) {
  if (!isObj(x) || nonEmpty(x.name, 200) === undefined || typeof x.on !== "boolean") return undefined;
  const out = { name: x.name, cat: str(x.cat, 80) || "Sonstiges", on: x.on };
  if (x.custom === true) out.custom = true;
  return out;
}

function fridgeItem(x) {
  if (!isObj(x) || nonEmpty(x.name, 200) === undefined) return undefined;
  const out = { name: x.name, menge: str(x.menge, 80) || "" };
  if (str(x.icon, 16)) out.icon = x.icon;
  return out;
}

function profile(v) {
  if (!isObj(v)) return undefined;
  const out = {};
  for (const k of Object.keys(DEFAULT_PROFILE)) if (str(v[k], 2000) !== undefined) out[k] = v[k];
  return Object.keys(out).length ? out : undefined;
}

function planDay(x) {
  if (!isObj(x) || nonEmpty(x.day, 10) === undefined) return undefined;
  if (!(x.recipeId === null || nonEmpty(x.recipeId, 100) !== undefined)) return undefined;
  const out = { day: x.day, recipeId: x.recipeId };
  if (str(x.slot, 20)) out.slot = x.slot;
  if (nonEmpty(x.leftoverOf, 10)) out.leftoverOf = x.leftoverOf;
  if (x.locked === true) out.locked = true;
  return out;
}

function plan(v) {
  if (!isObj(v)) return undefined;
  const days = list(v.days, 14, planDay);
  if (!days || !days.length) return undefined;
  const out = { days };
  if (str(v.weekOf, 40)) out.weekOf = v.weekOf;
  if (str(v.createdAt, 40)) out.createdAt = v.createdAt;
  return out;
}

function shoppingList(v) {
  const items = list(v, 5000, (x) => sanitizeItem(x) || undefined);
  return items ? adoptLegacy(items) : undefined;
}

function shoppingLink(v) {
  if (!isObj(v) || typeof v.linked !== "boolean") return undefined;
  const fileId = isStr(v.fileId) && DRIVE_ID.test(v.fileId) ? v.fileId : null;
  const ownFileId = isStr(v.ownFileId) && DRIVE_ID.test(v.ownFileId) ? v.ownFileId : null;
  if (!fileId && !ownFileId) return undefined;
  if (v.linked && !fileId) return undefined;
  return { fileId, ownFileId, linked: v.linked };
}

function friendsLink(v) {
  if (!isObj(v) || !isStr(v.ownerToken) || !/^[0-9a-f]{32,128}$/.test(v.ownerToken)) return undefined;
  if (!isStr(v.invite) || !/^[A-Za-z0-9_-]{8,200}$/.test(v.invite)) return undefined;
  return {
    ownerToken: v.ownerToken,
    invite: v.invite,
    ownerName: str(v.ownerName, 80) || "",
    seen: list(v.seen, 5000, (x) => nonEmpty(x, 200)) || [],
    published: "", // Schaufenster wird auf der neuen Adresse neu veröffentlicht
  };
}

function portions(v) {
  if (!isObj(v)) return undefined;
  const keys = Object.keys(v);
  if (keys.length > 2000) return undefined;
  const out = {};
  for (const k of keys) if (k.length <= 100 && isNum(v[k]) && v[k] > 0 && v[k] <= 100) out[k] = v[k];
  return out;
}

function usageEntry(x) {
  if (!isObj(x) || nonEmpty(x.t, 40) === undefined) return undefined;
  const out = { t: x.t, a: str(x.a, 40) || "other", m: str(x.m, 100) || "" };
  for (const k of ["in", "out", "cr", "cw", "wf"]) out[k] = isNum(x[k]) && x[k] > 0 ? x[k] : 0;
  return out;
}

const MODEL_IDS = [...CHAT_MODELS.map((m) => m.id), ...Object.keys(CHAT_MODEL_SUCCESSORS)];
const oneOf = (allowed) => (v) => (allowed.includes(v) ? v : undefined);

/* ---------- Zusammenführen (ohne Rückfrage, verlustfrei) ---------- */

function mergeShopping(current, incoming) {
  const merged = mergeList(current, incoming);
  return sameItems(merged, current) ? current : merged;
}

function mergeUsage(current, incoming) {
  const seen = new Set();
  const all = [];
  for (const e of [...current, ...incoming]) {
    const k = JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); all.push(e); }
  }
  all.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return all.slice(-MAX_USAGE);
}

/* ---------- Die Erlaubnisliste ---------- */

/**
 * name    — Feld in data{} der Datei
 * section — Gruppe für die Rückfrage (UI-Text settings.move.section.<section>)
 * src     — woher: { kv } (IndexedDB kv) · { ls, json? } (localStorage) · { store, id } (IndexedDB-Store)
 * check   — Prüfer für Export UND Import (dieselbe Regel in beide Richtungen)
 * merge   — statt Rückfrage zusammenführen: (aktuell, Datei) → Ergebnis
 */
export const ENTRIES = Object.freeze([
  { name: "pantry", section: "lager", src: { kv: "lagerPantry" }, check: (v) => list(v, 2000, pantryItem) },
  { name: "fridge", section: "lager", src: { kv: "lagerFridge" }, check: (v) => list(v, 2000, fridgeItem) },
  { name: "profile", section: "profile", src: { kv: "cookProfile" }, check: profile },
  { name: "instructions", section: "instructions", src: { kv: "assistantInstructions" }, check: (v) => nonEmpty(v, 50000) },
  { name: "plan", section: "planner", src: { store: "plans", id: "current" }, check: plan },
  { name: "plannerRecent", section: "planner", src: { kv: "plannerRecent" }, check: strList(50, 100) },
  { name: "plannerLeftovers", section: "planner", src: { kv: "plannerLeftovers" }, check: (v) => (typeof v === "boolean" ? v : undefined) },
  { name: "shoppingList", section: "shopping", src: { store: "lists", id: "current" }, check: shoppingList, merge: mergeShopping },
  { name: "shoppingLink", section: "shoppingLink", src: { kv: "listMeta" }, check: shoppingLink },
  { name: "friendsLink", section: "friends", src: { kv: "friendInbox" }, check: friendsLink },
  { name: "matches", section: "matches", src: { kv: "matches" }, check: strList(5000, 100) },
  { name: "theme", section: "prefs", src: { kv: "theme" }, check: oneOf(["system", "light", "dark"]) },
  { name: "language", section: "prefs", src: { ls: "kochv2_lang" }, check: oneOf(LANGS.map((l) => l.code)) },
  { name: "model", section: "prefs", src: { ls: "kochv2_model" }, check: oneOf(MODEL_IDS) },
  { name: "cookbookSort", section: "prefs", src: { ls: "kochv2_sort" }, check: oneOf(SORTS) },
  { name: "shopSort", section: "prefs", src: { kv: "shopSort" }, check: oneOf(["aisle", "alpha"]) },
  { name: "cookPortions", section: "prefs", src: { ls: "kochv2_cookPortions", json: true }, check: portions },
  { name: "aiUsage", section: "usage", src: { ls: "kochv2_usage", json: true }, check: (v) => list(v, MAX_USAGE, usageEntry), merge: mergeUsage },
]);

const BY_NAME = new Map(ENTRIES.map((e) => [e.name, e]));

/* ---------- Lesen/Schreiben über übergebene Funktionen ---------- */

/**
 * Werte für alle ENTRIES lesen. io = { kvGet(key), lsGet(key), storeGet(store, id) } (dürfen async sein).
 * → { [name]: Rohwert } — nur, was gespeichert ist (fehlend = nicht im Ergebnis).
 */
export async function collectValues(io) {
  const out = {};
  for (const e of ENTRIES) {
    let v;
    if (e.src.kv) v = await io.kvGet(e.src.kv);
    else if (e.src.ls) {
      const raw = await io.lsGet(e.src.ls);
      if (raw === null || raw === undefined) v = undefined;
      else if (e.src.json) { try { v = JSON.parse(raw); } catch (err) { v = undefined; } }
      else v = raw;
    } else {
      const row = await io.storeGet(e.src.store, e.src.id);
      if (row && e.src.store === "lists") v = row.items;
      else if (row) { const { id, ...rest } = row; v = rest; }
    }
    if (v !== undefined && v !== null) out[e.name] = v;
  }
  return out;
}

/** Werte schreiben. io = { kvSet(key, v), lsSet(key, string), storePut(store, row) }. */
export async function writeValues(values, io, now = new Date().toISOString()) {
  for (const [name, v] of Object.entries(values)) {
    const e = BY_NAME.get(name);
    if (!e) continue;
    if (e.src.kv) await io.kvSet(e.src.kv, v);
    else if (e.src.ls) await io.lsSet(e.src.ls, e.src.json ? JSON.stringify(v) : v);
    else if (e.src.store === "lists") await io.storePut("lists", { id: e.src.id, items: v, updated: now });
    else await io.storePut(e.src.store, { ...v, id: e.src.id });
  }
}

/* ---------- Datei bauen / lesen ---------- */

/** values (aus collectValues) → Umzugs-Datei. Nur ENTRIES, jedes geprüft; Unbekanntes fällt weg. */
export function buildMoveFile(values, { now = new Date(), from = "" } = {}) {
  const data = {};
  for (const e of ENTRIES) {
    if (!values || !(e.name in values)) continue;
    const v = e.check(values[e.name]);
    if (v !== undefined) data[e.name] = v;
  }
  return { kind: MOVE_KIND, version: MOVE_VERSION, created: new Date(now).toISOString(), from: String(from || ""), data };
}

/** Dateiname: citchen-umzug-JJJJ-MM-TT.json */
export function moveFileName(date = new Date()) {
  return `citchen-umzug-${new Date(date).toISOString().slice(0, 10)}.json`;
}

/**
 * Text einer Umzugs-Datei prüfen (fremder Kanal). Wirft MoveRejected (code) bei falscher Form;
 * sonst → { data, dropped: [Namen, die verworfen wurden] }.
 */
export function parseMoveFile(text) {
  if (!isStr(text)) throw new MoveRejected("notText", "Datei ist kein Text");
  if (text.length > MAX_BYTES) throw new MoveRejected("tooBig", "Datei größer als 2 MB");
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new MoveRejected("notJson", "Datei ist kein gültiges JSON"); }
  if (!isObj(raw) || raw.kind !== MOVE_KIND) throw new MoveRejected("notMove", "Keine Umzugs-Datei");
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new MoveRejected("notMove", "Version fehlt");
  if (raw.version > MOVE_VERSION) throw new MoveRejected("newer", `Version ${raw.version} ist neuer als ${MOVE_VERSION}`);
  if (!isObj(raw.data)) throw new MoveRejected("notMove", "data fehlt");
  const data = {};
  const dropped = [];
  for (const [name, v] of Object.entries(raw.data)) {
    const e = BY_NAME.get(name);
    const ok = e ? e.check(v) : undefined;
    if (ok === undefined) dropped.push(name);
    else data[name] = ok;
  }
  return { data, dropped };
}

/* ---------- Import-Entscheidung ---------- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * incoming (geprüfte data) + current (collectValues der neuen Adresse) →
 *   { fill: {name: v}      — Speicher leer: wird ohne Frage geschrieben
 *     merge: {name: v}     — zusammengeführt (Einkaufsliste, KI-Verbrauch): ohne Frage
 *     replace: {name: v}   — Speicher hat ANDERE Daten: nur nach Rückfrage
 *     conflicts: [section] — Gruppen für die Rückfrage, in ENTRIES-Reihenfolge
 *     unchanged: [name] }
 * Ein gespeicherter Wert, der die Prüfung nicht besteht, gilt als leer.
 */
export function planMoveImport(incoming, current = {}) {
  const fill = {}, merge = {}, replace = {}, unchanged = [];
  const conflicts = [];
  for (const e of ENTRIES) {
    if (!(e.name in incoming)) continue;
    const inc = incoming[e.name];
    const cur = e.name in current ? e.check(current[e.name]) : undefined;
    if (cur === undefined) { fill[e.name] = inc; continue; }
    if (same(cur, inc)) { unchanged.push(e.name); continue; }
    if (e.merge) {
      const m = e.merge(cur, inc);
      if (same(m, cur)) unchanged.push(e.name); else merge[e.name] = m;
      continue;
    }
    replace[e.name] = inc;
    if (!conflicts.includes(e.section)) conflicts.push(e.section);
  }
  return { fill, merge, replace, conflicts, unchanged };
}

/** Was geschrieben wird: immer fill + merge; replace nur, wenn der Nutzer zugestimmt hat. */
export function writesFor(plan, replaceExisting) {
  return { ...plan.fill, ...plan.merge, ...(replaceExisting ? plan.replace : {}) };
}

/* ---------- Hinweis vor dem Export ---------- */

/**
 * Rezepte trägt Drive, nicht die Umzugs-Datei. → null (alles auf Drive) | "dirty" (Änderungen noch
 * nicht auf Drive, verbunden → zuerst synchronisieren) | "local" (nicht mit Drive verbunden).
 */
export function exportWarning(meta, signedIn) {
  if (!signedIn) return "local";
  return meta && meta.dirty ? "dirty" : null;
}
