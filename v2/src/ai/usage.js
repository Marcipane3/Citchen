// usage.js — v2.16 (Q3, Check C-10): echter Token-Verbrauch pro KI-Aktion, aus `response.usage`.
// Liegt NUR auf diesem Gerät (localStorage, wie der Schlüssel), wird nie synchronisiert und
// enthält keine Inhalte — nur Zeitpunkt, Aktion, Modell und Token-Zahlen. Quelle für die
// Zahlen im V3-Bericht (Kapitel 07) und später für die Ausgaben-Anzeige (C-24, v3.x).

import { PRICES } from "./models.js";

const LOG_KEY = "kochv2_usage";
export const MAX_ENTRIES = 500;  // älteste fallen raus

// In Node-Tests gibt es kein localStorage → In-Memory-Fallback (gleiche API, wie gate.js).
const mem = new Map();
const store = (typeof localStorage !== "undefined")
  ? localStorage
  : { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** API-`usage` → kompakte Zahlen. Fehlende Felder = 0 (ältere Modelle liefern keine Cache-Felder). */
export function normalizeUsage(u) {
  const x = u || {};
  return {
    in: num(x.input_tokens),
    out: num(x.output_tokens),
    cr: num(x.cache_read_input_tokens),
    cw: num(x.cache_creation_input_tokens),
    wf: num(x.server_tool_use && x.server_tool_use.web_fetch_requests),
  };
}

/** Zwei normalisierte Verbräuche addieren (pause_turn-Runden einer Aktion). */
export function addUsage(a, b) {
  return { in: a.in + b.in, out: a.out + b.out, cr: a.cr + b.cr, cw: a.cw + b.cw, wf: a.wf + b.wf };
}

/** Geschätzte Kosten in US-$ (Listenpreis). Unbekanntes Modell → null. */
export function costOf(model, u) {
  const p = PRICES[model];
  if (!p) return null;
  return (u.in * p.input + u.out * p.output + u.cw * p.cacheWrite + u.cr * p.cacheRead) / 1e6;
}

export function getUsageLog() {
  try {
    const arr = JSON.parse(store.getItem(LOG_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.a === "string") : [];
  } catch (e) { return []; }
}

/** Einen Aufruf protokollieren. Fehler beim Speichern sind egal — die KI-Antwort zählt. */
export function recordUsage({ action, model, usage, now = new Date().toISOString() }) {
  const entry = { t: now, a: action || "other", m: model || "", ...usage };
  try {
    const log = getUsageLog();
    log.push(entry);
    store.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)));
  } catch (e) { /* voll/gesperrt → nicht protokollieren */ }
  return entry;
}

export function clearUsage() {
  try { store.removeItem(LOG_KEY); } catch (e) { /* egal */ }
}

/**
 * Protokoll → eine Zeile pro Aktion (meiste Aufrufe zuerst) + Summe.
 * Jede Zeile: { action, calls, in, out, cr, cw, wf, cost, avgIn, avgOut, avgCost }
 * avgIn zählt alle Eingabe-Tokens (frisch + Cache gelesen + Cache geschrieben) — das ist, was
 * eine Aktion tatsächlich ans Modell schickt; der Cache-Anteil steht in cr/cw.
 */
export function summarizeUsage(entries) {
  const rows = new Map();
  const zero = (action) => ({ action, calls: 0, in: 0, out: 0, cr: 0, cw: 0, wf: 0, cost: 0, unpriced: 0 });
  const total = zero("total");
  for (const e of entries || []) {
    const u = normalizeEntry(e);
    const c = costOf(e.m, u);
    for (const r of [rows.get(e.a) || rows.set(e.a, zero(e.a)).get(e.a), total]) {
      r.calls++;
      r.in += u.in; r.out += u.out; r.cr += u.cr; r.cw += u.cw; r.wf += u.wf;
      if (c === null) r.unpriced++; else r.cost += c;
    }
  }
  const finish = (r) => ({
    ...r,
    avgIn: r.calls ? Math.round((r.in + r.cr + r.cw) / r.calls) : 0,
    avgOut: r.calls ? Math.round(r.out / r.calls) : 0,
    avgCost: r.calls ? r.cost / r.calls : 0,
  });
  return {
    rows: [...rows.values()].sort((a, b) => b.calls - a.calls || a.action.localeCompare(b.action)).map(finish),
    total: finish(total),
    since: (entries && entries.length) ? entries[0].t : "",
  };
}

function normalizeEntry(e) {
  return { in: num(e.in), out: num(e.out), cr: num(e.cr), cw: num(e.cw), wf: num(e.wf) };
}
