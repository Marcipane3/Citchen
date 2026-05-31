# 🔑 Google Drive Setup — Schritt für Schritt

> Claude Code geht das mit dir durch. Das ist der einzige fummelige Teil — einmal
> gemacht, läuft alles. Dauert ~10 Minuten.

## Was wir einrichten
Die App braucht eine Erlaubnis, in deinem Google Drive eine Datei anzulegen
(`rezepte.json`). Dafür registrieren wir die App einmal bei Google.

Der verwendete Scope ist `drive.file` — die App sieht **nur ihre eigene** Datei,
nicht dein restliches Drive. Datenschutzfreundlich.

---

## Schritte

### 1. Google Cloud Projekt anlegen
1. Gehe zu https://console.cloud.google.com/
2. Oben „Projekt auswählen" → „Neues Projekt" → Name z.B. `Kochbuch` → Erstellen

### 2. Drive API aktivieren
1. Im Menü: „APIs & Dienste" → „Bibliothek"
2. Suche „Google Drive API" → Aktivieren

### 3. OAuth-Zustimmungsbildschirm
1. „APIs & Dienste" → „OAuth-Zustimmungsbildschirm"
2. Nutzertyp: **Extern** → Erstellen
3. App-Name: `Kochbuch`, deine E-Mail als Support + Entwickler-Kontakt
4. Speichern. Bei „Testnutzer": **deine eigene Google-Adresse hinzufügen**
   (Test-Modus reicht für dich allein — keine Google-Prüfung nötig)

### 4. OAuth-Client-ID erstellen
1. „APIs & Dienste" → „Anmeldedaten" → „Anmeldedaten erstellen" → „OAuth-Client-ID"
2. Anwendungstyp: **Webanwendung**
3. Name: `Kochbuch Web`
4. **Autorisierte JavaScript-Quellen** — hier kommt deine Hosting-URL rein:
   - Beim lokalen Testen: `http://localhost:8000`
   - Bei GitHub Pages: `https://DEINNAME.github.io`
5. Erstellen → du bekommst eine **Client-ID** (endet auf `.apps.googleusercontent.com`)

### 5. Client-ID in die App eintragen
In `index.html`, ganz oben im Konfig-Block:
```js
const GOOGLE_CLIENT_ID = "DEINE_CLIENT_ID.apps.googleusercontent.com";
```
Hier deine echte Client-ID einsetzen.

---

## Fertig
App öffnen → „Mit Google anmelden" → Zugriff erlauben.
Beim ersten Login legt die App `rezepte.json` in deinem Drive an (mit dem
Süßkartoffel-Curry als erstem Eintrag).

## Häufige Stolpersteine
- **„redirect_uri_mismatch" / Origin-Fehler**: Die URL unter „Autorisierte
  JavaScript-Quellen" muss EXAKT der Adresse entsprechen, unter der die App läuft
  (mit/ohne `www`, http vs https, Port).
- **„App nicht verifiziert"**: Im Test-Modus normal. Auf „Erweitert" → „Trotzdem
  fortfahren" klicken. Da nur du Testnutzer bist, völlig ok.
- **PWA-Install geht nicht**: Braucht HTTPS. `localhost` zählt fürs Testen,
  fürs echte Icon brauchst du GitHub Pages o.ä. (siehe README).
