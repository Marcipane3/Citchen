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
  "version": 3,
  "updated": "2026-05-31T12:00:00.000Z",
  "recipes": [ ... ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `version` | number | Schema-Version. Aktuell `3`. |
| `updated` | string (ISO 8601) | Zeitpunkt der letzten Änderung. Bei jedem Schreiben aktualisieren. |
| `recipes` | array | Liste der Rezept-Objekte. |

> **v1 → v2:** Alle neuen Felder (`rating`, `favorite`, `cookedCount`, `image`, `photos`, `feedback`)
> sind **optional**. Alte v1-Rezepte ohne diese Felder funktionieren weiter — die App
> ergänzt fehlende Werte beim Laden mit Standardwerten und schreibt `version: 3` zurück.
>
> **v2 → v3:** Reichere Metadaten als **optionale** Felder ergänzt (`effort`, `difficulty`,
> `cuisine`, `prepTime`, `cookTime`, `totalTime`, `mealPrep`, `toTry`, `season`, `tags`).
> Alte Rezepte ohne diese Felder funktionieren unverändert — die App zeigt Badges/Filter nur,
> wenn die Felder vorhanden sind. `ingredients`/`steps` bleiben **flache String-Arrays**,
> `tips` bleibt **ein String**, `servings`/`time` bleiben **Strings** (Anzeige). Die neuen
> Zeit-Felder sind **Zahlen** (Minuten) für Filter/Sortierung; `time` bleibt der Anzeige-String.

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
| `ingredients` | string[] | nein | Array, eine Zutat pro Eintrag. Nicht-Vorrats-Zutaten mit `🛒` markiert (s.u.). |
| `steps` | string[] | nein | Array, ein Schritt pro Eintrag. |
| `tips` | string | nein | Freitext (ein String). Konvention: ausführlich, mit Toppings, Swap und Alltags-Upgrade. |
| `effort` | string | nein | `"alltag"` (schnell, Wochentags) oder `"besonders"` (aufwändiger). Treibt einen App-Filter. |
| `difficulty` | string | nein | `"einfach"` \| `"mittel"` \| `"aufwändig"`. |
| `cuisine` | string | nein | Küche, z.B. `"Italienisch"`, `"Middle Eastern"`, `"Deutsch"`, `"Asiatisch"`, `"Mediterran"`. |
| `prepTime` | number | nein | Vorbereitungszeit in Minuten. |
| `cookTime` | number | nein | Koch-/Backzeit in Minuten. |
| `totalTime` | number | nein | Gesamtzeit in Minuten (inkl. Geh-/Ruhe-/Kühlzeit). |
| `mealPrep` | boolean | nein | `true`, wenn ~4 Tage haltbar / gut aufwärmbar. Treibt einen App-Filter. |
| `toTry` | boolean | nein | `true` bei neuen, noch nie gekochten Ideen. Treibt einen App-Filter. |
| `season` | string | nein | Saison, falls relevant, z.B. `"Herbst"`, `"Sommer"`. |
| `tags` | string[] | nein | Freie Schlagworte (z.B. `["bowl","mealprep","scharf"]`). |

### Vorrat vs. „neu kaufen": die `🛒`-Konvention (wichtig für Claude)
Zutaten, die **nicht** auf der Vorratsliste des Nutzers stehen (`Projektwissen1.md` →
„Vorratsliste"), bekommen am **Ende des Strings** ein ` 🛒` angehängt, z.B.
`"2 Knoblauchzehen, gehackt 🛒"`. Vorrats-Zutaten bleiben unmarkiert. Als „vorhanden" gelten
nur die Vorratsliste **plus** selbstverständliche Basics (Öl, Wasser, Salz). Gewürze: nur
Salz, Pfeffer, Paprika, Kreuzkümmel/Cumin, Curry, Chiliflocken, Rosmarin, Muskat, Zimt gelten
als vorhanden — alles andere (Vanille, Oregano, Kurkuma, Kardamom …) ist `🛒`. Die App rendert
das ` 🛒` einfach mit; der Einkaufslisten-Button übernimmt die Zutat samt Marker.

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
11. **Ganze Datei schreiben.** Die Datei enthält **alle** Rezepte in `recipes`. Beim Editieren
    eines einzelnen Rezepts bleiben **alle anderen Rezepte unverändert** erhalten — niemals das
    Array kürzen oder Rezepte verlieren. (Verlustfrei: die App reicht unbekannte/ungenutzte
    Felder unangetastet durch und entfernt beim Speichern nichts.)
12. **App-eigene Felder eines bestehenden Rezepts durchreichen:** `photos`, `rating`,
    `favorite`, `cookedCount` gehören der App. Beim Editieren **unverändert übernehmen**,
    nicht zurücksetzen.

## Re-Sync & Konfliktmodell (Last-Write-Wins) — entscheidend für G1

Die App hält eine **eigene lokale Kopie** (IndexedDB) und gleicht mit Drive über die
**`updated`-Marke der ganzen Datei** ab (Last-Write-Wins, kein Feld-Merge):

1. Beim Öffnen lädt die App sofort lokal und liest dann Drive im Hintergrund.
2. **Neuere `updated`-Marke gewinnt.** Ist Drive neuer als die lokale Kopie, **ersetzt die App
   ihre lokale Sammlung komplett** durch die Drive-Version — Claudes Edits erscheinen.
3. `updated` ist **ISO-8601-UTC mit Millisekunden** (`2026-06-13T12:30:00.000Z`); die App
   vergleicht die Strings direkt. Schreib das Format **exakt so**.

**Damit Claudes Edit ankommt:**
- Beim Schreiben `updated` **auf jetzt** setzen (= später als jede bisherige Änderung) → Drive
  gewinnt, die App zieht beim nächsten Öffnen nach.
- **Reihenfolge gegen Race-Verlust** (Single-User, ein aktiver Editor zur Zeit):
  1. App **einmal online öffnen**, bis „Synchronisiert ✓“ — so sind alle App-Änderungen
     (Favorit/Bewertung/neue Rezepte) nach Drive gepusht.
  2. **Dann** bittet der Nutzer Claude zu editieren (Claude liest die frische Datei, schreibt
     in place, bumpt `updated`).
  3. App **neu öffnen** → sie erkennt die neuere `updated`-Marke und übernimmt.
- ⚠️ Hat der Nutzer in der App noch **nicht gepushte** Änderungen mit *neuerer* `updated`-Marke,
  überschreibt der nächste App-Push Claudes Drive-Edit. Deshalb Schritt 1 nicht überspringen.

### Worked Example — bestehendes Rezept anpassen (Feedback einarbeiten)

```jsonc
// Vorher (Auszug aus rezepte.json, von der App geschrieben):
{ "id": "r01", "name": "Süßkartoffel-Curry", "category": "Vegetarische Hauptgerichte",
  "ingredients": ["2 Süßkartoffeln", "1 Dose Kichererbsen"],
  "steps": ["Reis aufsetzen.", "Curry köcheln."], "tips": "Joghurt drüber.",
  "rating": 4, "favorite": true, "cookedCount": 3,
  "photos": [{ "id": "drive-abc-123", "added": "2026-06-01T10:00:00.000Z" }],
  "feedback": "Mehr Schärfe und brauchte 10 Min länger." }

// Nachher (Claude arbeitet das feedback ein):
{ "id": "r01", "name": "Süßkartoffel-Curry", "category": "Vegetarische Hauptgerichte",
  "ingredients": ["2 Süßkartoffeln", "1 Dose Kichererbsen", "1 rote Chili, fein 🛒"],
  "steps": ["Reis aufsetzen.", "Curry 25 Min köcheln (statt 15)."],
  "tips": "Joghurt drüber. Swap: Chili durch Sambal Oelek.",
  "rating": 4, "favorite": true, "cookedCount": 3,          // ← unverändert durchgereicht
  "photos": [{ "id": "drive-abc-123", "added": "2026-06-01T10:00:00.000Z" }],  // ← nicht angefasst
  "feedback": "" }                                          // ← erledigt, geleert
```

Dazu auf Datei-Ebene **`updated` neu stempeln** (`"updated": "<jetzt als ISO-UTC>"`), alle
übrigen Rezepte unverändert lassen, `version: 3` behalten. Genau dieser Round-Trip ist in
`v2/tests/test-migrate.js` (Block „G1“) abgesichert: Edit bleibt erhalten, `photos`/Bewertung
unangetastet, Datei validiert sauber, erneutes Laden ist idempotent.
