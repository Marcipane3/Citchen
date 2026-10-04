# Einkaufsliste mit Partner teilen — Einrichtung & Test

Stand: v2.11 (2026-10-01). Gilt für die App unter https://marcipane3.github.io/Citchen/v2/

## Wie es funktioniert (30 Sekunden)

- Jedes Konto hat seine Liste als `einkaufsliste.json` im eigenen Google Drive.
- Du gibst diese Datei in Google Drive für deinen Partner frei (Bearbeiter).
- Dein Partner wählt die Datei **einmal** in der App über die Google-Dateiauswahl („Picker“) aus.
  Ab dann lesen und schreiben beide dieselbe Datei.
- Abgleich: beim Öffnen der Liste, nach jeder Änderung (gebündelt nach ~1 s) und mit 🔄.
  Kein Live-Push — die Änderungen des Partners siehst du nach 🔄 oder beim nächsten Öffnen.
- Zusammenführen pro Artikel: Beide fügen gleichzeitig etwas hinzu → beides bleibt. Gelöscht oder
  abgehakt → kommt beim anderen an. Bei gleichzeitiger Änderung desselben Artikels gewinnt die neuere.

## Einmalige Einrichtung (Marcel, Google Cloud Console)

Projekt: das Projekt mit der OAuth-Client-ID `977952120262-…` (Projektnummer **977952120262**).

1. **Partner als Testnutzer eintragen** — *ohne diesen Schritt kann sich dein Partner gar nicht anmelden.*
   APIs & Dienste → OAuth-Zustimmungsbildschirm (bzw. „Google Auth Platform → Zielgruppe“) →
   Testnutzer → **+ Nutzer hinzufügen** → Gmail-Adresse deines Partners.
2. **Google Picker API aktivieren** — APIs & Dienste → Bibliothek → „Google Picker API“ → Aktivieren.
3. **API-Schlüssel anlegen** — APIs & Dienste → Anmeldedaten → **+ Anmeldedaten erstellen → API-Schlüssel**.
   Danach den Schlüssel einschränken:
   - Anwendungseinschränkung: **Websites** → `https://marcipane3.github.io/*`
     (für lokale Tests zusätzlich `http://localhost:8011/*`)
   - API-Einschränkung: nur **Google Picker API**
4. Den Schlüssel in `v2/src/data/drive.js` bei `const GOOGLE_API_KEY = "";` eintragen
   (ein eingeschränkter Browser-Schlüssel darf im Code stehen — er funktioniert nur auf deiner Domain
   und nur für den Picker). `GOOGLE_APP_ID` ist bereits gesetzt.
5. Committen & pushen (CACHE in `v2/sw.js` hochzählen) — oder Claude Code darum bitten.

> Laut Google-Doku ist der API-Schlüssel für den Picker Pflicht. Ohne ihn *kann* der Picker trotzdem
> öffnen, meldet aber oft „The API developer key is invalid“. Dann fehlt Schritt 2–4.

## So testest du es mit deinem Partner (ca. 10 Minuten)

| # | Wer | Schritt | Erwartung |
|---|-----|---------|-----------|
| 1 | Du | App öffnen → 🛒 Einkaufsliste. Karte oben zeigt „In deinem Google Drive“? Sonst „☁️ Mit Google verbinden“. | „Aktualisiert um …“ |
| 2 | Du | 2–3 Artikel hinzufügen, 🔄 tippen. | Status bleibt grün |
| 3 | Du | „👥 Mit Partner teilen“ → „📂 Liste in Google Drive öffnen“ → in Drive **Freigeben** → Partner-E-Mail als **Bearbeiter**. | Partner bekommt eine Google-Mail |
| 4 | Partner | App auf seinem Handy öffnen, mit **seinem** Google-Konto verbinden (Einstellungen oder Karte in der Einkaufsliste). | Partner sieht seine eigene (leere) Liste |
| 5 | Partner | „👥 Mit Partner teilen“ → „👥 Geteilte Liste auswählen“ → Reiter für freigegebene Dateien → `einkaufsliste.json`. | Karte zeigt „👥 Geteilte Liste“ und deine Artikel |
| 6 | Partner | Einen Artikel hinzufügen, einen abhaken. | — |
| 7 | Du | 🔄 tippen. | Neuer Artikel da, abgehakter durchgestrichen |
| 8 | Du | Einen Artikel mit ✕ löschen. Partner tippt 🔄. | Artikel ist auch beim Partner weg — und bleibt weg |
| 9 | Beide | Gleichzeitig je einen anderen Artikel hinzufügen, dann beide 🔄 (ggf. zweimal). | Beide Artikel bei beiden |

**Wenn etwas hakt**
- Partner kann sich nicht anmelden („Zugriff blockiert“) → Schritt 1 der Einrichtung fehlt.
- Picker öffnet nicht / „developer key invalid“ → Schritte 2–4.
- Picker zeigt die Datei nicht → in Drive prüfen, ob sie wirklich für genau dieses Google-Konto freigegeben ist.
- „Geteilte Liste nicht erreichbar“ → Freigabe wurde entzogen oder die Datei gelöscht; „Verbindung trennen“ führt zurück zur eigenen Liste.

## Technik (für Claude Code)

- `src/data/listSync.js` — jeder Sync: Drive lesen → `syncStep()` (Union + neuestes `updated` pro Artikel,
  Tombstones > 30 Tage werden entfernt) → nur bei Änderung schreiben. Meta: `{fileId, ownFileId, linked, dirty, lastSync}`.
- `src/features/shopping/listMerge.js` — reine Merge-Funktionen, getestet in `tests/test-list-sync.js`.
- Regel: **Jede Änderung an einem Artikel ruft `touch()` auf** — sonst übernimmt der Partner sie nicht.
  Löschen = `deleted: true` + `touch()`, niemals `splice`.
- Scope bleibt `drive.file`: die App sieht nur selbst angelegte Dateien und per Picker gewählte.

---

# Freunde-Link (I3, ab v2.14) — Freunde ohne App und ohne Google-Konto

## Wie es funktioniert

- 🛒 Einkauf → **„🔗 Freunde-Link“** → Namen eintragen → **Link erstellen** → **Link teilen** (WhatsApp, SMS …).
- Wer den Link öffnet, sieht deine **offenen** Artikel und kann etwas hinzufügen. Kein Konto, keine App.
  Steht etwas schon drauf, fragt die Seite nach („nochmal tippen, um es trotzdem hinzuzufügen“).
- Die Vorschläge holt **deine** App ab — beim Öffnen der Einkaufsliste, beim App-Start, mit 🔄 und wenn
  du wieder online bist. Sie landen mit „von Anna“ auf deiner Liste (gleicher Artikel → Menge +1) und
  gehen von dort wie jede Änderung nach Drive und zu deinem Partner.
- **Neuen Link erzeugen** macht den alten sofort ungültig. **Ausschalten** löscht alles auf dem Server.
- Funktioniert auch ohne Google-Anmeldung (dann nur auf diesem Gerät).

## Was wo liegt

| Wo | Was | Wie lange |
|----|-----|-----------|
| Google Drive (`einkaufsliste.json`) | die echte Liste, wie bisher | dauerhaft |
| Supabase (Projekt `wbvhgeqdixrcfeszsiob`, EU/Irland) | deine **offenen** Artikel (Name, Symbol, Gang, Menge), dein Anzeigename, noch nicht abgeholte Vorschläge (Text + optionaler Name des Freundes) | bis zum nächsten Abholen bzw. bis du ausschaltest |
| Dein Gerät (IndexedDB `friendInbox`) | Besitzer-Token (der Server kennt nur seinen SHA-256-Hash), Einladungs-Token | bis du ausschaltest |

## Grenzen (bewusst)

- **Wer den Link hat, sieht die offenen Artikel.** Link nicht öffentlich posten; bei Bedarf „Neuen Link erzeugen“.
- **Ein Gerät holt ab:** das Besitzer-Token liegt nur auf dem Gerät, auf dem du den Link erstellt hast.
  Dein Partner und deine anderen Geräte bekommen die Artikel trotzdem — über Drive.
- **Supabase Free Tier pausiert Projekte nach ~7 Tagen ohne Zugriff.** Solange du die App regelmäßig öffnest,
  passiert das nicht. Falls doch: im Supabase-Dashboard „Restore project“.
- Spam-Bremse: max. 100 offene Vorschläge pro Liste, max. 20 pro Minute.

## Technik (für Claude Code)

- Schema + Funktionen: `supabase/migrations/20261004182000_i3_friend_inbox.sql`. Tabellen `friend_lists`,
  `friend_items` mit RLS **ohne** Policies → anon hat keinen Tabellenzugriff. Alles über `SECURITY DEFINER`-RPCs
  `fl_create / fl_rotate / fl_set_name / fl_publish / fl_pull / fl_ack / fl_delete` (Besitzer-Token) und
  `fl_view / fl_add` (Einladungs-Token). Der Supabase-Advisor warnt deshalb „SECURITY DEFINER von anon ausführbar“ — gewollt.
- `src/data/supabase.js` — fetch auf `/rest/v1/rpc/*` mit Publishable Key (darf im Code stehen).
- `src/data/friendInbox.js` — Abholen: `fl_pull` → `listSync.applyExternal(applyFriendItems)` → `seen` merken → `fl_ack`.
  Schaufenster: `listSync.onSaved` → gebündelt `fl_publish(snapshotOf(items))`, nur bei Änderung.
- `src/features/shopping/friendMerge.js` — reine Logik, getestet in `tests/test-friends.js`.
- `add.html` — die Freundes-Seite, eigenständig; Token steht im `#`-Teil (geht an keinen Webserver).
