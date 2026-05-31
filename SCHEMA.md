# 📐 Datenschema — `rezepte.json`

> Der Vertrag zwischen App und Claude. Beide MÜSSEN sich exakt daran halten,
> sonst bricht die Synchronisation. Änderungen hier nur bewusst und versioniert.

## Speicherort
- Datei: `rezepte.json`, im **My-Drive-Root** des Nutzers.
- Von der App erstellt — mit minimalem Scope `drive.file`. **Wichtig:** Dieser Scope bedeutet,
  die App sieht **ausschließlich Dateien, die sie selbst erstellt hat**.
- **Schreibweg für Claude:** über **Google Drive für Desktop** (lokaler Pfad, z.B.
  `G:\My Drive\rezepte.json`). Claude (Claude Code) liest und **editiert die bestehende Datei
  in place** — Drive synchronisiert die Inhaltsänderung hoch, die Datei-ID bleibt gleich,
  die App sieht die Änderung beim nächsten Öffnen.
- ⚠️ **Niemals eine neue `rezepte.json` anlegen** (auch nicht über den claude.ai-Drive-Connector,
  der nur „create" kann). Eine neu erstellte Datei wäre für die App wegen `drive.file`
  unsichtbar → es entstehen Duplikate, die in der App nie auftauchen. Es darf immer nur
  **genau eine** `rezepte.json` geben, und sie muss von der App stammen.

## Struktur

```json
{
  "version": 1,
  "updated": "2026-05-31T12:00:00.000Z",
  "recipes": [ ... ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `version` | number | Schema-Version. Aktuell `1`. |
| `updated` | string (ISO 8601) | Zeitpunkt der letzten Änderung. Bei jedem Schreiben aktualisieren. |
| `recipes` | array | Liste der Rezept-Objekte. |

## Rezept-Objekt

```json
{
  "id": "r01",
  "name": "Süßkartoffel-Curry mit Kichererbsen",
  "category": "Vegetarische Hauptgerichte",
  "time": "35 Min",
  "servings": "~4",
  "lastCooked": "Mai 2026",
  "ingredients": ["2 Süßkartoffeln, gewürfelt", "..."],
  "steps": ["Reis aufsetzen.", "..."],
  "tips": "Joghurt drüber = frischer."
}
```

| Feld | Typ | Pflicht | Hinweis |
|------|-----|---------|---------|
| `id` | string | ja | Eindeutig. Schema: `"r" + Timestamp` (z.B. `r1717152000000`). Seed nutzt `r01`. |
| `name` | string | ja | Rezeptname. |
| `category` | string | ja | MUSS einer der 16 Werte unten sein. |
| `time` | string | nein | Frei, z.B. `"25 Min"`. |
| `servings` | string | nein | Frei, z.B. `"~4"` oder `"1 Zucchini, 2 Paprika"`. |
| `lastCooked` | string | nein | Z.B. `"Mai 2026"` oder `""`. |
| `ingredients` | string[] | nein | Array, eine Zutat pro Eintrag. |
| `steps` | string[] | nein | Array, ein Schritt pro Eintrag. |
| `tips` | string | nein | Freitext. |

## Die 16 erlaubten Kategorien (exakt so schreiben)
1. Frühstück & Brunch
2. Schnelle Wochentags-Gerichte
3. Pasta & Nudeln
4. Reis & Getreide
5. Suppen & Eintöpfe
6. Salate & leichte Gerichte
7. Wochenend-Gerichte
8. Vegetarische Hauptgerichte
9. Deutsche Hausmannskost
10. Middle Eastern & Mediterran
11. Asiatisch inspiriert
12. Backen: Brot & Herzhaftes
13. Backen: Süßes & Kuchen
14. Muffins & Kleingebäck
15. Sourdough & Sauerteig
16. Grundrezepte & Basissoßen

## Regeln für Claude beim Schreiben
1. **Bestehende Datei in place editieren** (lokaler Drive-für-Desktop-Pfad). Nie eine neue
   `rezepte.json` anlegen — siehe Speicherort-Warnung.
2. Datei lesen → JSON parsen → `recipes`-Array ergänzen/ändern → in dieselbe Datei zurückschreiben.
3. `updated` auf aktuelle ISO-Zeit setzen.
4. Neue `id` eindeutig vergeben, nie bestehende überschreiben (außer gezielt).
5. `category` gegen die 16 Werte prüfen.
6. Niemals andere Felder hinzufügen ohne `version` zu erhöhen + App anzupassen.
7. Auf korrekte UTF-8-Umlaute achten (ü/ö/ä/ß), nicht versehentlich verfälschen.
