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
  "version": 2,
  "updated": "2026-05-31T12:00:00.000Z",
  "recipes": [ ... ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `version` | number | Schema-Version. Aktuell `2`. |
| `updated` | string (ISO 8601) | Zeitpunkt der letzten Änderung. Bei jedem Schreiben aktualisieren. |
| `recipes` | array | Liste der Rezept-Objekte. |

> **v1 → v2:** Alle neuen Felder (`rating`, `favorite`, `cookedCount`, `image`, `photos`, `feedback`)
> sind **optional**. Alte v1-Rezepte ohne diese Felder funktionieren weiter — die App
> ergänzt fehlende Werte beim Laden mit Standardwerten und schreibt `version: 2` zurück.

## Rezept-Objekt

```json
{
  "id": "r01",
  "name": "Süßkartoffel-Curry mit Kichererbsen",
  "category": "Vegetarische Hauptgerichte",
  "time": "35 Min",
  "servings": "~4",
  "lastCooked": "Mai 2026",
  "rating": 0,
  "favorite": false,
  "cookedCount": 0,
  "image": "",
  "photos": [],
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
| `rating` | number | nein | Bewertung `0`–`5` (Sterne). `0` = nicht bewertet. |
| `favorite` | boolean | nein | Favorit (♥). Default `false`. |
| `cookedCount` | number | nein | Wie oft gekocht. Wird vom „Heute gekocht"-Button hochgezählt. |
| `image` | string | nein | **URL** zu einem Titelbild (z.B. ein Bild aus dem Web). Claude darf das setzen. |
| `photos` | object[] | nein | Eigene Foto-Uploads des Nutzers. **App-verwaltet — Claude NICHT anfassen** (siehe unten). |
| `feedback` | string | nein | Freitext-Notiz des Nutzers an Claude (siehe „KI-Feedback" unten). Standard `""`. |
| `ingredients` | string[] | nein | Array, eine Zutat pro Eintrag. |
| `steps` | string[] | nein | Array, ein Schritt pro Eintrag. |
| `tips` | string | nein | Freitext. |

### Bilder: `image` vs. `photos` — wichtig für Claude
Es gibt **zwei getrennte** Bildmechanismen:

- **`image`** — eine einfache **Bild-URL** (String). Dient als Titelbild „so soll es
  aussehen". Claude **darf** hier eine öffentliche URL eintragen (z.B. ein passendes
  Rezeptbild). Wird direkt als `<img src>` angezeigt.
- **`photos`** — eigene Fotos, die der Nutzer **in der App** aufnimmt/hochlädt. Jeder
  Eintrag ist `{ "id": "<Google-Drive-fileId>", "added": "<ISO-Zeit>" }` und verweist auf
  eine **separate Bilddatei in Drive**, die die App selbst hochgeladen hat. Das neueste
  Foto (`photos[0]`) ist das Titelbild und schlägt `image`.
  ⚠️ **Claude darf `photos` NICHT erzeugen oder ändern.** Die referenzierten Dateien sind
  Binär-Uploads unter dem `drive.file`-Scope der App — Claude kann sie weder sehen noch
  hochladen. Erfundene `id`-Werte würden in der App nur als kaputte Bilder erscheinen.
  Bestehende `photos`-Arrays beim Editieren **unverändert übernehmen**.

### KI-Feedback: das Feld `feedback` (wichtig für Claude)
Der Nutzer kann pro Rezept eine Notiz schreiben (in der App: „💬 Notiz für Claude"),
z.B. „zu wenig Schärfe", „brauchte 10 Min länger", „mehr Knoblauch". Diese Notiz landet
im Feld `feedback`.

**Aufgabe für Claude bei einem Lauf** (z.B. wenn der Nutzer sagt „arbeite das Feedback ein"):
1. `rezepte.json` lesen (in place, siehe Speicherort-Regeln).
2. Für jedes Rezept mit nicht-leerem `feedback`: das Rezept **anhand der Notiz anpassen**
   (z.B. Zutatenmenge, Schritt, Zeitangabe, `tips` ergänzen). Sinnvoll und konservativ ändern —
   die Absicht des Nutzers umsetzen, nicht das Rezept neu erfinden.
3. Nach dem Einarbeiten `feedback` wieder auf `""` setzen (erledigt).
4. `updated` aktualisieren, Datei in place zurückschreiben.

Hinweis: Der Nutzer ruft das bewusst an („go für das Feedback"); Claude soll nicht
ungefragt Rezepte umschreiben. Niemals `feedback` ohne Einarbeiten löschen.

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
8. **`photos` niemals erfinden oder ändern** — App-verwaltete Drive-Datei-Referenzen
   (siehe „Bilder"-Abschnitt). Beim Editieren eines Rezepts unverändert lassen.
9. Titelbild über **`image`** (URL) setzen, nicht über `photos`.
10. Neue optionale Felder (`rating`, `favorite`, `cookedCount`) müssen nicht gesetzt werden —
    die App ergänzt Defaults. Wenn gesetzt, Typen einhalten (`rating` 0–5).
