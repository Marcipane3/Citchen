// settings.js — kleine Helfer für nutzereditierbare Einstellungen in IndexedDB
// (Vorratsliste, Theme). Der API-Key liegt bewusst NICHT hier (localStorage,
// gate.js) — die kv-Daten könnten später synchronisiert werden, der Key nie.

import * as db from "./db.js";
import { getInStock } from "./lager.js";
import { GOAL_KEY, cleanGoal } from "./nutritionGoal.js";
import { DEFAULT_PROFILE, DEFAULT_INSTRUCTIONS } from "../ai/prompts.js";

const THEME_KEY = "theme"; // "system" | "light" | "dark"
const PROFILE_KEY = "cookProfile"; // A3: nutzereditierbares Koch-Profil
const INSTRUCTIONS_KEY = "assistantInstructions"; // Q4.2: nur dieses Gerät — nie synchronisiert, nie in rezepte.json

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

/** M1 (#138): Ernährungsziel — eigener kv-Schlüssel, nur dieses Gerät, nicht im Koch-Profil. */
export async function getNutritionGoal() {
  return cleanGoal(await db.kvGet(GOAL_KEY, null));
}

export async function setNutritionGoal(goal) {
  const clean = cleanGoal(goal);
  await db.kvSet(GOAL_KEY, clean);
  return clean;
}

export async function resetNutritionGoal() {
  await db.kvDel(GOAL_KEY);
  return cleanGoal(null);
}

/** Q4.2 (#70): Assistenten-Anweisungen (Vorlage aus Q4.1). Nichts gespeichert → mitgelieferter Default. */
export async function getInstructions() {
  const saved = await db.kvGet(INSTRUCTIONS_KEY, null);
  return typeof saved === "string" && saved.trim() !== "" ? saved : DEFAULT_INSTRUCTIONS;
}

/** Speichert den Text wie getippt. Leer (oder gleich dem Default) = Reset: nie ohne Anweisungen. */
export async function setInstructions(text) {
  const s = typeof text === "string" ? text : "";
  if (s.trim() === "" || s === DEFAULT_INSTRUCTIONS) return resetInstructions();
  await db.kvSet(INSTRUCTIONS_KEY, s);
  return s;
}

export async function resetInstructions() {
  await db.kvDel(INSTRUCTIONS_KEY);
  return DEFAULT_INSTRUCTIONS;
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
