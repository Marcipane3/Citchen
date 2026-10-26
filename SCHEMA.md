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
| `updated` | string | Zeitpunkt der letzten Änderung, **ISO-8601-UTC mit Millisekunden**: `2026-06-13T12:30:00.000Z` (kein `+02:00`, kein reines Datum). Bei jedem Schreiben aktualisieren. |
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
  "id": "r1000000000000",
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
| `id` | string | ja | Eindeutig. Schema: `"r" + Timestamp in ms` (z.B. `r1717152000000`). ⚠️ Die Beispiel-ids in dieser Datei (`r1000000000000`) sind **Platzhalter** — nie übernehmen; `r01` ist eine **echte** id (Süßkartoffel-Curry). |
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

## Re-Sync & Zusammenführen (seit v2.15.1) — entscheidend für G1

Die App hält eine **eigene lokale Kopie** (IndexedDB) und merkt sich zusätzlich die **Basis** =
den Stand, auf den sie sich zuletzt mit Drive geeinigt hat. Abgeglichen wird **pro Rezept**
(Drei-Wege-Merge), nicht mehr „ganze Datei gewinnt“:

1. **Wann:** beim Öffnen, beim Anmelden, wenn die App aus dem Hintergrund zurückkommt oder wieder
   online ist — und **bei jedem Speichern** (♥, Bewertung, Bearbeiten, Neu, Löschen). Die App
   schreibt nie mehr, ohne Drive vorher zu lesen.
2. **Pro Rezept-`id`:** nur Drive geändert (Claude, v1, anderes Gerät) → Drive-Stand · nur in der
   App geändert → App-Stand · **beide** geändert → **pro Feld** zusammengeführt (hat dasselbe Feld
   auf beiden Seiten einen anderen Wert, gewinnt die App).
3. **Neue Rezepte** beider Seiten bleiben. **Gelöscht** wird nur, was die andere Seite unverändert
   gelassen hat (Bearbeiten schlägt Löschen). Fehlen auf Drive auf einmal viele Rezepte (mehr als 3
   **und** mehr als 20 %), **fragt** die App, bevor sie lokal etwas löscht.
4. `updated` entscheidet **nicht** mehr, wer gewinnt — trotzdem bei jedem Schreiben im obigen
   Format setzen (ältere App-Stände und v1 lesen es noch).

**Was die App ablehnt** (Datei wird nicht übernommen, lokale Daten bleiben, Statuszeile zeigt
„Drive-Datei fehlerhaft — lokale Daten behalten“, und die App **schreibt die Datei nicht zurück**,
bis sie wieder gültig ist):
- kein JSON-Objekt (`null`, Array, Text) oder kaputtes JSON,
- kein `recipes`-Array (z. B. `{}` oder ein falscher Schlüssel wie `"Rezepte"`),
- `version` größer als 3 (neueres Format, das diese App nicht kennt).

**Was die App repariert** (und die reparierte Datei zurückschreibt): `null`-Einträge in `recipes`
werden entfernt; ein Rezept **ohne `id`** oder mit einer **schon vergebenen `id`** bekommt eine neue
`id` — das Rezept selbst bleibt erhalten.

**Was erhalten bleibt:** unbekannte Felder **innerhalb** eines Rezepts. Unbekannte Felder **auf
oberster Ebene** (neben `version`/`updated`/`recipes`) werden beim nächsten App-Schreiben **nicht**
mitgeschrieben — dort nichts ablegen.

**Damit Claudes Edit ankommt:** einfach die Datei in place bearbeiten und `updated` stempeln. Die
App muss dafür nicht geschlossen sein; ein ♥ in einer noch offenen App überschreibt Claudes Edit
nicht mehr (früher: Last-Write-Wins, siehe Git-Historie dieser Datei).

## Nebenbei: `einkaufsliste.json` (geteilte Einkaufsliste, seit v2.15.2 geprüft)

Nicht Teil des Rezept-Vertrags, aber dieselbe Drive-Logik: die Einkaufsliste liegt als eigene
Datei `einkaufsliste.json` im Drive der Person, die sie angelegt hat; ein Partner schreibt über die
Google-Freigabe in **dieselbe** Datei. Claude muss sie normalerweise nicht anfassen. Wer es tut
(Claude, ein Skript, von Hand), hält sich an dieses Format:

```jsonc
{
  "version": 1,                              // > 1 → die App lehnt die Datei ab
  "updated": "2026-10-19T10:00:00.000Z",
  "prunedBefore": "2026-09-19T10:00:00.000Z",  // optional, setzt die App (s. u.)
  "items": [
    { "id": "li-mg3x7k-a1b2c3",              // Pflicht, eindeutig, nie wiederverwenden
      "name": "Hafermilch",                  // Pflicht (Text, ≤ 200 Zeichen)
      "nameDe": "Hafermilch",                // optional: deutscher Schlüssel, wenn `name` übersetzt ist
      "qty": 1, "amount": null, "unit": null, // Menge: `amount` + `unit` ODER `qty`
      "cat": "Milch & Eier", "icon": "🥛",   // Gang (≤ 80 Zeichen) + EIN Emoji (≤ 16 Zeichen)
      "done": false, "deleted": false,       // gelöscht = Tombstone, NICHT aus der Liste entfernen
      "updated": "2026-10-19T10:00:00.000Z", // bei JEDER Änderung neu stempeln — neuester gewinnt
      "author": "local" }
  ]
}
```

- **Zusammenführen:** pro Artikel-`id`; der Artikel mit dem späteren `updated` gewinnt. Löschen =
  `deleted: true` + neues `updated` (sonst taucht der Artikel beim nächsten Abgleich wieder auf).
- **Aufräumen:** Tombstones älter als 30 Tage entfernt die App und trägt die Grenze als
  `prunedBefore` ein. Ein Gerät, das diese Datei schon kennt, verwirft danach lokale Artikel, die in
  der Datei fehlen und älter als `prunedBefore` sind (sie waren gelöscht) — so holt ein Gerät nach
  langer Offline-Zeit nichts Gelöschtes zurück.
- **Abgelehnt** (Sync-Karte: „unbekanntes Format — lokale Liste behalten, nichts überschrieben“;
  die App schreibt nicht, bis die Datei wieder passt): kein JSON-Objekt, kaputtes JSON, kein
  `items`-Array, `version` > 1.
- **Repariert** (und einmal zurückgeschrieben): falsche Feldtypen werden korrigiert (z. B. `qty` als
  Text → 1, `icon` mit HTML/zu lang → entfernt), offene Artikel ohne Namen fallen weg. Artikel
  **ohne `id`** (Altbestand vor v2.11) bekommen eine feste id aus Name + Einheit (`li-x-…`);
  die Kopien, die ältere Versionen davon angelegt haben, werden zu einer Zeile zusammengefasst.
- Alles aus der Datei wird in der App nur als **Text** angezeigt (nie als HTML).

### Worked Example — bestehendes Rezept anpassen (Feedback einarbeiten)

```jsonc
// Vorher (Auszug aus rezepte.json, von der App geschrieben):
{ "id": "r1000000000000", "name": "Süßkartoffel-Curry", "category": "Vegetarische Hauptgerichte",
  "ingredients": ["2 Süßkartoffeln", "1 Dose Kichererbsen"],
  "steps": ["Reis aufsetzen.", "Curry köcheln."], "tips": "Joghurt drüber.",
  "rating": 4, "favorite": true, "cookedCount": 3,
  "photos": [{ "id": "drive-abc-123", "added": "2026-06-01T10:00:00.000Z" }],
  "feedback": "Mehr Schärfe und brauchte 10 Min länger." }

// Nachher (Claude arbeitet das feedback ein):
{ "id": "r1000000000000", "name": "Süßkartoffel-Curry", "category": "Vegetarische Hauptgerichte",
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
