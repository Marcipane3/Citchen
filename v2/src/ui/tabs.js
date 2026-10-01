// tabs.js — J2: Hauptbereiche der unteren Tab-Leiste. Reine Daten + Funktionen (kein DOM),
// damit Node-Tests Routen, i18n-Keys und Menü-Abgrenzung prüfen können.
// Alles, was hier NICHT steht, liegt im ☰-Menü (features/menu.js).

export const TABS = [
  { go: "cookbook", icon: "📖", k: "tab.cookbook" },
  { go: "lager", icon: "📦", k: "tab.lager" },
  { go: "shopping", icon: "🛒", k: "tab.shopping", badge: true },
  { go: "planner", icon: "🗓", k: "tab.planner" },
  { go: "assistant", icon: "✨", k: "tab.assistant" },
];

/** Routen, auf denen die Leiste verschwindet (Kochmodus = Vollbild, keine Ablenkung). */
export const HIDE_ON = ["cook"];

/** Welcher Tab ist aktiv? Erstes Routen-Segment, sonst null (z. B. Einstellungen, Guide). */
export function tabForRoute(name) {
  const tab = TABS.find((x) => x.go === name);
  return tab ? tab.go : null;
}

export function hidesTabBar(name) { return HIDE_ON.includes(name); }

/** Badge-Text: leer bei 0, „99+“ ab 100 (passt in den Kreis). */
export function badgeText(n) {
  if (!n || n < 0) return "";
  return n > 99 ? "99+" : String(n);
}
