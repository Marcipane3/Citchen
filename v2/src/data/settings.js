// settings.js — kleine Helfer für nutzereditierbare Einstellungen in IndexedDB
// (Vorratsliste, Theme). Der API-Key liegt bewusst NICHT hier (localStorage,
// gate.js) — die kv-Daten könnten später synchronisiert werden, der Key nie.

import * as db from "./db.js";
import { getInStock } from "./lager.js";

const THEME_KEY = "theme"; // "system" | "light" | "dark"

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
