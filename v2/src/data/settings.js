// settings.js — kleine Helfer für nutzereditierbare Einstellungen in IndexedDB
// (Vorratsliste, Theme). Der API-Key liegt bewusst NICHT hier (localStorage,
// gate.js) — die kv-Daten könnten später synchronisiert werden, der Key nie.

import * as db from "./db.js";
import { getInStock } from "./lager.js";
import { DEFAULT_PROFILE } from "../ai/prompts.js";

const THEME_KEY = "theme"; // "system" | "light" | "dark"
const PROFILE_KEY = "cookProfile"; // A3: nutzereditierbares Koch-Profil

export { DEFAULT_PROFILE };

/** Gespeichertes Profil über die Defaults gelegt (fehlende Felder = Default). */
export async function getProfile() {
  const saved = await db.kvGet(PROFILE_KEY, null);
  return { ...DEFAULT_PROFILE, ...(saved || {}) };
}

/** Nur bekannte Felder, getrimmt — speichert das Profil. */
export async function setProfile(profile) {
  const clean = {};
  for (const k of Object.keys(DEFAULT_PROFILE)) {
    const v = profile && profile[k] != null ? String(profile[k]).trim() : "";
    clean[k] = v;
  }
  await db.kvSet(PROFILE_KEY, clean);
  return clean;
}

/** Zurück auf Marcels Ausgangswerte. */
export async function resetProfile() {
  await db.kvDel(PROFILE_KEY);
  return { ...DEFAULT_PROFILE };
}

// Selbstverständliche Basics, die immer als "vorhanden" gelten (Öl/Wasser/Salz …).
const ALWAYS = ["Öl", "Olivenöl", "Wasser", "Salz", "Pfeffer"];

/**
 * Vorhandene Zutaten für die Einkaufslisten-Subtraktion: alles im Lager
 * (Vorrat on + Kühlschrank) plus selbstverständliche Basics.
 */
export async function getStaples() {
  const inStock = await getInStock();
  return [...new Set([...inStock, ...ALWAYS])];
}

export async function getTheme() {
  return db.kvGet(THEME_KEY, "system");
}

export async function setTheme(theme) {
  await db.kvSet(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme; // system
}

export async function initTheme() {
  applyTheme(await getTheme());
}
