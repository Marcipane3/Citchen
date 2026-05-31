# 📐 Datenschema — `rezepte.json`

> Der Vertrag zwischen App und Claude. Beide MÜSSEN sich exakt daran halten,
> sonst bricht die Synchronisation. Änderungen hier nur bewusst und versioniert.

## Speicherort
- Datei: `rezepte.json`
- Liegt in: Google Drive des Nutzers (über `drive.file`-Scope von der App erstellt)
- Damit **Claude im Projekt** die Datei updaten kann: der Nutzer muss den Drive-Ordner,
  der die Datei enthält, im Claude-Google-Drive-Connector freigeben. Dann findet die
  Projekt-Instanz die Datei über den Drive-Connector, liest sie, ergänzt Rezepte und
  schreibt sie zurück.

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
1. Datei lesen → JSON parsen → `recipes`-Array ergänzen/ändern → zurückschreiben.
2. `updated` auf aktuelle ISO-Zeit setzen.
3. Neue `id` eindeutig vergeben, nie bestehende überschreiben (außer gezielt).
4. `category` gegen die 16 Werte prüfen.
5. Niemals andere Felder hinzufügen ohne `version` zu erhöhen + App anzupassen.
