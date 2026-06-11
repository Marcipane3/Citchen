// settings.js — kleine Helfer für nutzereditierbare Einstellungen in IndexedDB
// (Vorratsliste, Theme). Der API-Key liegt bewusst NICHT hier (localStorage,
// gate.js) — die kv-Daten könnten später synchronisiert werden, der Key nie.

import * as db from "./db.js";
import { DEFAULT_STAPLES } from "../features/shopping/logic.js";

const STAPLES_KEY = "pantryStaples";
const THEME_KEY = "theme"; // "system" | "light" | "dark"

export async function getStaples() {
  const list = await db.kvGet(STAPLES_KEY, null);
  return Array.isArray(list) && list.length ? list : DEFAULT_STAPLES;
}

export async function setStaples(list) {
  const clean = (list || []).map((s) => String(s).trim()).filter(Boolean);
  await db.kvSet(STAPLES_KEY, clean);
  return clean;
}

export async function resetStaples() {
  await db.kvDel(STAPLES_KEY);
  return DEFAULT_STAPLES;
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
