# Koch v1 — Feature Inventory (Parity Contract for v2)

> Source: `index.html` at repo root (Build `2026-06-08-v3-kochbuch`, 1400 lines), `sw.js`, `manifest.json`,
> `SCHEMA.md` (canonical, schema v3), live `rezepte.json` (105 recipes, verified 2026-06-09).
> **Every item below is a mandatory v2 requirement** (01_ARCHITECTURE §8) unless marked *[superseded]*
> with the v2 feature that replaces it. Checkboxes are ticked as v2 reaches parity.

---

## 1. PWA & App Shell

- [x] **P1.1** Installable PWA: manifest (name "Mein Kochbuch", standalone, portrait, theme `#c8632e`, icons 192/512 maskable). v2: own `manifest.webmanifest` scoped to `/v2/`.
- [x] **P1.2** Service worker: app shell cached for offline launch. v1 uses network-first for HTML (prevents stale builds), cache-first for static assets, **never caches** `googleapis.com`/`google.com`. v2 keeps these rules, adds IndexedDB data layer.
- [x] **P1.3** Visible build version string at page bottom (`Build <id>`) for deploy verification.
- [x] **P1.4** Sync status line ("Verbinde mit Drive…", "Speichere…", "Synchronisiert ✓").
- [x] **P1.5** German UI throughout.
- [x] **P1.6** Single-column layout, max-width 640px, warm "paper" design: Fraunces (serif, headings) + Karla (sans, body), palette `--accent #c8632e`, `--accent2 #e8a13a`, `--ink #2a1f17`, `--paper #f6efe3`, `--card #fffaf2`, dotted paper texture. v2 may refresh the visuals but must keep the kitchen-friendly warm identity + add dark theme (03_FEATURES §8).
- [x] **P1.7** Ghost-click protection on freshly opened sheets/overlays (v1 `armSheet`, 450 ms) — touch-device safeguard; v2 must solve the same problem (any mechanism).
- [x] **P1.8** Safe-area insets respected (notch devices), `viewport-fit=cover`.

## 2. Google Auth & Drive Sync

- [ ] **P2.1** Google Identity Services token flow, scope `drive.file` only. Existing client ID `977952120262-lht1tbbinnj8kmehmvqe1dpu5gp7k8d8.apps.googleusercontent.com` (origin-scoped — reusable for `/v2` on same origin).
- [ ] **P2.2** Explicit "Mit Google anmelden" button **and** silent auto-login (`prompt:""`) on launch.
- [ ] **P2.3** Access token persisted locally with expiry (60 s buffer); silent renewal; cleared and silently retried on 401.
- [ ] **P2.4** `rezepte.json` located on Drive by name query (`name='rezepte.json' and trashed=false`); created with seed if absent. v2: prefer known file ID `1t6KRviicPspYVj9oFjsUTJ6n8kZLHP1y` with name-search fallback.
- [ ] **P2.5** **In-place update** of `rezepte.json` (PATCH `uploadType=media`) — same file ID forever; JSON pretty-printed (`null, 2`); never create duplicates.
- [ ] **P2.6** On every save: `updated` = current ISO timestamp, `version` = 3.
- [ ] **P2.7** `normalize()` on load: fill defaults for `rating` (0), `photos` ([]), `favorite` (false), `cookedCount` (0), `image` (""), `feedback` ("") without persisting noise.
- [ ] **P2.8** Photo files: client-side compression (max 1280 px, JPEG q 0.72) → multipart upload as separate Drive file → referenced as `{id, added}` in `photos[]`; authenticated fetch → ObjectURL with in-memory cache; Drive file deleted when photo (or recipe) is deleted.
- [x] **P2.9** Login screen with friendly German explanation when signed out. *[superseded — v2: sign-in is **optional**; app fully usable on local data; login moves to Settings/banner. The explanation screen must not block the app.]*

## 3. Recipe List (main view)

- [x] **P3.1** Header: 🍳 brand, title, live recipe count ("105 Rezepte"), ☰ menu button.
- [x] **P3.2** Live search by **name or ingredient** (case-insensitive substring); input keeps focus/caret while filtering.
- [x] **P3.3** Chip filter row (horizontal scroll): `Alle` · `♥ Favoriten` · `⚡ Alltag` · `✨ Besonders` · `🍱 Meal-Prep` · `🆕 Probieren` · one chip per **used** category. Special chips only appear when matching data exists; category chip label = shortened first word.
- [x] **P3.4** Recipe cards: optional photo thumbnail (newest photo beats `image` URL), category label, name, meta line (⏱ time · zuletzt gekocht · ★ mini-rating), compact badges (effort, difficulty, meal-prep, to-try), **heart toggle directly on the card** (saves immediately).
- [x] **P3.5** Empty states: no recipes (hint to +) / no favorites (hint to ♥).
- [x] **P3.6** FAB `+` opens the new-recipe form.

## 4. Menu (☰)

- [x] **P4.1** Menu sheet with: 📖 Rezepte · 🔥 Koch-Match (Swipe) · 🛒 Einkaufsliste · ⬇️ Markdown-Export. Active view highlighted. v2 adds: Planer, Assistent, Einstellungen (hash routes).

## 5. Recipe Detail (sheet)

- [x] **P5.1** Hero image (newest own photo > `image` URL > none), category label, name.
- [x] **P5.2** ★ rating 0–5; tapping the current star value decrements by one (lets you reach 0); persists immediately.
- [x] **P5.3** ♥ favorite toggle in header; persists immediately.
- [x] **P5.4** Meta: ⏱ time string · 🍽 servings string · "N× gekocht" (when `cookedCount` > 0).
- [x] **P5.5** Badges: effort (⚡/✨), difficulty, cuisine, 🍱 meal-prep, 🆕 to-try, season. Extra line for `prepTime`/`cookTime`/`totalTime` ("Vorb. 30′ · Koch 45′ · Gesamt 100′"). Italic "Zuletzt gekocht: …" line.
- [x] **P5.6** 📷 "Foto aufnehmen oder hochladen" (fresh `<input type=file accept=image/*>` per tap — mobile-reliable); photo strip of own photos with per-photo delete (confirm; removes Drive file; newest photo first = title image).
- [x] **P5.7** Zutaten list (strings rendered verbatim incl. `🛒` markers and `Teig:`/`Belag:` prefixes).
- [x] **P5.8** "🛒 Zutaten zur Einkaufsliste" — adds **all** ingredient strings to the shopping list, auto-assigned to a store section via catalog substring match (fallback section "Aus Rezepten" 🍳); reports count; offers jump to the list.
- [x] **P5.9** Zubereitung as numbered list; Tipps as highlighted text box. *[v2 upgrades Tipps to structured display — see ambiguity A2.]*
- [x] **P5.10** 💬 **"Notiz für Claude"** feedback textarea + save button (1.6 s "✓ Gespeichert!" feedback) + explainer text. Writes `feedback` field — contract with the chat-Claude workflow in SCHEMA.md. **Must survive v2 unchanged.**
- [x] **P5.11** Actions: 👨‍🍳 Kochmodus · ✓ Heute gekocht · ✎ Bearbeiten · 🗑 Löschen · ← Zurück.
- [x] **P5.12** "✓ Heute gekocht": sets `lastCooked` to German "Monat Jahr" (e.g. "Juni 2026"), increments `cookedCount`, saves, refreshes list behind, 1.6 s button confirmation, stays in detail view.
- [x] **P5.13** Delete: confirm dialog; also deletes all own photos from Drive.

## 6. Kochmodus (fullscreen)

- [x] **P6.1** Fullscreen takeover; screen **wake lock** while open, released on exit; "📱 Bildschirm bleibt an" notice.
- [x] **P6.2** Two switchable modes: **Übersicht** (full checklist) and **Schritt für Schritt** (pager). Mode switch control top-right.
- [x] **P6.3** Collapsible Zutaten block — folds **without re-render** so running timers survive.
- [x] **P6.4** Tap-to-check ingredients and steps (strikethrough/dim). Progress persisted per recipe (v1: `localStorage kb_prog_<id>`; v2: IndexedDB) — survives accidental close. "zurücksetzen" link with confirm.
- [x] **P6.5** **Step timers**: minutes parsed from step text via `/(\d+)\s*(?:[–-]\s*(\d+)\s*)?Min/i` (range → upper bound). Timer button on every step (Übersicht) / current step (pager). Steps without a time: tap prompts for minutes. Running: live `m:ss` countdown, tap cancels. Done: green "✓ fertig!" + **alarm** (3 × 880 Hz WebAudio beeps + vibration pattern).
- [x] **P6.6** Multiple timers may run simultaneously (Übersicht); timers cleaned up on repaint and exit.
- [x] **P6.7** Pager: "Schritt x / y" counter, large 22 px step text, big number badge, ←/→ nav (disabled at ends), "Abhaken" toggle, done state dims card.
- [x] **P6.8** v2 additions (03_FEATURES §2 — not v1 parity but same module): **portion scaler** with live ingredient recompute, contextual Tipps inside cooking mode.

## 7. Add / Edit Form

- [x] **P7.1** Fields: Name* · Kategorie (select, exactly the 16) · Zeit (free text) · Portionen (default "~4") · Aufwand (—/⚡ alltag/✨ besonders) · Schwierigkeit (—/einfach/mittel/aufwändig) · Küche · Saison · 🍱 Meal-Prep checkbox · 🆕 Zu probieren checkbox · Bild-URL · Zutaten (line editor) · Zubereitung (numbered line editor) · Tipps (textarea).
- [x] **P7.2** Line editor: one input per row, **Enter = new row + focus**, ✕ removes row, auto-renumbering (steps), "+ Zeile hinzufügen", empty rows dropped on save.
- [x] **P7.3** New recipe: `id = "r" + Date.now()`, inserted at **top** of list, defaults (`lastCooked:""`, `rating:0`, `favorite:false`, `cookedCount:0`, `photos:[]`).
- [x] **P7.4** Edit: fields prefilled, `photos`/`feedback`/`rating`/etc. untouched, returns to detail view after save.
- [x] **P7.5** Validation: name required (alert); double-submit lock ("Speichere…"); error restores button + alert.

## 8. Einkaufsliste

- [x] **P8.1** Own view (via menu). v1 storage: `localStorage kb_shopping`, device-local. v2: IndexedDB, same device-local semantics (Drive sync of the list remains out of scope).
- [x] **P8.2** Header: open/done counts ("3 offen · 2 erledigt"); catalog search field; free-text add row ("Eigenes hinzufügen…", button + Enter, section "Sonstiges" 📝).
- [x] **P8.3** Item model: `{name, cat, icon, qty, done}`. Adding an existing name (case-insensitive) increments qty **and** un-checks it.
- [x] **P8.4** "Meine Liste": grouped by store-section in **catalog order**, section icons, tap name = toggle done (strikethrough), − / qty / + controls (qty 0 removes), ✕ remove, "Erledigte entfernen" bulk-clear.
- [x] **P8.5** Catalog: 14 sections (Gemüse 🥦, Obst 🍎, Milch & Eier 🥛, Käse 🧀, Fleisch & Fisch 🥩, Vegetarisch 🌱, Nudeln Reis & Co. 🍝, Konserven & Vorrat 🥫, Gewürze & Öl 🧂, Brot & Backwaren 🍞, Tiefkühl 🧊, Getränke 🥤, Snacks & Süßes 🍫, Haushalt & Drogerie 🧴) with ~150 items, each with icon. Collapsible sections; item tap = +1 with qty badge + tap animation (section stays open); search across all items.
- [x] **P8.6** Recipe-ingredient import (see P5.8) lands here grouped by matched section.
- [x] **P8.7** v2 additions (03_FEATURES §4): aggregation across a plan, amount summing, pantry-staples subtraction — layered on top of, not replacing, the v1 manual UX.

## 9. Koch-Match (Swipe Discovery)

- [x] **P9.1** Menu entry 🔥; deck = shuffled recipes **excluding** already-matched; current card + one "behind" card.
- [x] **P9.2** Card: hero image (or 🍽 placeholder), dark gradient, category badge, **Wochentags ⚡ / Wochenende 🍷 badge** (derived: weekend categories [Wochenend-Gerichte, Backen: Süßes & Kuchen, Sourdough & Sauerteig, Backen: Brot & Herzhaftes] or parsed time > 40 min), name, ⏱ time, ★ stars, "🥗 N Zutaten".
- [x] **P9.3** Pointer-drag with rotation + vertical drift; "Lecker"/"Nö" stamps fade in with drag distance; release threshold 110 px → fly-out animation; otherwise spring back.
- [x] **P9.4** Buttons: ✕ nope, 🔥 like, ↩︎ undo. Undo restores the card and removes the match if it was a like.
- [x] **P9.5** Matches persisted (v1: `localStorage kb_matches`; validated against existing recipe IDs on load). Gold match-stack button with live count. Match sheet: thumbnail rows (name, category, kind badge, time, stars), ✕ remove, tap → opens full recipe detail.
- [x] **P9.6** End-of-deck state: "Alles durchgeswipt! 🎉" + match count + "Matches ansehen" + "↻ Nochmal von vorn" (reshuffles the full deck).

## 10. Export

- [x] **P10.1** ⬇️ Markdown export: whole collection grouped by category in fixed category order; per recipe: name (+ ★ stars), Zeit | Portionen | Zuletzt, Zutaten (bullets), Zubereitung (numbered), Tipps. Copied to clipboard with confirmation.

## 11. Data Contract (SCHEMA.md — binding for v2)

- [x] **P11.1** Persisted file shape: `{version: 3, updated: ISO, recipes: [...]}` — flat v3 recipe objects, `ingredients`/`steps` as plain string arrays, `tips` as a single string, `time`/`servings` as display strings, numeric `prepTime`/`cookTime`/`totalTime`.
- [x] **P11.2** The 16 category strings, exactly as listed in SCHEMA.md — fixed, never extended.
- [x] **P11.3** `🛒` end-of-string convention for non-pantry ingredients — rendered as-is, carried into shopping list.
- [x] **P11.4** `image` (URL string, Claude may set) vs `photos` (app-managed Drive file refs `{id, added}`, **Claude never touches**) — both preserved verbatim through any v2 edit.
- [x] **P11.5** `feedback` workflow (user note → chat-Claude run incorporates → clears) — v2 must read/write the field and never clear it itself.
- [x] **P11.6** IDs never mutated; new IDs `"r" + Date.now()` (+ counter for batch).
- [x] **P11.7** UTF-8 umlauts preserved exactly on every write.

## 12. Live-Data Facts (migration inputs, verified 2026-06-09)

- 105 recipes; all IDs unique; `version: 3`.
- 103/105 have full v3 metadata; **2 originals lack it** (`r01` Süßkartoffel-Curry, `r1748713200000` Pasta e Ceci — no effort/cuisine/difficulty/times/mealPrep/toTry/tags).
- `photos`: empty everywhere; `image`: empty everywhere; `favorite`: none; `rating`: 1 recipe (r01 = 3).
- `feedback`: **1 non-empty** (r01 — pending chat-Claude run; must survive migration untouched).
- `lastCooked`: 2 recipes ("Mai 2026" format); `season` on 8 recipes (German capitalized: "Herbst", "Sommer", "Spätsommer", "Winter").
- `cuisine` values in use: Asiatisch, Deutsch, Französisch, International, Italienisch, Mediterran, Mexikanisch, Middle Eastern.
- `tips` strings largely follow a parseable convention: `Topping: … Swap: … Alltags-Upgrade: … Technik: …`.
- `time` strings include non-trivial formats: "55 Min (15 Vorb · 40 Backen)", "5–7 Tage (je 5 Min/Tag)", "24 Std (inkl. Gehzeit)" — `totalTime` (minutes, number) exists for 103/105, so planner filtering uses `totalTime`, falling back to parsing `time`.
