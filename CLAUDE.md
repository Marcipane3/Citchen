# 🍳 Rezept-App — Projektkontext & Auftrag für Claude Code

> Diese Datei ist die Anleitung für Claude Code. Lies sie zuerst vollständig.
> Sie wurde von Claude (im Kochbuch-Projekt) für Marcel erstellt als Übergabe.

---

## Was das hier ist

Eine **lokal-first Progressive Web App (PWA)** als persönliches digitales Kochbuch.
Sie ersetzt eine bisherige Markdown-Datei (`REZEPT-DATENBANK.md`) und einen
Chat-Artifact-Prototyp durch eine echte, installierbare App mit Homescreen-Icon.

**Nutzer:** 1 Person (Marcel), Kochlevel Anfänger–Mittelstufe, Standort Kopenhagen.
Kocht hauptsächlich vegetarisch, ~4 Portionen, Wochentags schnell / Wochenende aufwendig.

---

## Die Anforderungen (vom Nutzer priorisiert)

1. **Kostenlos / kein Abo** — kein bezahlter Server, kein SaaS.
2. **Von mehreren Geräten synchron** — Handy + evtl. Laptop sehen dieselben Daten.
3. **Claude soll die Daten per API updaten können** — d.h. die im Claude-Projekt
   laufende Instanz kann Rezepte hinzufügen/ändern, ohne dass der Nutzer copy-pastet.
4. **Homescreen-Icon wie echte App** — PWA, „Zum Startbildschirm hinzufügen".

Setup-Bereitschaft: **hoch** („Egal, ich hab Claude Code & Zeit"). Terminal/OAuth ok.

---

## Architektur-Entscheidung (begründet)

**Google Drive ist das Backend.** Keine eigene Server-Infrastruktur.

```
   [Handy: PWA mit Icon]          [Claude im Projekt]
            │                              │
            └──────────┐      ┌────────────┘
                       ▼      ▼
              [Google Drive: rezepte.json]
                  (single source of truth)
```

Warum:
- Nutzer hat bereits Google Drive (und Microsoft Family als Alternative).
- Drive-API ist kostenlos, kein Hosting nötig für die Daten.
- Claude hat im Projekt Google-Drive-Zugriff → kann dieselbe `rezepte.json`
  lesen/schreiben. Das erfüllt Anforderung #3 ohne eigenes Backend.
- Mehrgeräte-Sync (#2) ergibt sich automatisch, da alle dieselbe Datei nutzen.

**Microsoft 365 / OneDrive** wäre technisch genauso möglich (Graph API). Google Drive
gewählt, weil der Nutzer beides hat und Google Identity Services im Browser am
reibungslosesten ist. → Falls der Nutzer lieber OneDrive will: Graph-API-Variante
anbieten, Konzept bleibt identisch (eine JSON-Datei in der Cloud).

---

## Tech-Stack (bewusst minimal)

- **Single-File `index.html`** — HTML + CSS + Vanilla JS in einer Datei.
  Kein Build, kein npm, kein Framework-Overhead. Maximal wartbar, sofort lauffähig.
- **Google Identity Services (GIS)** + **Google Drive API v3** fürs Auth & File-I/O.
- **PWA**: `manifest.json` + Service Worker (`sw.js`) für Icon & Offline-Cache.
- **Datenformat**: eine `rezepte.json` in einem App-Ordner auf Drive.

Bewusst KEIN React/Vite/Bundler — Begründung: Single-User-App, kein Build-Schritt
heißt der Nutzer (und Claude) können die Datei jederzeit direkt editieren.

---

## ⚠️ DEINE AUFGABEN, Claude Code (in Reihenfolge)

### 1. Hosting beraten (WICHTIG — Nutzer hat hier um Beratung gebeten)
Der Nutzer ist unentschieden beim Hosting. Berate ihn aktiv. Optionen:
- **GitHub Pages**: kostenlos, echte HTTPS-URL (Pflicht für PWA-Icon & OAuth-Redirect),
  minimaler Aufwand. → Empfehlung, wenn er ein GitHub-Konto hat/anlegen mag.
- **Lokal testen zuerst** (`python3 -m http.server`): gut zum Ausprobieren, aber
  OAuth braucht später eine echte Domain & PWA-Install braucht HTTPS.
- Kläre: Hat er GitHub? Mag er eine öffentliche oder private Repo? (PWA braucht HTTPS;
  GitHub Pages liefert das gratis.)
Triff danach mit ihm eine Entscheidung und richte es ein.

### 2. Google Cloud OAuth einrichten (führe ihn Schritt für Schritt)
Das ist der fummeligste Teil. Anleitung in `SETUP-GOOGLE.md` (liegt bei) — gehe sie
mit ihm durch:
- Projekt in Google Cloud Console anlegen
- Google Drive API aktivieren
- OAuth-Consent-Screen (Test-Modus reicht für Einzelnutzer)
- OAuth-Client-ID (Typ: Web) erzeugen, autorisierte JS-Origin = die Hosting-URL
- Client-ID in `index.html` (Konstante `GOOGLE_CLIENT_ID`) eintragen
Scope: `https://www.googleapis.com/auth/drive.file` (nur von der App erstellte Dateien
— minimaler, datenschutzfreundlicher Scope).

### 3. Code finalisieren & deployen
- `index.html`, `manifest.json`, `sw.js`, Icons sind als Startgerüst beigelegt.
- Trage die Client-ID ein, passe die Hosting-URL an.
- Erzeuge echte App-Icons (192px, 512px) — Platzhalter liegen bei.
- Deploye gemäß Hosting-Entscheidung, teste „Zum Startbildschirm hinzufügen".

### 4. Claudes Daten-Zugriff einrichten (Anforderung #3)
Damit die Claude-Projekt-Instanz Rezepte schreiben kann:
- Die `rezepte.json` muss in einem Drive-Ordner liegen, auf den der Nutzer Claude
  Zugriff gegeben hat (über den Google-Drive-Connector im Claude-Projekt).
- Dokumentiere den **Dateipfad/Namen** und das **JSON-Schema** (s.u.) so, dass die
  Projekt-Instanz die Datei findet, parst, ergänzt und zurückschreibt.
- Lege eine `SCHEMA.md` an (Vorlage beigelegt) — das ist der Vertrag zwischen App
  und Claude. Beide müssen sich exakt an dieses Schema halten.

---

## Datenmodell (`rezepte.json`)

```json
{
  "version": 1,
  "updated": "2026-05-31T12:00:00Z",
  "recipes": [
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
  ]
}
```

Die 16 festen Kategorien stehen in `SCHEMA.md`. Beim Schreiben: `updated` aktualisieren,
`id` eindeutig vergeben (z.B. `r` + Timestamp).

---

## Migration der Bestandsdaten

Es gibt bereits **1 Rezept** (Süßkartoffel-Curry), beigelegt als `rezepte.seed.json`.
Diese Datei beim ersten Setup als initiale `rezepte.json` nach Drive hochladen.

---

## Definition of Done

- [ ] App auf HTTPS-URL erreichbar, „Zum Startbildschirm" funktioniert (Icon erscheint)
- [ ] Login mit Google funktioniert, `rezepte.json` wird in Drive erstellt
- [ ] Rezept in der App hinzufügen → erscheint nach Reload auf zweitem Gerät
- [ ] Süßkartoffel-Curry (seed) ist drin
- [ ] `SCHEMA.md` dokumentiert, sodass Claude im Projekt die Datei updaten kann
- [ ] README erklärt dem Nutzer den Alltagsablauf (Rezept hinzufügen, Claude bitten)
