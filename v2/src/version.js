// version.js — sichtbarer Build-Stempel (Deploy-Kontrolle) + App-Version & Changelog.
export const BUILD = "2026-06-13-v2.4";
export const APP_VERSION = "2.4";

// Changelog (neueste zuerst) — im Guide angezeigt.
export const CHANGELOG = [
  { v: "v2.4", txt: "Mehrfach-Filter: Du kannst jetzt mehrere Filter gleichzeitig anwählen. Innerhalb einer Gruppe gilt ODER (z. B. Pasta ODER Auflauf), und über die Gruppen hinweg wählst du mit dem UND/ODER-Schalter, ob alle oder irgendein Filter passen muss. Küche und Saison sind als Mehrfach-Auswahl ins „Mehr Filter“-Panel gewandert; eine Trefferanzeige zählt live mit, und „Filter zurücksetzen“ räumt alles weg." },
  { v: "v2.3", txt: "Dänisch (DA) als vierte Oberflächen-Sprache. Die Basis-Rezepte (die mitgelieferten ~105) erscheinen jetzt in der gewählten Sprache — Kategorien, Namen, Zutaten, Schritte und Tipps. Selbst hinzugefügte Rezepte bleiben in ihrer Eingabesprache. Die Einkaufsliste behält dabei Symbole und Gang-Sortierung in jeder Sprache." },
  { v: "v2.2", txt: "Erfassung zeigt jetzt klar an, dass die KI liest & baut; Foto wird nach dem Speichern zurückgesetzt. Neu: mehrere Rezepte auf einmal einfügen/generieren. Koch-Profil für die KI frei editierbar (Einstellungen). Lager: Artikel per Symbol-Katalog hinzufügen wie auf der Einkaufsliste. Einkaufsliste: „Alles löschen“ mit Rückgängig + Sortierung (Supermarkt/A–Z)." },
  { v: "v2.1", txt: "Mehrsprachig (DE/EN/ES), Foto- & URL-Rezepterfassung (KI), Lager mit Kühlschrank-Scan, In-App-Guide." },
  { v: "v2.0", txt: "Offline-first Rebuild: Kochbuch, Kochmodus, Wochenplan, Einkaufsliste, KI-Assistent (BYOK)." },
];
