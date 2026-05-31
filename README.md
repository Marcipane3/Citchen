# 🍳 Mein Kochbuch — Rezept-App

Eine installierbare PWA als persönliches Kochbuch. Rezepte liegen in deinem
Google Drive und synchronisieren über alle Geräte. Claude kann sie im Projekt
direkt aktualisieren.

## Funktionen
- **Rezepte** mit Kategorie, Zeit, Portionen, Zutaten und Schritten.
- **Titelbild & eigene Fotos** — Foto vom fertigen Gericht aufnehmen/hochladen; das
  neueste erscheint oben als Titelbild, weitere als Streifen. Bilder werden komprimiert
  und als **separate Dateien in Drive** gespeichert (hält `rezepte.json` klein).
- **Bewertung** — 0–5 Sterne pro Rezept.
- **Favoriten** (♥) mit eigenem Filter.
- **Kochmodus** — Vollbild, große Schrift, Zutaten/Schritte abhakbar, Bildschirm bleibt an.
- **Zeilen-Editor** für Zutaten & Schritte (eine Zeile pro Eintrag, Enter = nächste Zeile).
- **Bearbeiten & Löschen** bestehender Rezepte, „Heute gekocht"-Zähler.
- **Suche** nach Name/Zutat, **Export** als Markdown.

## Dateien
| Datei | Zweck |
|-------|-------|
| `index.html` | Die komplette App (HTML+CSS+JS in einer Datei) |
| `manifest.json` | PWA-Manifest (Homescreen-Icon) |
| `sw.js` | Service Worker (Installierbarkeit + Offline-Hülle) |
| `icon-192.png`, `icon-512.png` | App-Icons (Platzhalter — gern ersetzen) |
| `rezepte.seed.json` | Start-Daten (Süßkartoffel-Curry) |
| `CLAUDE.md` | **Auftrag & Kontext für Claude Code — zuerst lesen** |
| `SETUP-GOOGLE.md` | Google-OAuth-Einrichtung Schritt für Schritt |
| `SCHEMA.md` | Datenschema (Vertrag App ↔ Claude) |

## Schnellstart mit Claude Code
1. Diesen Ordner in Claude Code öffnen.
2. Claude Code sagen: *„Lies CLAUDE.md und richte die App mit mir ein."*
3. Es berät dich beim Hosting, führt dich durch das Google-Setup und deployt.

## Lokal testen (vor dem Hosting)
```bash
cd rezept-app
python3 -m http.server 8000
# Browser: http://localhost:8000
```
(Für Login muss `http://localhost:8000` in der Google-Console als JS-Origin stehen —
siehe SETUP-GOOGLE.md.)

## Der Alltagsablauf
- **Rezept selbst hinzufügen:** App öffnen → `+` → ausfüllen → speichern. Landet sofort in Drive.
- **Foto hinzufügen:** Rezept öffnen → „📷 Foto aufnehmen oder hochladen". Erscheint oben als Titelbild.
- **Bewerten / Favorit:** Rezept öffnen → Sterne tippen bzw. ♥.
- **Kochen:** Rezept öffnen → „👨‍🍳 Kochmodus" — Vollbild, Schritte abhaken, Bildschirm bleibt an.
- **Claude ein Rezept eintragen lassen:** In **Claude Code** sagen „trag dieses Rezept ein: …".
  Claude editiert die lokale `G:\My Drive\rezepte.json` (Google Drive für Desktop) *in place* →
  Drive synct hoch → beim nächsten App-Öffnen ist es da.
- **Backup:** Export-Button (⬇️) kopiert alles als Markdown.

## Was Claude updaten kann — und was nicht
- **Daten (Rezepte):** ja, über **Claude Code + Google Drive für Desktop**. Claude bearbeitet
  die bestehende `rezepte.json` *in place* (gleiche Datei-ID).
- **Titelbild:** Claude kann das Feld `image` (eine Bild-**URL**) setzen. Eigene **Fotos**
  (`photos`) sind dagegen App-verwaltete Drive-Dateien — die fasst Claude **nicht** an
  (Details in `SCHEMA.md`).
- ⚠️ **Nicht über den claude.ai-Drive-Connector schreiben.** Der kann nur *neue Dateien
  anlegen*, nicht bestehende ändern. Da die App den minimalen `drive.file`-Scope nutzt (sie
  sieht **nur selbst erstellte Dateien**), wäre jede vom Connector neu angelegte Datei für
  die App **unsichtbar** → Duplikate, die nie in der App erscheinen. **Goldene Regel:
  immer die vorhandene Datei editieren, nie eine neue erzeugen.**
- **App-Code (Features/Design):** über Claude Code — Claude schreibt den Code, du deployst.
  Kein automatisches Live-Update auf dem laufenden Handy; das ist bei einer statischen
  PWA technisch nicht anders lösbar ohne eigenen Server.

## Hosting-Empfehlung (Claude Code berät dich)
**GitHub Pages** ist die einfachste kostenlose Option mit echter HTTPS-URL
(nötig für PWA-Icon & Google-Login). Alternativ Netlify/Cloudflare Pages — alle gratis.

## Ideen für später (Roadmap)
Bewusst noch nicht gebaut, weil sie eine Datenmodell-Änderung oder mehr Aufwand brauchen:
- **Portions-Rechner** — Mengen automatisch hoch-/runterskalieren (braucht strukturierte Mengen statt Freitext).
- **Einkaufsliste** — Zutaten ausgewählter Rezepte sammeln und abhaken.
- **Wochenplan** — Rezepte auf Wochentage legen.
- **Import aus URL** — Rezept von einer Webseite einlesen/parsen.
- **Prep- vs. Kochzeit** getrennt, Schwierigkeitsgrad, freie Tags neben den 16 Kategorien.
- **„Swipe/Tinder"-Entdeckungsmodus** — Karten-Stapel mit großem Bild + Kurzinfos (Zeit,
  Kategorie, Bewertung) unten; nach rechts/links wischen, um ein Gericht zum Kochen zu finden.
  Rechts = „heute kochen" (öffnet Rezept/Kochmodus), links = nächstes. Optional Filter
  (vegetarisch, schnell, Favorit) als Quelle für den Stapel.

### KI-Feedback zum Rezept (Backlog)
- **AI-Kommentarfeld pro Rezept** — ein Freitextfeld, in das man schreibt, was am Rezept
  gefehlt hat / wie es war (z.B. „zu wenig Schärfe", „brauchte 10 Min länger"). Per Knopf
  („Mit Claude verbessern") wird ein Prompt mit Rezept + Kommentar an Claude geschickt,
  der das Rezept entsprechend anpasst und zurückschreibt (`rezepte.json` in place,
  siehe SCHEMA.md). Offene Punkte: Wie ruft die App Claude auf? Optionen: (a) Kommentar
  wird im Rezept gespeichert (`feedback`-Feld) und beim nächsten Claude-Code-Lauf
  abgearbeitet; (b) direkter API-Aufruf aus der App (braucht API-Key → Kosten/Sicherheit).
  Empfehlung: zunächst (a) — kostenlos, kein Key in der App.

### Kochmodus — mögliche Upgrades (Backlog)
Der aktuelle Kochmodus (Vollbild, abhakbare Zutaten/Schritte, Bildschirm bleibt an) funktioniert.
Mögliche Erweiterungen:
- **Schritt-für-Schritt-Pager** — nur ein großer Schritt sichtbar, „Weiter/Zurück" bzw. wischen
  (weniger Scrollen mit teigigen Händen), Fortschrittsbalken.
- **Timer pro Schritt** — Zeitangaben im Schritt erkennen und einen Countdown-Button anbieten
  (z.B. „12 Min köcheln" → tippen startet Timer mit Signal).
- **Portionen im Kochmodus skalieren** (hängt am Portions-Rechner oben).
- **Hands-free** — Vorlesen der Schritte / Sprachsteuerung „nächster Schritt".
- **Zutaten-Referenz einklappbar** beim Scrollen durch die Schritte immer griffbereit.
- **Abgehakter Fortschritt merken**, bis das Gericht fertig ist (überlebt versehentliches Schließen).
