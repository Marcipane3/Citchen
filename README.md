# 🍳 Mein Kochbuch — Rezept-App

Eine installierbare PWA als persönliches Kochbuch. Rezepte liegen in deinem
Google Drive und synchronisieren über alle Geräte. Claude kann sie im Projekt
direkt aktualisieren.

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
- **Claude ein Rezept eintragen lassen:** Im Kochbuch-Projekt sagen „trag das ein". Claude
  schreibt es in `rezepte.json`. Beim nächsten App-Öffnen ist es da.
- **Backup:** Export-Button (⬇️) kopiert alles als Markdown.

## Was Claude updaten kann — und was nicht
- **Daten (Rezepte):** ja, jederzeit über den Drive-Connector im Projekt.
- **App-Code (Features/Design):** über Claude Code — Claude schreibt den Code, du deployst.
  Kein automatisches Live-Update auf dem laufenden Handy; das ist bei einer statischen
  PWA technisch nicht anders lösbar ohne eigenen Server.

## Hosting-Empfehlung (Claude Code berät dich)
**GitHub Pages** ist die einfachste kostenlose Option mit echter HTTPS-URL
(nötig für PWA-Icon & Google-Login). Alternativ Netlify/Cloudflare Pages — alle gratis.
