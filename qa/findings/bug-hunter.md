# Bug-Hunter — findings (2026-10-12T16:29:50Z)
_Build 2026-10-04-v2.14 · CACHE koch-v2.14-1 · tests 215/215 · HEAD 70e8b9d · mode FULL_

## Field reports

### FR-01 — "Ingwer gets added randomly and multiple times without me selecting it"
**Verdict: reproduced (E1), cause found. It is not a ghost writer.** The code has exactly four paths that
put items on the list: `shopAdd` (catalog tile / free text, `shopping.js:70`), `addItemsToList`
(the recipe button `detail.js:151` and the plan button `planner.js:162-172`), `applyExternal` (friends
inbox, `friendInbox.js:93`) and the item-by-item Drive merge (`listSync.js:94-111`). Nothing adds items on
a timer or at startup. Ginger comes in from the **recipe/plan buttons**. It turns into several rows because of
four defects that add up:

| # | Hypothesis | Result | Evidence |
|---|---|---|---|
| 1 | **"Without selecting" = Plan → Einkaufsliste.** Ginger is marked 🛒 in 6 dinner recipes (4 of them "Asiatisch inspiriert"). | **Confirmed.** In 2000 random `generatePlan` weeks, **1500 (75 %) contain at least one ginger row**, and 216 contain more than one. A random weekly plan means ginger shows up "randomly". | E1 `fr01_b.mjs` |
| 2 | **The Lager doesn't stop it.** Even with ginger marked as in stock, it gets added. | **Confirmed → BH-04.** `needsBuying` returns true for any 🛒 line before it looks at the Lager. | E1 `fr01_d.mjs` |
| 3 | **"Multiple times" = different merge keys.** | **Confirmed → BH-05.** Plan + tile + plan again → 4 ginger-looking rows: `2 Stück Ingwer, gerieben` · `2 Stück Ingwer` · `1 TL gemahlene Nelken , 1 TL Ingwerpulver` (🫚, Gemüse) · `Ingwer`. | E1 `fr01_b.mjs` |
| 4 | **Catalog badge shows a different row's count** → the tap looks like it did nothing → user taps again. | **Confirmed → BH-06.** The badge reads `1` (the qty of the `2 Stück Ingwer` row) while the tap builds a separate `Ingwer` row. | E1 `fr01_b.mjs` |
| 5 | Pressing plan/recipe → list again adds everything again | **Confirmed (by design: `mergeItems` sums amounts)**, but nothing tells the user it already happened, and the recipe button has no in-flight guard → BH-10. | E1 / E2 |
| 6 | Partner merge keeps duplicates (union by id) | **Confirmed → BH-08**, only matters if a partner list is linked. | E1 `fr01_c.mjs` H-A |
| 7 | Tombstone revival creates a duplicate | **Confirmed → BH-07** (`mergeItems` revives the *first* key match, even a deleted one, while a live row with the same key exists). | E1 `fr01_c.mjs` H-B |
| 8 | Friends inbox re-applies items (`seen`/`fl_ack`/`trimSeen`) | **Refuted.** A repeat pull with `seen` adds 0. Only a lost `seen` would double-count, and `seen` is saved before `fl_ack`. Friend items also carry a visible "von X" tag. | E1 `fr01_c.mjs` H-C |
| 9 | Background `listSync` merge brings back a deleted row | **Refuted for normal use** (a newer tombstone beats an older live copy). Only a device that was offline for more than 30 days brings rows back → BH-11. | E1 H-D/H-E |
| 10 | Wrong tap target: the catalog grid moves down under the finger when `paintList` inserts a row above it | **Unconfirmed, E3, low.** On a ~412 px phone `.cat-grid` (`minmax(96px)`) has 3 columns. Ingwer is Gemüse row 7, col 1, directly above Basilikum. Tapping a *new* item adds a list row (plus maybe an aisle header) and pushes the grid down about one tile row, so a fast second tap on Basilikum can land on Ingwer. This doesn't explain why it is *always* ginger, and the layout wasn't run. | E3 |

**Open questions for Marcel (only the answers can rule out #6 and #10):**
(a) Does a ginger row look like `1 Stück Ingwer…` (comes from a recipe or the plan) or like plain `Ingwer` with a −/+ counter (comes from a tile or a friend; a friend's row also shows "von …")?
(b) Did you use "Plan → Einkaufsliste" or "Zutaten auf die Liste" before it showed up?
(c) Is a partner list linked, or is the friends link on?
(d) Is ginger in your Lager? If yes, BH-04 is the whole story.

## Status of previous findings
The previous report (2026-06-14) had no IDs. They are assigned here.

| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | ✅ fixed | 9019e8c (v2.7): `decideSync.js:17-32` returns `"conflict"`, and `sync.js:114-121` keeps the local copy |
| BH-02 | Match "Nochmal" shows recipes you already matched | ⏳ still open | `features/match/match.js:120` shuffles all `state.recipes`. The first deck (`:91`) filters out `swipeMatches`. Fix: use the same filter. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | ⏳ still open | `features/cooking/cooking.js:268-273` (prev/next/check → `paint()` → `clearTimers()` at `:201`). P3 · E2 · M |

## New findings

### BH-04 [P1] Lager stock is ignored for every recipe that uses 🛒 markers (82/105) · confidence: high · evidence: E1
- **Where:** `v2/src/features/shopping/logic.js:43-44` (`needsBuying`). Callers: `planner.js:171` and `detail.js:159` both pass `staples` from `settings.getStaples()` (`data/settings.js:44-46`, which is Lager + fridge + basics).
- **What breaks:** The user marks ginger as in stock in the Lager (pantry or fridge) and then runs Plan → Einkaufsliste. Ginger still lands on the list. The reverse also happens: a staple switched *off* in the Lager (e.g. Kichererbsen used up) is never added for marker recipes. The UI promises otherwise: `i18n.js:281` "Diese Artikel überspringt die Einkaufsliste", and `:332` "Vorrat wird automatisch abgezogen".
- **Why:** `if (/🛒/.test(raw)) return true; if (recipeUsesMarkers) return false;` returns before `staples` is ever read. For 82 of 105 base recipes the Lager has no effect at all.
- **Proof:** `needsBuying('1 Stück Ingwer 🛒', staples incl. Ingwer) = true`, and Thai curry → list → "Ingwer STILL added". 82/105 recipes use markers. 42 of the 199 marked lines match a default staple, so the Lager would suppress them if it were checked.
- **Fix:** Check the Lager first for every line: if the parsed item matches an in-stock name, skip it whatever the marker says. Use 🛒 / no-marker only as the fallback when nothing in the Lager matches. Pass the Lager list separately from `DEFAULT_STAPLES` so the "no-marker recipe" fallback keeps working.
- **Regression test:** `needsBuying: Lager beats 🛒` with `"1 Stück Ingwer 🛒"`, `{recipeUsesMarkers:true, staples:["Ingwer"]}` → `false`. Also `aggregateIngredients([thaiCurry], {staples:[...,"Ingwer"]})` → no `Ingwer` item.
- **Effort:** S

### BH-05 [P1] The same ingredient becomes several list rows that never merge · confidence: high · evidence: E1
- **Where:** `logic.js:50-52` (`itemKey` = whole parsed item text + unit), `logic.js:85-87` (`aggregateIngredients`), `logic.js:120-123` (`mergeItems`), `shopping.js:73-74` (`shopAdd` key with no unit).
- **What breaks:** Ginger from different recipes and from the tile shows up as `Ingwer, gerieben|stück`, `Ingwer|stück` and `Ingwer|` — three rows, plus an `Ingwerpulver` row in Gemüse (BH-09). The user sees "Ingwer" several times.
- **Why:** The key keeps the prep note (", gerieben") and the unit. The catalog tile always has `unit:null`. Nothing normalises keys to the catalog name.
- **Proof:** `fr01_a.mjs`: keys `ingwer, gerieben|stück`, `ingwer|stück`, tile `ingwer|`. `fr01_b.mjs` ends with 4 ginger-looking rows (see FR-01 table).
- **Fix:** Build the merge key from the catalog match name (`ingMatchCat(name)` → canonical `Ingwer`) with prep notes stripped (`, gerieben`, `(…)`). When units differ, keep one row and show the amounts combined (e.g. "1 Stück + 1"), or fall back to qty. Use the same key function in `shopAdd`, `mergeItems`, `applyFriendItems` and `catItemHTML`.
- **Regression test:** `mergeItems: Zubereitungs-Zusatz merged` with `"1 Stück Ingwer, gerieben 🛒"` + `"1 Stück Ingwer 🛒"` → 1 row, amount 2. Then `shopAdd("Ingwer")` → still 1 row.
- **Effort:** M

### BH-06 [P2] Catalog badge shows the count of a different row → the tap looks like a no-op → repeated taps · confidence: high · evidence: E1
- **Where:** `shopping.js:420-426` (`catItemHTML`) and `shopping.js:455-461` (tile click updates the badge). Both use `live().find(name === low)`, matching on name only and taking the first hit.
- **What breaks:** With `2 Stück Ingwer` (from a recipe) on the list, a tap on the Ingwer tile creates a separate `Ingwer` row (BH-05), but the badge keeps showing **1**, the recipe row's `qty`. Amount rows always have qty 1. The tap looks like it didn't register, the user taps again, and the hidden tile row climbs to ×2, ×3.
- **Why:** The badge lookup (name only) and the `shopAdd` lookup (name + `unit:null` key) disagree on which row "is" Ingwer.
- **Proof:** `fr01_b.mjs`: `catalog badge for Ingwer shows qty: 1 (row: 2 Stück Ingwer)` while a separate `Ingwer ×1` row exists.
- **Fix:** Have the badge use the same row `shopAdd` changes. Either return the touched item from `shopAdd`, or share one `findSame()` helper. Better still, fix BH-05 so there is only one row.
- **Regression test:** pure helper `findCatalogRow(items,"Ingwer")` with `[recipe row 2 Stück Ingwer, tile row Ingwer qty 3]` → returns the tile row (qty 3).
- **Effort:** S

### BH-07 [P2] `mergeItems` revives a deleted row although a live row with the same key exists → duplicate · confidence: high · evidence: E1
- **Where:** `logic.js:123-125`
- **What breaks:** The list holds a tombstone and a live row with the same key. This happens after a partner merge (BH-08) where one copy was deleted, or when a friend item was created next to a deleted tile row (`friendMerge.js:105` skips tombstones). Adding a recipe then brings the tombstone back *and* leaves the live row, so two identical rows appear.
- **Why:** `out.find((x) => keyOf(x) === key)` returns the first match, which may be the tombstone. `shopAdd` (`shopping.js:76`) gets this right by preferring live rows; `mergeItems` doesn't.
- **Proof:** `fr01_c.mjs` H-B: before `live:1 Stück Ingwer` → after `old:1 Stück Ingwer, live:1 Stück Ingwer`.
- **Fix:** `const hit = out.find(x => !x.deleted && keyOf(x) === key) || out.find(x => keyOf(x) === key);`
- **Regression test:** `mergeItems: lebender Artikel vor Tombstone` with `[tomb(key K), live(key K)]` + incoming K → 1 live row, amount summed, tombstone stays deleted.
- **Effort:** S

### BH-08 [P2] Partner sync never merges the same item added on two devices · confidence: high · evidence: E1
- **Where:** `features/shopping/listMerge.js:8-16` (`mergeList` unions by `id`), called from `listSync.js:94` and `:103`.
- **What breaks:** Marcel and his partner each press "Plan → Einkaufsliste" (or tap Ingwer). After sync both see two `1 Stück Ingwer` rows. Every sync keeps both.
- **Why:** Local adds merge by name+unit key, but the cross-device merge goes by id. Two independent adds create two ids.
- **Proof:** `fr01_c.mjs` H-A: `B after sync: li-…os85gh:1 Stück Ingwer, li-…d1u1xl:1 Stück Ingwer`.
- **Fix:** After `mergeList`, fold live rows with the same key into the older id (sum amounts/qty, tombstone the other with a fresh `updated`). This has to be deterministic (lowest id wins) so both devices converge.
- **Regression test:** `syncStep: gleicher Artikel auf zwei Geräten` → after A↔B sync exactly one live `Ingwer|stück` row, amount 2, and a second sync is a no-op.
- **Effort:** M

### BH-09 [P3] Two ingredients on one line become one bogus list row in the wrong aisle · confidence: high · evidence: E1
- **Where:** `data/derive.js` `parseIngredient` (via `logic.js:84-88`). The catalog match picks the longest substring.
- **What breaks:** 8 rows in the base recipes, e.g. `🫚 0,5 TL gemahlene Nelken , 1 TL Ingwerpulver [Gemüse]` (ginger icon in the vegetable aisle — part of FR-01's "Ingwer" sightings) and `🍄 300g Champignons , 1 Zwiebel, 200ml Sahne, Öl/Butter [Gemüse]`.
- **Why:** These are data lines with several ingredients joined by commas. The parser treats the line as one item.
- **Fix:** In `aggregateIngredients`, split a 🛒 line on `,` followed by a quantity (`/,\s*(?=[\d½¼¾])/`) before parsing. Long term, fix the data (→ data-guardian).
- **Regression test:** `aggregateIngredients: Mehrfach-Zeile` with `"½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"` → 2 items, `Nelken` and `Ingwerpulver`.
- **Effort:** S

### BH-10 [P3] "Zutaten auf die Liste" has no in-flight guard; pressing it again silently doubles everything · confidence: med · evidence: E2
- **Where:** `features/cookbook/detail.js:151-163`. Compare `planner.js:164-165`, which disables its button.
- **What breaks:** A double tap, or tapping again after cancelling the "switch to list?" confirm, runs `addItemsToList` twice. Every amount doubles (ginger 1 → 2 Stück). Nothing says the items are already on the list.
- **Why:** No `btn.disabled` while the async import / `getStaples` / `addItemsToList` chain runs, and `mergeItems` sums by design.
- **Fix:** Disable the button for the duration, the way the planner does. Optionally, if every aggregated item is already on the list from this recipe (`sources`), ask before adding again.
- **Regression test:** none pure. Manual: double-tap the button → amounts must stay single.
- **Effort:** S

### BH-11 [P3] A device offline for more than 30 days brings deleted rows back · confidence: high · evidence: E1
- **Where:** `listMerge.js:38-41` (`pruneTombstones`, 30 days) together with `mergeList` union.
- **What breaks:** A row deleted on phone A gets pruned after 30 days. Laptop B, unsynced since before the delete, still holds it live. When B syncs, the row reappears on both devices "on its own".
- **Proof:** `fr01_c.mjs` H-E: Drive after prune: 0 items → after the old device syncs: `x:1 Stück Ingwer`.
- **Fix:** Store the prune horizon in the file (e.g. `prunedBefore`) and drop incoming live items whose `updated` is older than it. Otherwise this is an accepted trade-off and should be documented.
- **Regression test:** `syncStep: veraltetes Gerät nach Prune` → the item stays gone.
- **Effort:** S

## Checked and refuted
- Friends inbox double-applies a suggestion on re-pull: `seen` covers it (E1). `seen` is saved before `fl_ack` (`friendInbox.js:97-100`).
- Stale `data-i` after a background `onChange`: every `onChange` repaints the list synchronously (`shopping.js:135`), and indices only point into `ITEMS`, which is never spliced (tombstones only).
- Lost tap during `listSync.doSync`: taps during the network round-trip are picked up by the `latest` re-read (`listSync.js:102-103`). The remaining window (between that read and `db.put(final)`) is a few ms and could only *lose* an edit, never duplicate one.
- Planner ignores translated categories: categories stay canonical German in the overlay (`rezepte.snapshot.en.json`), so `MEAL_CATEGORIES` matches.
- Any automatic or timer-driven list add: none exists. Only the four write paths listed under FR-01.

## Verified clean
- i18n: every literal `t("…")`/`tn("…")` key under `src/` resolves in de/en/es/da (E1 probe, plural `_one/_other` included). The dynamic `shopping.syncState.*` / `shopping.friends.state.*` keys all exist.
- `friendMerge.applyFriendItems` / `trimSeen` / `snapshotOf`: `seen` ordering correct.
- `listSync.syncStep` stability (two syncs in a row → no write), and a newer tombstone beats an older live copy.
- `app.js:34-39` cleanup-on-route-change; `shopping.js:153` removes all 5 listeners.
- Recipe sync conflict path (`decideSync` → `sync.js:114`).

## Definition drift
None material. The agent file matches the tree (files, BUILD, suite size). The previous report pre-dated finding IDs; IDs BH-01..03 were assigned here.

## Cross-lens notes
- → data-guardian: 8 base-recipe lines hold several ingredients in one string (BH-09). Ginger is 🛒-marked in 6 dinner recipes, so it gets bought every time even if it's usually at home.
- → test-warden: no test combines `needsBuying` with a Lager entry for a 🛒 line (BH-04), and none covers `mergeItems` with a tombstone listed before a live row (BH-07).
- → ux-curator: re-pressing Plan → list gives no "already on the list" feedback.

## Summary
P0 0 · P1 2 · P2 3 · P3 5 (BH-02, BH-03, BH-09, BH-10, BH-11). Most valuable fix: **BH-04** (Lager is ignored for 🛒 lines) together with **BH-05** (key normalisation). Between them they explain FR-01: ginger arrives with 75 % of random weekly plans even when it's in the Lager, and splits into 3–4 rows that never merge.
