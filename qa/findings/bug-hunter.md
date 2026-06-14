# Bug-Hunter — findings (2026-06-14T11:46:49Z)
_Build: 2026-06-13-v2.5 · tests: 145/145_

### [P2] Offline-Edit wird beim Sync still verworfen (LWW löscht dirty ohne Warnung)  ·  confidence: high
- **Where:** `v2/src/data/sync.js:101-119`
- **What breaks:** Eine lokale, noch nicht gepushte Änderung (offline gespeichert, `dirty:true`) geht spurlos verloren, wenn die Drive-Datei zwischenzeitlich einen neueren `updated`-Stempel bekommen hat (z. B. von Projekt-Claude oder einem zweiten Gerät). Der Nutzer bekommt „Synchronisiert ✓" und merkt nichts.
- **Why:** Der Push-Zweig feuert nur bei `meta.dirty && localUpdated > remoteUpdated`. Ist die lokale Änderung älter (Wand­uhr der Nutzeraktion vs. Timestamp), fällt der Code in den Remote-gewinnt-Zweig (Zeile 112), `db.replaceAll("recipes", …)` überschreibt die lokale Sammlung komplett und setzt `dirty:false` — es gibt kein Merge und keine Konfliktmeldung. Das `dirty`-Flag, das den ungepushten Edit markierte, wird kommentarlos gelöscht.
- **Fix:** Bei `meta.dirty` und `localUpdated <= remoteUpdated` nicht still überschreiben. Mindestens: das lokale `dirty`-Set vor `replaceAll` sichern und den Nutzer warnen (Status „Konflikt — lokale Änderung nicht übernommen"), idealerweise pro-Rezept mergen statt die ganze Sammlung zu ersetzen. Bewusste Designentscheidung (reines LWW) — aber dann sollte der verlorene Edit zumindest sichtbar gemeldet werden.
- **Repro / test:** Offline ein Rezept ändern (→ `dirty:true`, `updated=T1`). Drive-`rezepte.json` extern mit `updated=T2 > T1` aktualisieren. Wieder online → `syncWithDrive()`. Erwartung: lokale Änderung bleibt/wird gemeldet. Ist: lokale Änderung weg, Status „Synchronisiert ✓".

### [P3] „Nochmal"-Restart im Koch-Match zeigt bereits gematchte Rezepte erneut  ·  confidence: high
- **Where:** `v2/src/features/match/match.js:126`
- **What breaks:** Nach dem Durchswipen des Stapels führt „Nochmal" (`#swRestart`) wieder Rezepte vor, die der Nutzer schon gematcht (gelikt) hat — inkonsistent zum Erststapel, der gematchte Rezepte korrekt ausblendet.
- **Why:** Der Erstaufbau filtert (`renderMatch`, Zeile 97): `state.recipes.filter((r) => !swipeMatches.includes(r.id))`. Der Restart-Handler shuffelt dagegen ohne Filter: `swipeOrder = shuffle(state.recipes.map((r) => r.id))`. Doppel-Matches werden zwar durch den Guard in `commitSwipe` (Zeile 194) verhindert, aber der Nutzer muss bereits entschiedene Karten erneut wegswipen.
- **Fix:** Im Restart denselben Filter anwenden: `shuffle(state.recipes.filter((r) => !swipeMatches.includes(r.id)).map((r) => r.id))`.
- **Repro / test:** Einige Rezepte liken, Stapel zu Ende swipen, „Nochmal" → gelikte Rezepte erscheinen wieder im Deck.

### [P3] Portions-Scaler & Pager-Navigation killen laufende Schritt-Timer  ·  confidence: high
- **Where:** `v2/src/features/cooking/cooking.js:231-245` (Scaler), `:266-271` (Pager prev/next/check)
- **What breaks:** Läuft ein Schritt-Timer (Countdown mit Alarm) und der Nutzer ändert die Portionen oder blättert im Pager weiter/zurück bzw. hakt einen Schritt ab, wird der Timer ohne Hinweis gestoppt — der Alarm kommt nie.
- **Why:** Diese Aktionen rufen `paint()`, das mit `clearTimers()` (Zeile 199) alle `intervals` löscht und das DOM neu aufbaut. Für den Scaler ist das im Code als bekannte Einschränkung kommentiert (Zeile 229-230), aber der Pager-Pfad (prev/next/check → `paint()`) hat keinen solchen Hinweis und ist im Pager-Modus die normale Bedienung.
- **Fix:** Entweder Timer-Restzeit über `paint()` hinweg persistieren (rem in einer Map nach Schritt-Index halten und beim Re-Wire wiederherstellen), oder zumindest im Pager-Modus einen sichtbaren Hinweis „Timer läuft — Weiterblättern stoppt ihn". Mindest-Fix: Falten ohne Re-Render gibt es bereits (Zeile 248), denselben Ansatz fürs Abhaken im Pager nutzen.
- **Repro / test:** Kochmodus → Pager → Timer auf einem Schritt starten → „→"/„Erledigt" tippen. Timer verschwindet, kein Alarm.

## Summary
0× P0 · 0× P1 · 1× P2 · 2× P3. Keine kritischen (P0/P1) Defekte gefunden — der Datenpfad ist im Normalfall solide; der einzige echte Datenverlust-Pfad (P2) tritt nur im seltenen Offline-Edit-vs.-neuerer-Remote-Konflikt auf und ist als LWW teilweise beabsichtigt.

## Nothing-found notes
Folgende Bereiche wurden gelesen und als sauber bewertet:
- **`capture.js`** — A1-Reset (`resetCaptureUI`) setzt `photoFile`/Preview/URL/Busy korrekt zurück; `buildTimer` wird in `hideBusy()` gecleart; Datei-Input wird nach Auswahl entfernt. Bulk-Save kapselt `addRecipe`-Fehler pro Rezept.
- **`client.js`** — Fehlerklassifizierung (401/429/529/api) sauber; `pause_turn`-Schleife mit 4-Runden-Limit; Offline-Guard vor `fetch`; `web_fetch`-Tool nur über `complete({tools})`.
- **`gate.js`** — Key nur in localStorage, In-Memory-Fallback für Node-Tests, `aiUnavailableReason` Reihenfolge (nokey vor offline) korrekt.
- **`helpers.js` esc()** — escaped `&<>"`; JSON-in-data-Attribut (`data-save-recipe`) ist dadurch attribut-sicher, `JSON.parse` liest den vom Browser dekodierten Wert.
- **`drive.js`** — `findFile` prüft `KNOWN_FILE_ID` zuerst, Namenssuche als Fallback; `updateFile` PATCH in-place; `createFile` nur im Erstlauf. (Hinweis: bei wirklich frischem Konto ohne `KNOWN_FILE_ID`-Treffer wären zwei *gleichzeitige* `saveCollection`-Aufrufe theoretisch ein Doppel-Create-Risiko, da `saveCollection` nicht serialisiert ist — durch die geteilte feste File-ID praktisch nicht auslösbar, daher nicht als eigenständiger Fund gelistet.)
- **`store.js`** — Sprach-Overlay schreibt nichts nach Drive; Persistenz immer aus `recipesDe` (kanonisch deutsch); Mutationen validieren vor Speichern.
- **`app.js mount()`** — ruft `currentCleanup()` vor jedem Routenwechsel; Kochmodus-Cleanup gibt `clearTimers`+`relWake` zurück.
- **`db.js`** — `replaceAll` clear+put in einer Transaktion; `kvGet/kvSet` Schlüssel/Wert konsistent.
- **`lager.js`** — Scan-Input wird entfernt; Staging mergt korrekt; Icon-Fallback über Katalog.
- **`assistant.js`** — `busy`-Guard verhindert parallele Requests; Modul-State (`history`/`chatLog`) persistiert bewusst als Session-Gedächtnis (kein Bug, aber kein `cleanup()` beim Verlassen → wächst über die Session; unkritisch durch `slice(-12)` für den API-Verlauf).
- **i18n** — geprüfte Keys (`toolFromStock`, `offlineTitle`, `scanOffline`, `previewTitle` …) in DE/EN/ES/DA vorhanden; Parität durch Testsuite abgedeckt.
