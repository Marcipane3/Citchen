// version.js — sichtbarer Build-Stempel (Deploy-Kontrolle) + App-Version & Changelog.
export const BUILD = "2026-06-12-v2.2";
export const APP_VERSION = "2.2";

// Changelog (neueste zuerst) — im Guide angezeigt.
export const CHANGELOG = [
  { v: "v2.2", txt: "Erfassung zeigt jetzt klar an, dass die KI liest & baut; Foto wird nach dem Speichern zurückgesetzt. Neu: mehrere Rezepte auf einmal einfügen/generieren. Koch-Profil für die KI frei editierbar (Einstellungen). Lager: Artikel per Symbol-Katalog hinzufügen wie auf der Einkaufsliste. Einkaufsliste: „Alles löschen“ mit Rückgängig + Sortierung (Supermarkt/A–Z)." },
  { v: "v2.1", txt: "Mehrsprachig (DE/EN/ES), Foto- & URL-Rezepterfassung (KI), Lager mit Kühlschrank-Scan, In-App-Guide." },
  { v: "v2.0", txt: "Offline-first Rebuild: Kochbuch, Kochmodus, Wochenplan, Einkaufsliste, KI-Assistent (BYOK)." },
];
