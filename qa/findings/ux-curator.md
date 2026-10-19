# UX-Curator — findings (2026-10-12T16:30:00Z)
_Build 2026-10-04-v2.14 · CACHE koch-v2.14-1 · tests 215/215 · HEAD 70e8b9d · mode FULL_

Read-only review from markup/CSS plus two small node probes (E1, scratch scripts in `$TEMP/uxprobe`, outside the repo). No browser, so every layout-shift claim is marked for a live check with exact steps.

## Field reports

### FR-01 — "Ingwer" lands on the shopping list randomly and multiple times
**UX verdict:** the list gives the user no way to tell why Ingwer is there or why there are several rows. That alone makes "random" and "without selecting it" the natural reading. Accidental taps are a plausible, unproven contributor. I found three UX mechanisms that produce "Ingwer, several times" without a deliberate tap on Ingwer. I cannot explain a truly spontaneous add from the UI layer. That is the sync paths, which belong to bug-hunter.

Ranked hypotheses (UX lens):

1. **Provenance-free aggregation, shown as a count or amount — E1.**
   - Probe against `rezepte.json`: 7 recipes contain "Ingwer", 6 of them with a 🛒 marker.
   - Adding the recipes one by one through the detail-sheet "Zutaten auf die Liste" button produced three Ingwer-ish rows: `1 Stück Ingwer, gerieben`, `5 Stück Ingwer`, and `0,5 TL gemahlene Nelken , 1 TL Ingwerpulver`. The last one is a data problem (see cross-lens).
   - "5 Stück Ingwer" is five recipes' "1 Stück" summed. `aggregateIngredients` records `sources` (`logic.js:93,104`), but `sources` is never rendered. Grep: it appears only in `logic.js`.
   - The row (`shopping.js:339-348`) shows the label and a ✕. Amount rows have no stepper (`shopping.js:345`), so "5 Stück" cannot be corrected, only deleted.
   - Result: a Wochenplan → list tap produces "5 Stück Ingwer" with no explanation. To the user that looks like "added multiple times by itself".
2. **The catalog tile badge does not reflect the row the tap changes — E1 (replica of `shopAdd` and the badge lookup).**
   - With a recipe row `5 Stück Ingwer` on the list, tapping the Ingwer tile creates a *new* row "Ingwer ×1", because the key is `ingwer|` and the recipe row's key is `ingwer|stück` (`shopping.js:73-76`).
   - The badge is set from `live().find(name match)`, which returns the *first* matching row, the recipe row with qty 1 (`shopping.js:456-460`).
   - Probe output: `tap 1: badge shows 1 | … 'Ingwer qty1'`, `tap 2: badge shows 1 | … 'Ingwer qty2'`, `tap 3: badge shows 1 | … 'Ingwer qty3'`.
   - The tile feedback is stuck at "1" while the hidden row climbs. A user who sees no change taps again, which produces "Ingwer ×3". This is a real feedback bug, not a theory.
3. **Silent increments from friends and partner — E2.**
   - A friend suggestion that matches an existing open row only does `qty+1` (`friendMerge.js:44-48`). The row keeps `author:"local"`, so the "von Anna" tag (`shopping.js:305-309`) never appears.
   - Partner-added rows are not tagged at all. `author` is always `"local"` (`listMerge.js:38`), and `fromTag` only handles friends.
   - The "👋 n Artikel von Freunden hinzugefügt" note exists only while the shopping view is mounted. It is registered in `renderShopping` (`shopping.js:140`), but `friendInbox.init()` pulls at app start (`app.js:84`) before any view listens. Imports then happen with no UI trace except the tab badge.
   - It also self-hides after 8 s (`shopping.js:143`).
4. **Layout shift under the finger — E2/E3, needs live check (UX-12).** Adding a tile re-renders the list above the catalog, so the grid moves. Details under UX-12.
5. **Low:** the shopping search term persists in a module variable (`shopping.js:24,109`). Re-entering the tab can show a filtered catalog from a past search. I consider it a visible state, not a cause.

What would confirm it on a device:
- (a) After a Wochenplan → Einkauf, read the Ingwer rows. If "5 Stück Ingwer" or several Ingwer rows appear, that is hypotheses 1 and 2.
- (b) Tap the Ingwer tile three times with a recipe-Ingwer row present. If the tile badge stays at 1 while a separate "Ingwer" row climbs, hypothesis 2 is confirmed.
- (c) The shift test is under UX-12.

## Status of previous findings (2026-06-14 → today)
IDs assigned now to the old items. No old item had an ID.

| ID | Title | Status | Note |
|----|-------|--------|------|
| UX-01 | No one-tap home; all nav behind ☰ | ✅ fixed | Bottom tab bar, 5 tabs, 62px high, `aria-current`, 🛒 open-count badge, hidden in cook mode and while a text field is focused (`ui/tabbar.js:17-39,46-55`, `ui/tabs.js:6-12`, `app.css:390-417`). 🍳 is now a real 44px home button in every `appHeader` (`ui/helpers.js:27,39`, `base.css:38-45`). v2.12. Retest of the old "FAB and ai-inputbar collide" worry: both are offset by `--tabbar-h` (`app.css:46,306`). |
| UX-02 | Primary actions in the top zone (cookbook search and chips) | ⏳ still open (low) | Navigation moved to the thumb zone, but search and filter chips still live in the sticky top header (`cookbook.js:164-174`). Accept or revisit. |
| UX-03 | Icon-only buttons rely on `title` | ⏳ partly fixed (med) | ☰, ✕ on sheets, home, shopping steppers and the tab bar now have `aria-label`. Still `title`-only, with emoji or glyph content that screen readers will announce as the glyph: `guide.js:15` (back ←), `match.js:71` (🔥 stack), `match.js:76-78` (undo, ✕, 🔥 swipe buttons), `match.js:220` (`match-rm`), `planner.js:114-116` (🔒 🔄 📖), `detail.js:39` (heart), `cookbook.js:182` (FAB "+", also hardcoded German), `settings.js:26` (👁). 12 buttons. My old claim "title is never announced" was too strong. `title` is a fallback name, but the emoji content wins, so the name is still wrong. |
| UX-04 | No visible focus ring | ⏳ partly fixed (low) | `base.css:48-51` now covers `.icon-btn .chip .menu-item .btn-primary .btn-sec .fab .rcard .match-row .tab` and `.brand-home`. Cards are `role=button tabindex=0` with Enter/Space (`cookbook.js:37,58-61`, `match.js:216,229`). Still no `:focus-visible` for the shopping controls (`.sl-btn .sl-dec/.sl-inc/.sl-rm .sl-sortbtn .sl-clear* .sl-share .cat-item .cat-head`), `.sw-btn`, `.card-heart`, `.heart`, `.ms`, `.seg-btn` or `.pager-nav button`. `-webkit-tap-highlight-color: transparent` is global (`base.css:3`), so on those controls there is no focus indication at all. Needs a keyboard check. |
| UX-05 | Sheets not keyboard-dismissable, no focus trap | ✅ fixed | `ui/sheet.js:21,41-59`: Esc closes, Tab trap, focus restore, `role=dialog aria-modal`. The 450 ms ghost-click guard is kept. Good. |
| UX-06 | Hardcoded German in UI paths | ⏳ partly fixed (low) | The two old ones (`schemaFail`, `photoFail`) now go through i18n (`i18n.js:146,253` and the other three languages). Still hardcoded German: `assistant.js:236` "Speichern fehlgeschlagen", `export.js:27,29`, `planner.js:185` (the `planner.needPlan` key exists, `i18n.js:234`), `helpers.js:134` "+ Zeile hinzufügen" (the `addRow` key exists, `i18n.js:169`), `cookbook.js:182` title "Neues Rezept", `detail.js:39` "Favorit", `settings.js:26` "anzeigen". |
| UX-07 | `alert/confirm/prompt` for errors and destructive actions | ⏳ still open (low) | Count rose to 39 call sites (grep). The shopping-relevant ones use `confirm()` as a navigation dialog (see UX-14). |
| UX-08 | Touch targets under 44px | ⏳ partly fixed (med) | Fixed: `.icon-btn` 44×44 (`base.css:56-60`), `.sl-dec/.sl-inc/.sl-rm` 44×44 (`app.css:270,272`), `.sl-btn` 44 (`app.css:238`), tabs. Still short, and this matters in a shop (cold or wet hands): `.sl-clear` / `.sl-clear-all` / `.sl-share`, 13px underlined text with no padding, about 20px high, 12px apart (`app.css:224-227`). `.sl-sortbtn` about 31px (`app.css:261`). `.sl-undo-btn` about 33px (`app.css:259`). `.chip` about 34px (`app.css:11-14`). `.card-heart` about 30px (`app.css:43`). `.seg-btn` about 28px. `.reset-prog` 12px text (`app.css:162`). `.photostrip .rm` 24px (`app.css:100`). Pixel sizes are from CSS arithmetic and need a device check. |
| UX-09 | Cook-mode ergonomics | ✅ still good | Pager text 22px (`app.css:168`), 44px step number, wake-lock (`cooking.js:15-21`), vibrate (`cooking.js:42`), nav buttons about 48px (`app.css:171`). Only nit unchanged: `reset-prog`. |

## New findings

### UX-10 Shopping rows hide where they came from; duplicates are indistinguishable · impact: high · effort: M · evidence: E1
- **Where:** `shopping.js:339-348` (`rowHTML`), `shopping.js:305-309` (`fromTag`), `logic.js:93,104` (`sources` collected, never shown), `friendMerge.js:44-48`, `listMerge.js:38`.
- **Issue:**
  - A row says "5 Stück Ingwer" or "Ingwer" with no reason.
  - Recipe, plan, tile, partner and friend adds look the same, except a friend-created row gets "von Anna".
  - A friend or partner adding something already present just bumps it, with no sign.
  - Three differently keyed Ingwer rows can coexist (`ingwer, gerieben|stück`, `ingwer|stück`, `ingwer|`, E1).
  - The same item is shown in two different count idioms: stepper plus qty ("Ingwer 1 + −") vs amount text ("5 Stück Ingwer", no stepper).
  - This is the user-visible core of FR-01.
- **Fix (behaviour-level):**
  - Add a secondary line or chip under each row naming the origin: "aus 5 Rezepten" (tap for the recipe names), "aus Plan", "von Anna", "von Partner", "manuell".
  - Keep a friend or partner tag even when the item merges into an existing row, for example "+1 von Anna" for a day.
  - Give amount rows a way to correct the amount, either a stepper in portions or tap to edit.
  - Make duplicate-looking rows visually adjacent (the same aisle already groups them) and mark them "ähnlich: Ingwer".
- **Needs live check:** no (probe and trace). The wording and layout can be judged on a phone.

### UX-11 Catalog tile badge lies after a recipe item exists, so users tap again · impact: high · effort: S · evidence: E1
- **Where:** `shopping.js:420-427` (`catItemHTML` badge), `shopping.js:453-465` (tap handler).
- **Issue:**
  - See FR-01 hypothesis 2. The badge reads the first same-named row, but `shopAdd` increments (or creates) the row whose key is `name|`.
  - The probe shows the badge stuck at 1 while the "Ingwer" row climbs to 3.
  - The only other feedback is a 220 ms scale animation (`app.css:280`). It never confirms which row changed or by how much.
  - The row that is increased is also unrelated to the tile's *visible* position, because the list is above and probably off-screen.
- **Fix:**
  - Make the badge show exactly what the tap changed. Read the row `shopAdd` returned, not a name match. Better: show the *sum* of all rows for that name.
  - Add a clear "+1 → Ingwer ×3" micro-toast or snackbar with Undo.
  - Do not merge silently across keys. Either unify the keys (bug-hunter's call) or make the UI show the combined state.
- **Needs live check:** no.

### UX-12 List re-render above the catalog moves the tiles under the finger · impact: high · effort: M · evidence: E2 (trace), E3 for the real-world effect
- **Where:** `shopping.js:455-464` (tap → `shopAdd` → `paintList`), `shopping.js:311-373` (`el.innerHTML` replaced), layout order `shopping.js:117-119` (`#shop-sync`, `#shop-list`, `#shop-catalog`).
- **Issue:**
  - A new item adds one list row of about 61px (8+44+8+1 border, `app.css:264,270`). A new aisle also adds an aisle heading of about 30px (`app.css:263`).
  - A tile grid pitch is about 90px (12+icon line+name+12 padding plus the 8px gap, `app.css:276-277`).
  - So after each add, tiles move down by roughly two thirds of a tile. A second tap at the same screen spot lands on the tile one row above (same column). Ingwer sits at position 19 of 26 in the Gemüse grid, so its neighbours (Avocado, Chili, Knoblauch…) are all one-row mis-tap candidates.
  - Chrome's scroll anchoring may hide this while the list is scrolled *out of view*. It does not help while the list is partly visible, which is the normal case for a short list, because the anchor node gets replaced by `innerHTML`. iOS Safari has no scroll anchoring. There is no `overflow-anchor` rule.
  - Other shifts above the grid, none of which the user triggers:
    - The sync card pops in after its async `getMeta` and `getInbox` reads, so everything jumps down (`shopping.js:147-151,164-191`).
    - The friend status line appears for each "Hole Vorschläge …" sync and disappears again (`shopping.js:184`, `friendInbox.js:97`; `idle` and `off` are hidden).
    - The friend note appears and disappears after 8 s (`shopping.js:143,183`).
    - `listSync.onChange` repaints the list and the catalog on a background merge (`shopping.js:135`).
- **Fix:**
  - Keep the tapped area stable. Options:
    - A: put the catalog in a bottom sheet ("＋ Artikel hinzufügen") so the list never moves under a tapping thumb. The list repaints after the sheet closes.
    - B: reserve space (fixed-height sync card, status in a fixed line, reserved note slot).
    - C: after a tile add, do not repaint the list synchronously. Update the list rows in place and compensate scroll.
  - Show a compact "Zuletzt hinzugefügt: Ingwer ×1 (Rückgängig)" line near the thumb, not above.
- **Needs live check:** yes. Steps (Pixel 9, Chrome): (1) Open Einkauf with 2 to 3 items, open Gemüse. (2) Screen-record at 60 fps, tap Lauch once, and note whether the tile row moves. (3) Tap the same screen position again and note which tile gets the +1. Repeat with friends-link on, and watch the first 3 seconds after opening the tab for movement.

### UX-13 Single-item delete and "Erledigte löschen" have no undo, and ✕ sits 6px from + · impact: med · effort: S · evidence: E2
- **Where:** `shopping.js:392-394` (`.sl-rm`), `shopping.js:398-403` (`.sl-clear`), `app.css:268-272`; compare `shopping.js:404-415` (clear-all has a 6 s undo).
- **Issue:**
  - The 44px ✕ is 6px from the 44px + (`.sl-ctrl` gap 6px). One mis-tap deletes the item with no way back.
  - "Erledigte löschen" (text link) is next to "Alles löschen" and "Teilen" (12px gap, about 20px tall) and also has no undo.
  - The undo exists only for "Alles löschen", where it is shown only when the list is empty afterwards.
  - There is no confirmation of a plain `+` / `−` either.
- **Fix:**
  - Generalise the existing undo into a bottom snackbar for every list mutation (add, remove, clear done, clear all), with the last action named ("Ingwer entfernt, Rückgängig").
  - Separate ✕ from the stepper (more gap, or move ✕ to a swipe or long-press).
  - Give the three header actions 44px targets with more spacing.
- **Needs live check:** no for the missing undo. Yes for spacing feel.

### UX-14 "Added n items" is a native `confirm()` and describes nothing · impact: med · effort: M · evidence: E2
- **Where:** `detail.js:152-163`, `planner.js:165-175` (message built from `detail.addedToShopping` plus `switchToList`), `logic.js:109`.
- **Issue:**
  - The dialog says how many *distinct lines* were added, not what, and it counts a merge into an existing row as an "added" line. After an add, the user cannot see whether Ingwer was already there or got summed.
  - Adding the same recipe twice sums amounts (`logic.js:127-130`) with no hint.
  - OK/Cancel on a native `confirm()` also reads as "OK = switch to list", while Cancel leaves the user unsure whether the items were added at all. They were, because `addItemsToList` ran first (`detail.js:161`, `planner.js:172`).
- **Fix:**
  - Replace it with a preview or result sheet. It lists each line with a checkbox ("5 Stück Ingwer — aus 5 Rezepten", "bereits auf der Liste → +1") and a primary "Zur Liste" button. Or add first and show a snackbar "12 Artikel hinzugefügt, davon 3 aufaddiert · Ansehen · Rückgängig".
- **Needs live check:** no.

### UX-15 Imports from friends and partner change the list silently · impact: med · effort: S · evidence: E2
- **Where:** `shopping.js:140-145` (`onImported`, shopping view only), `app.js:84` (`friendInbox.init()` at start), `friendMerge.js:44-48`, `ui/tabbar.js:39` (badge only).
- **Issue:** See FR-01 hypothesis 3.
  - Importing at app start leaves only the 🛒 tab badge changed (`listSync.onCount`, via `applyExternal`).
  - The note shows only if the user is already on the Einkauf tab, and then for 8 s.
  - Partner merges (`listSync.onChange`) produce no note at all.
- **Fix:**
  - Keep a persistent "Neu seit deinem letzten Besuch" marker per row, or a dismissible banner that stays until the next visit to the tab.
  - Add a one-line sync log ("Anna +1 Ingwer, vor 2 Min").
- **Needs live check:** no.

### UX-16 Done-toggle is an unlabeled `span`; state is shown only by strike-through and opacity · impact: low · effort: S · evidence: E2
- **Where:** `shopping.js:343,377-379`, `app.css:265-267` (cursor pointer, opacity .45).
- **Issue:**
  - `.sl-name` is a plain `<span data-i onclick>`. It has no role, no tabindex, no `aria-pressed` or `aria-checked`, so it is not keyboard- or screen-reader-operable, and there is no checkbox affordance.
  - Whether the tap means "done" is learned by accident.
  - Strike-through at 45% opacity of 16px text may not hold contrast in a bright shop (needs a live check).
- **Fix:** Make the row a real toggle (`<button role="checkbox" aria-checked>` or a visible checkbox), at least 44px high, and keep the label readable when done.
- **Needs live check:** yes (read it outdoors or at full brightness).

### UX-17 Shopping header is very tall and sticky · impact: med · effort: S · evidence: E3 (confidence: low)
- **Where:** `shopping.js:101-115` (`appHeader` with search plus custom-add in `extra`), `base.css:21-27` (`.app-header` sticky), `app.css:3-7,218-220`.
- **Issue:**
  - Header = 14px top padding + brand row (44px) + subtitle + search (about 62px with margin) + add row (about 52px). I estimate 200 px or more plus the safe-area inset, plus the 62 px tab bar. Together they could leave only about 55-60% of the viewport for the list on a 6.3" phone.
  - In a supermarket, ticking items off is the main job. The two input fields are not.
- **Fix:** Collapse search and custom-add into one smart field ("Suchen oder hinzufügen") and only make the brand row sticky. Alternatively scroll the inputs away with the page.
- **Needs live check:** yes. Steps: (1) Open Einkauf on the Pixel 9 with 8+ items. (2) Screenshot. (3) Measure what fraction is the list.

## Checked and refuted
- **"Does the tab bar overlap content or the FAB?"** No. `body` bottom padding and `--tabbar-h` offsets are applied (`base.css:17`, `app.css:46,306`), and `body.no-tabbar` handles cook mode (`base.css:64`). The FAB is correctly above the bar.
- **"Do sheet ✕ buttons lack names?"** They have `aria-label` now (shopping sheets `shopping.js:206,245`, `cooking.js:206`).
- **"Can a tile be triggered by scroll-touch?"** No. They are plain `<button>`s with `onclick`, so a scroll gesture does not fire click. There is no touchstart handler.
- **"Does `typing` hiding the tab bar shift content?"** No. The bar is fixed and body padding does not change on `typing` (`app.css:415-417`).
- **"Is the stale shopping search a likely cause of FR-01?"** Low. It is visible in the sticky search field. See hypothesis 5.
- **"Can a friend add Ingwer by tapping?"** No. `add.html` is free text with a "Steht schon drauf" warning (`add.html:153`), so a friend adds only by typing.

## Verified clean
- Tab bar markup, labels, badge text, aria-current and hide rules (`ui/tabbar.js`, `ui/tabs.js`, `app.css:390-417`).
- Sheet helper: Esc, trap, restore, dialog role, ghost-click guard (`ui/sheet.js`).
- Shopping empty state and sync/friends status wording: every status has words in four languages (`shopping.syncState.*`, `shopping.friends.state.*`).
- The "gone"/"error" copy for the friends link is honest and actionable.
- Cook-mode legibility, wake-lock, vibration, step navigation size.
- Cookbook cards: keyboard operable, nested heart does not hijack Enter/Space (`cookbook.js:58-61`).
- Not re-audited this run: Lager, Capture, Assistant, Match deck internals, Settings, onboarding. The previous run's notes on offline/no-key states still stand, but I did not re-read those paths.

## Cross-lens notes
- → bug-hunter: `shopAdd` keys the tile `name|` while recipe rows are keyed `name|unit` (`shopping.js:73-76` vs `logic.js:87`). Combined with the first-match badge lookup (`shopping.js:456`), it creates parallel rows. Whether to normalise keys, or merge unitless tile adds into an existing same-name row, is a data decision.
- → data-guardian: `rezepte.json` Gewürzkuchen has one ingredient line `"½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"` (two ingredients, comma-joined). It reaches the list as one item `0,5 TL gemahlene Nelken , 1 TL Ingwerpulver` under "Gemüse" (E1).
- → bug-hunter (FR-01 root cause): the spontaneous part still needs `friendInbox.doSync` / `applyExternal` / tombstone-revival tracing. UX confirms only that those paths are invisible to the user (UX-15).

## Definition drift
None found. The agent file's description (shopping `paintList`/`paintCatalog` re-render, bottom tab bar, `ui/sheet.js`) matches the tree.

---

## Part B — Delight ideas
*(💡 ideas, not a plan. Each is tied to an existing module so it's buildable.)*

**Shopping and FR-01 (the problem space, several options)**
- 💡 **"Warum steht das hier?" chips** (`shopping.js` `rowHTML`, `logic.js` `sources`). A little chip per row: "5 Rezepte" opens a sheet with the recipe names, "von Anna", "Plan Mi–Fr". Data already exists in `sources`.
- 💡 **Add-sheet instead of inline catalog** (`paintCatalog` into `openSheet`). A tidy "＋ Artikel" sheet at the bottom. Tapping tiles bumps in place, with a "Fertig (3 neu)" button. The list never moves under the finger.
- 💡 **"Zuletzt hinzugefügt" strip with one-tap undo** (`shopAdd`, `undoSnapshot`). The last 5 changes with sources, so "where did Ingwer come from?" has an answer, and a shake-to-undo (DeviceMotion) is a bonus.
- 💡 **Preview-and-merge sheet for "Plan → Einkaufsliste"** (`planner.js:162-175`, `logic.js` `mergeItems`). Lines grouped by aisle, each with a checkbox, and "Ingwer: 5 Rezepte → 1 Knolle?" with a smart rounding hint for "Stück" items.
- 💡 **Supermarkt-Modus** (`shopping.js` `sortMode`). Hide catalog, search and sync cards. Show the list as large 56px rows in aisle order, swipe right to tick, sticky "noch 7 offen". Tab bar stays.
- 💡 **Voice add** (`shopping.js` `addCustom`, Web Speech API): "Ingwer, Hafermilch, zwei Zitronen". Parsed into `shopAdd` calls with a confirmation line.
- 💡 **Haptic and sound tick on add** (`navigator.vibrate(10)`). The tile pulses and shows the new total. The existing `.just-added` scale (`app.css:280`) is a start.

**Cooking and cookbook**
- 💡 **"Gekocht!" celebration** (`cooking.js:224-228` finish button). Confetti or steam animation. It also stamps `lastCooked` and increments `cookedCount` (like `detail.js:166-174`). Today "Fertig" only exits, so the metadata is easy to forget.
- 💡 **Hands-free cook mode** (`cooking.js` pager, wake-lock already on). Big left/right tap zones across the whole step card, optional "weiter / zurück" voice via Web Speech, and a "Timer läuft"-pill that survives step changes.
- 💡 **"Heute Abend" home card** (`cookbook.js` header, `lager/logic.js`, `planner/logic.js`). Top card: "Planung sagt Mapo-Tofu, im Lager fehlen Sojasoße und Ingwer → 2 Dinge auf die Liste." One tap to add only the missing items.
- 💡 **Default food photos by category** (`app.css:38` thumb, `cookbook.js` `cardHTML`). Soft category-coloured illustrations instead of the blank `--line-soft` block.
- 💡 **Share a recipe** (`detail.js`, `export.js`, Web Share API). One recipe as text or link, optionally via the friends-link infrastructure.
- 💡 **Mise-en-place view** (`cooking.js` ingredient list). A pre-cooking checklist with big tick targets that dims as you gather ingredients, so you start step 1 with everything ready.
- 💡 **Match deck micro-haptics** (`match.js`). A light `navigator.vibrate` on commit, and the stamp animation (already there) gets a spring.

---

## Top 3 to do next
1. **UX-11 — make the tile badge and feedback truthful (S).** Show the combined count for that name and add an "+1 Ingwer → 3 · Rückgängig" snackbar. This kills the "I tapped and nothing happened, so I tapped again" loop that the probe reproduces.
2. **UX-10 — show origin on every row (M).** Origin chips ("aus 5 Rezepten", "von Anna", "Plan"), keep friend and partner tags on merges, and make amount rows correctable. This answers "why is Ingwer there, and why several times?" for FR-01 without needing the sync trace.
3. **UX-12 — stop the grid moving under the finger (M).** Move the catalog into an add-sheet or reserve space. Run the 3-step live check first, because it decides whether the fix is urgent or defensive. After that, UX-13 (undo for every list action) gets the same snackbar for free.

## Summary
14 open items by impact (the 3 new FR-01 findings in the "high" row): **high 3** (UX-10, UX-11, UX-12), **med 6** (UX-03, UX-08, UX-13, UX-14, UX-15, UX-17), **low 5** (UX-02, UX-04, UX-06, UX-07, UX-16). Previous items: UX-01 and UX-05 fixed, UX-09 still good, the other six partly open.
The single most valuable item is **UX-11**, the stuck tile badge. It is small, certain (E1) and directly explains repeat-adds of Ingwer.
