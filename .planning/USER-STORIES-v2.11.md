# 🍳 Koch — Nächste User Stories (v2.11 und weiter)

> **Status:** Entwurf zur Abnahme durch Marcel · erstellt 2026-08-05 · Build `2026-08-05-v2.10.1`
> **Zweck:** Du liest das durch und gibst pro Story ein Votum. Nichts hiervon ist gebaut.
> **So gibst du Feedback:** hinter jeder Story steht eine Zeile `Votum:` — trag dort
> `JA` / `NEIN` / `SPÄTER` ein, gern mit einem Halbsatz warum. Reihenfolge und Umfang
> passe ich danach an.

---

## 0. Wo wir stehen

**Der Blocker ist weg.** Die App startete nicht mehr — weiße Seite, kein Login. Ursache und
Behebung stehen in `ROADMAP.md` → Epic A → **A6**. Kurzfassung: ein Tippfehler in
`src/version.js` (typografische Anführungszeichen als String-Begrenzer) hat den kompletten
Modulgraphen gerissen. Behoben, plus zwei neue Schutzmaßnahmen, damit genau das nie wieder
still passiert.

**Fertig und stabil:** Kochbuch mit 105 Rezepten, Kochmodus, Wochenplan, Einkaufsliste mit
Vorrats-Abgleich, Lager, Koch-Match, Rezept-Erfassung (Foto/URL/Text), KI-Assistent (BYOK),
4 Sprachen mit übersetzten Basis-Rezepten, Drive-Sync, geteilte Einkaufsliste mit Partner
(v2.10). **171 Tests grün.**

**Offen aus der bisherigen Planung** (nicht neu, nur unerledigt): S2/S3 (Export- und
Einkaufslisten-Sprache), D2 (geteilter Katalog), E3 (Foto-Abgleich Einkaufsliste),
F1/F3 (Generierung, Match-Vergleich), J2 (Tab-Leiste), I3 (Freunde ohne Google-Konto).

---

## 1. Zuerst: die Lehre aus dem Bug *(P0 · klein)*

Der Bug war nicht nur ein Tippfehler — er konnte **unbemerkt bis auf dein Handy durchlaufen**.
Das ist die eigentliche Schwachstelle.

### Story A6.1 — Ich merke sofort, wenn ein Build kaputt ist
> **Als** Marcel **möchte ich**, dass ein kaputter Build gar nicht erst deploybar ist,
> **damit** ich nie wieder vor einer weißen Seite stehe.

**Warum:** Die Testsuite war grün, während die App nicht startete. Tests prüften Logik,
aber nie „lädt die App überhaupt".

**Akzeptanz:**
- [x] Jedes Modul unter `src/` wird als echtes ES-Modul geparst (`test-module-syntax.js`) — **erledigt**
- [x] Bei Startfehler erscheint eine Erklärung + „Zwischenspeicher leeren"-Knopf statt weißer Seite — **erledigt**
- [ ] Ein Smoke-Test startet die App in einem echten Browser und prüft: Kochbuch rendert,
      Login-Knopf sichtbar, keine Konsolenfehler. Läuft vor jedem Deploy.

**Aufwand:** S (der offene Punkt) · **Votum:** ______

---

## 2. Die Stories, die ich als nächstes empfehle

### Story 1 — Ich sehe auf einen Blick, was ich heute kochen kann *(P1 · M)*
> **Als** jemand, der abends müde vor dem Kühlschrank steht, **möchte ich** auf der
> Startseite eine Karte „Das kannst du jetzt kochen" sehen, **damit** ich nicht erst
> filtern oder den Assistenten fragen muss.

**Warum:** Die Zutaten dafür existieren schon — Lager (Vorrat + Frischware) und
„🥕 Aus Vorrat kochen" (v2.5). Aber es ist im Assistenten vergraben, hinter einem
API-Schlüssel. Als Karte oben im Kochbuch wird es das, was du täglich zuerst siehst.

**Akzeptanz:**
- Karte oben im Kochbuch: 2–3 Rezepte, für die du **alle oder fast alle** Zutaten da hast
- Zeigt pro Vorschlag, was noch fehlt („nur Koriander fehlt")
- **Funktioniert ohne KI** — reiner Abgleich Rezeptzutaten ↔ Lager, deterministisch und testbar
- Frischware wird bevorzugt (was zuerst schlecht wird, zuerst vorgeschlagen)
- Ausblendbar, falls das Lager leer ist

**Warum ich das zuerst nehme:** höchster Alltagswert pro Aufwand, nutzt Vorhandenes,
braucht keinen Schlüssel und keine neue Architektur.

**Votum:** ______

---

### Story 2 — Die Einkaufsliste füllt mein Lager *(P2 · M — war #5 in §14)*
> **Als** jemand, der gerade einkaufen war, **möchte ich** abgehakte Artikel mit einem Tipp
> ins Lager übernehmen, **damit** der Kreislauf Einkauf → Vorrat → Kochen sich schließt.

**Warum:** Ohne das bleibt das Lager Handarbeit und veraltet — und damit wird Story 1
schlechter. Die beiden hängen zusammen: Story 2 hält die Daten frisch, von denen Story 1 lebt.

**Akzeptanz:**
- Nach dem Abhaken: „3 Artikel ins Lager übernehmen?" mit einem Tipp erledigt
- Verderbliches landet in der Frischware-Sektion, Haltbares im Vorrat (über den Katalog)
- Rückgängig möglich (wie bei „Alles löschen")

**Votum:** ______

---

### Story 3 — Ich springe mit dem Daumen zwischen den Bereichen *(P2 · M — J2)*
> **Als** Handy-Nutzer **möchte ich** eine feste Leiste am unteren Rand, **damit** ich
> Kochbuch, Einkauf, Lager und Planer mit einem Daumentipp erreiche.

**Warum:** Navigation läuft heute **nur** über das ☰-Menü. Das ist der am besten belegte
UX-Mangel der App (Nielsen Norman Group: versteckte Menüs kosten ~21 % Aufgaben-Erfolg).
Steht seit Juni als J2 im Roadmap, wurde nie entschieden.

**Akzeptanz:**
- Feste untere Leiste: Kochbuch · Einkauf · Lager · Planer (4 Ziele, nicht mehr)
- ☰ bleibt für den Rest (Erfassung, Assistent, Match, Guide, Einstellungen)
- Aktiver Tab sichtbar markiert, 44px Tippfläche, Vorlesehilfen
- Im Kochmodus **ausgeblendet** (Vollbild bleibt Vollbild)

**Entscheidung nötig:** Das ändert jeden Bildschirm. Ich baue es nur auf dein klares JA.

**Votum:** ______

---

### Story 4 — Ich koche ein Rezept immer in meiner Portionsgröße *(P2 · S — war #2 in §14)*
> **Als** Koch für 4 Personen **möchte ich**, dass ein Rezept sich merkt, auf welche
> Portionszahl ich es zuletzt skaliert habe, **damit** ich nicht jedes Mal neu einstelle.

**Akzeptanz:** Kochmodus öffnet mit der zuletzt genutzten Skalierung pro Rezept;
lokal gespeichert, wandert nicht nach Drive (gerätespezifisch).

**Votum:** ______

---

### Story 5 — Die App warnt mich vor Doppelgängern *(P2 · S — war #4 in §14)*
> **Als** jemand, der viel per URL importiert, **möchte ich** gewarnt werden, wenn ein
> Rezept einem vorhandenen stark ähnelt, **damit** mein Kochbuch nicht zumüllt.

**Akzeptanz:** Vor dem Speichern Hinweis „Ähnlich zu ‚Pasta e Ceci' — trotzdem speichern?"
mit Sprung zum vorhandenen Rezept. Namensvergleich rein lokal, kein KI-Aufruf.

**Votum:** ______

---

## 3. Neue Ideen — noch nicht im Roadmap

Das sind meine Vorschläge, ausdrücklich als **Ideen** markiert, nicht eingeplant.

### Idee N1 — Freihändig kochen *(P3 · M)*
Im Kochmodus per Sprache weiterblättern („nächster Schritt") und Timer starten.
Web Speech API, kein Backend, kein Schlüssel. **Das ist der Moment, in dem eine
Koch-App sich wirklich von einer Rezeptliste unterscheidet** — beide Hände im Teig.
Stand schon als #10 in §14; ich hebe es hoch, weil es billiger ist als es klingt
und der einzige Vorschlag mit echtem „Wow".

### Idee N2 — Was muss weg? *(P2 · S)*
Das Lager kennt Frischware. Eine Karte „Verbrauche zuerst" plus optional eine
Erinnerung, wenn etwas seit X Tagen liegt. Direkt gegen Lebensmittelverschwendung,
und es macht die Lager-Pflege endlich lohnend.

### Idee N3 — Ein Rezept teilen *(P3 · S — war #7 in §14)*
Ein einzelnes Rezept als schöner Text in jede Messenger-App. Das Export-Modul kann
das für die ganze Sammlung; es auf ein Rezept zu verengen ist eine halbe Stunde.
**Und es ist der billigste Wachstumspfad** — jedes geteilte Rezept ist Werbung für die App.

### Idee N4 — Nährwerte grob geschätzt *(P3 · M)*
Optional per KI Kalorien/Protein schätzen, am Rezept gecacht. Passt zu deinem
Fitness-/Protein-Fokus. Bewusst als Schätzung gekennzeichnet, nicht als Wahrheit.

### Idee N5 — Kochhistorie automatisch *(P2 · S — war #6 in §14)*
Wenn ein geplanter Tag als gekocht markiert wird, `lastCooked` automatisch setzen.
Der Planer meidet bereits kürzlich Gekochtes — erst damit wird die Rotation echt.

---

## 4. UX — wo die App heute noch reibt

Konkrete Beobachtungen, keine Umbauten.

1. **Leere Zustände erklären nichts.** Leere Einkaufsliste, leeres Lager, leerer Planer
   zeigen Leere statt einen Satz „So fängst du an" plus einen Knopf. Billigster
   Verständlichkeitsgewinn der App. *(S)*

2. **Der Sync-Status ist stumm.** Es gibt eine `.sync-line`, aber im Alltag weißt du nicht,
   ob deine Änderung in Drive angekommen ist. Ein kleiner, ruhiger Indikator
   (`Gespeichert` / `Synchronisiert` / `Konflikt`) im Header — sichtbar, ohne zu nerven. *(S)*

3. **„Konflikt" ist ehrlich, aber eine Sackgasse.** Seit v2.7 überschreibt die App
   nichts mehr still — gut. Aber du kannst den Konflikt nicht *auflösen*. Es braucht
   eine Ansicht „deine Version ↔ Drive-Version, welche gilt?". *(M)*

4. **Der erste Start erklärt sich nicht.** Nach der Sprachwahl stehst du vor 105 Rezepten
   ohne Hinweis auf Lager, Match oder den Assistenten. Drei antippbare Karten beim
   Erststart würden mehr bringen als der Guide, den man erst suchen muss. *(S)*

5. **Suche findet nur Namen und Zutaten.** Nicht die Schritte, nicht die Tipps. „Ofen"
   oder „vorbereiten" führt ins Leere. *(S)*

6. **Rezept-Fotos fehlen bei den 105 Basis-Rezepten.** Das Kochbuch ist eine Textliste.
   Das ist der größte optische Unterschied zu jeder kommerziellen App — steht als
   „Default food photos" schon im V3-Abschnitt, ist aber auch in v2 machbar. *(L)*

---

## 5. Wie die App für andere Menschen taugt

Heute ist die App **für dich gebaut** — und das an vier konkreten Stellen härter,
als es sein müsste. Wenn du sie je weitergeben willst (Partner, Freunde, Play Store),
sind das die Blocker, in der Reihenfolge, in der sie weh tun:

**1. Eine fest verdrahtete Drive-Datei-ID.** `drive.js` trägt
`KNOWN_FILE_ID = "1t6KR…"` — *deine* Datei. Für jeden anderen Nutzer ist die ID
bedeutungslos; es gibt zwar einen Namens-Fallback, aber die Konstante ist ein
Ein-Personen-Konstrukt. **Nötig:** die Datei-ID pro Nutzer lokal merken, statt sie
im Quelltext zu führen. *(S — und die ehrlichste Einzelmaßnahme.)*

**2. Die 105 Basis-Rezepte sind dein Geschmack.** Vegetarisch, Kopenhagen, deine
Küchen. Für dich ist das der Wert der App; für einen Fremden ist es fremder Inhalt.
**Nötig:** beim Erststart fragen — „mit Beispiel-Rezepten starten oder leer?" —
plus ein Geschmacksprofil (vegetarisch? wie viele Portionen? wie viel Zeit?), das
den Kochprofil-Block aus `prompts.js` füllt. Der Profil-Mechanismus **existiert
bereits** (A3, v2.2); er wird beim Erststart nur nie gefragt. *(M)*

**3. BYOK ist eine Hürde, kein Feature.** „Leg dir einen Anthropic-Schlüssel an" ist
für dich zumutbar und für 95 % aller Menschen das Ende. Die gute Nachricht: die App
ist ohne Schlüssel **vollständig benutzbar** — nur die KI-Teile pausieren, und seit
v2.5 sagen sie das auch ehrlich. **Nötig für Fremde:** die KI-Features nicht als
kaputt, sondern als „Extra, wenn du magst" darstellen — und für V3 die Entscheidung
treffen, ob du einen bezahlten Tier anbietest (steht schon im V3-Abschnitt).

**4. Der OAuth-Client läuft im Test-Modus.** Damit sind Fremde auf eine
Handvoll manuell eingetragener Testnutzer begrenzt. Echte Weitergabe heißt
Google-Verifizierung — Aufwand, aber `drive.file` ist der datenschutzfreundlichste
Scope und macht die Prüfung so einfach wie möglich. **Das ist eine Entscheidung,
keine Programmieraufgabe.**

> **Meine ehrliche Empfehlung:** mach **1** sofort (klein, entfernt eine echte
> Fremdkörper-Konstante) und **2** dann, wenn ein zweiter Mensch die App wirklich
> installieren will. **3** und **4** sind V3-Entscheidungen — nicht vorziehen,
> solange die App im Kern deine ist.

---

## 6. Vorschlag zur Reihenfolge

Nur ein Vorschlag — dein Votum sticht.

| Wann | Was | Warum in dieser Reihenfolge |
|------|-----|------------------------------|
| **v2.11** | A6.1 Smoke-Test · Story 1 (Was kann ich kochen) · UX 1 (leere Zustände) | Erst absichern, dann der größte Alltagswert |
| **v2.12** | Story 2 (Liste → Lager) · Idee N5 (Kochhistorie) · UX 2 (Sync-Status) | Schließt den Kreislauf, den Story 1 eröffnet |
| **v2.13** | Story 3 (Tab-Leiste) — **nur bei klarem JA** | Großer Eingriff, verdient einen eigenen Durchgang |
| **danach** | Story 4, 5 · Idee N2, N3 · Generalisierung Punkt 1 | Breite, wenn der Kern sitzt |
| **V3** | Fotos, Nährwerte, Sprache/Freihändig, Bezahl-Tier, Play Store | Eigener Horizont, eigener Plan |

---

## 7. Was ich von dir brauche

1. **Vota** hinter Story 1–5 und ein Ja/Nein zu den Ideen N1–N5.
2. **Eine Entscheidung zu Story 3 (Tab-Leiste)** — das ist die einzige, die die App
   überall verändert, und sie liegt seit Juni unentschieden herum.
3. **Eine Richtung zur Generalisierung:** Bleibt Koch *deine* App (dann ist Punkt 1
   oben genug), oder soll sie weitergabefähig werden (dann planen wir 2–4 richtig)?

*Antworte einfach in diesem Dokument oder im Chat — ich passe Roadmap und Reihenfolge an.*
