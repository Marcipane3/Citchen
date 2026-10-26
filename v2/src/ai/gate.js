// gate.js — BYOK-Gating. Der Schlüssel liegt NUR lokal (localStorage),
// wird nie nach Drive synchronisiert, nie geloggt und verlässt das Gerät
// ausschließlich Richtung api.anthropic.com (client.js).
// gate.isPremium() = Schlüssel vorhanden → KI-Features sichtbar.

import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "./models.js";

// Modell-IDs stehen seit v2.16 (Q1) nur noch in models.js.
export const MODELS = CHAT_MODELS;
export const DEFAULT_MODEL = DEFAULT_CHAT_MODEL;

const KEY_KEY = "kochv2_apikey";
const MODEL_KEY = "kochv2_model";

// In Node-Tests gibt es kein localStorage → In-Memory-Fallback (gleiche API).
const mem = new Map();
const store = (typeof localStorage !== "undefined")
  ? localStorage
  : { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

export function getKey() {
  try { return store.getItem(KEY_KEY) || ""; } catch (e) { return ""; }
}

export function setKey(key) {
  const k = (key || "").trim();
  try {
    if (k) store.setItem(KEY_KEY, k);
    else store.removeItem(KEY_KEY);
  } catch (e) { /* egal */ }
}

export function clearKey() { setKey(""); }

/** Premium = eigener Anthropic-Key vorhanden. Kein Key → Free-Tier, keine KI. */
export function isPremium() { return getKey().length > 0; }

/** Aktuell offline? (KI braucht Internet — Drive/Offline-Kern laufen weiter.) */
export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Warum sind KI-Funktionen gerade NICHT nutzbar? "" = nutzbar.
 * Reihenfolge: erst Key (dauerhaft), dann Netz (vorübergehend).
 * UI nutzt das, um KI-Einstiege ehrlich zu erklären statt sie nur fehlschlagen zu lassen.
 */
export function aiUnavailableReason() {
  if (!isPremium()) return "nokey";
  if (isOffline()) return "offline";
  return "";
}

/** Plausibilitätscheck fürs UI (kein echter Test — der geht über client.testKey). */
export function looksLikeKey(k) { return /^sk-ant-/.test((k || "").trim()); }

export function getModel() {
  try {
    const m = store.getItem(MODEL_KEY);
    return MODELS.some((x) => x.id === m) ? m : DEFAULT_MODEL;
  } catch (e) { return DEFAULT_MODEL; }
}

export function setModel(id) {
  if (MODELS.some((x) => x.id === id)) {
    try { store.setItem(MODEL_KEY, id); } catch (e) { /* egal */ }
  }
}
