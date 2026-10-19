# Simplifier — findings (2026-10-12T16:30:00Z)
_Build 2026-10-04-v2.14 · CACHE koch-v2.14-1 · tests 215/215 · HEAD 70e8b9d (working tree has uncommitted docs/agent edits only) · mode FULL_

## Field reports

### FR-01 "Ingwer gets added to the shopping list randomly and multiple times" — duplicated matching logic DOES contribute to "multiple times", NOT to "randomly"

**What I ran (E1):** node probe against the real modules (`logic.js`, `friendMerge.js`, `derive.js`) and `v2/data/rezepte.snapshot.json`. Probe lives in the scratchpad, outside the repo.

Ranked hypotheses within my lens:

1. **Same ingredient yields several merge keys, so it never collapses into one row (E1, confidence high).**
   - Snapshot: 7 recipes contain "Ingwer" (6 as a clean ingredient with 🛒, 1 as a data glitch, see below).
   - `aggregateIngredients` over all 7 gives **3 rows**: `Ingwer, gerieben/1/Stück`, `Ingwer/5/Stück` (5 recipes merged correctly) and `gemahlene Nelken , 1 TL Ingwerpulver/0.5/TL`.
   - The catalog tile uses `itemKey("Ingwer", null)` = `ingwer|`, the recipe row is `ingwer|stück`. `itemKey("Ingwer","Stück")` = `ingwer|stück`. So tile and recipe rows never merge.
   - Friend path: `applyFriendItems([Ingwer/Stück row], [friend "Ingwer"])` gives **2 rows** (`r:Ingwer/Stück` and `fr-f1:Ingwer/null`).
   - Friend path: a friend typing `"2 Ingwer"` creates a separate row `fr-f1:2 Ingwer`.
   - Code: `shopping/logic.js:51` (`itemKey` includes unit), `:87`, `:120`; `shopping.js:73-74`; `friendMerge.js:41-42`.
2. **A live row and a tombstone with the same key coexist, and `mergeItems` revives the tombstone instead of adding to the live row (E1, confidence high).**
   - Probe: `existing=[tombstone t, live l]`, both `ingwer|`. Result: both rows live (`t:qty1`, `l:qty1`). It is a visible duplicate "Ingwer".
   - Route to get there: delete Ingwer (tombstone), a friend suggests Ingwer. `applyFriendItems` (`friendMerge.js:42`) only looks at `!x.deleted`, so it pushes a new `fr-` row next to the tombstone. A later recipe/plan add hits `mergeItems` `out.find` (`logic.js:123`), which takes the first match in array order, which is the older tombstone. `shopAdd` (`shopping.js:76`) does prefer live, so the three entry points disagree.
3. **Badge and tap disagree (E2).** `catItemHTML` (`shopping.js:422`) matches by name only, ignoring unit and whitespace. It shows the qty of the recipe row "Ingwer 5 Stück" on the tile, while tapping the tile runs `shopAdd` with a unit-less key and creates a new row. The click handler (`:456-457`) repeats the badge lookup, so the badge can show a different row than the one that was bumped.
4. **"Randomly, without selecting" is not explained by matching.** I found no path in my lens that re-adds an item without a user action. The friend path is guarded by `seen` (`friendMerge.js:34-38`). What makes it look random, from reading the code (E2, other lenses should confirm):
   - Planner → "Einkaufsliste" aggregates **every** recipe in a randomly generated plan (`planner.js:166-172`). Ingwer carries 🛒 in 5 recipes, so it appears whenever such a recipe is planned.
   - `needsBuying` (`logic.js:43`) returns true for any 🛒 line **before** checking pantry/fridge, so Ingwer in the Lager never suppresses it.
   - Adding is not idempotent. `mergeItems` sums amounts again on each tap and never uses `sources` to detect "already added" (`logic.js:127-132`). Two taps on "Zutaten auf die Liste" give 2 Stück.
   - Data glitch: `"½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"` is **one** ingredient string. It produces a row named "gemahlene Nelken , 1 TL Ingwerpulver" with the Ingwer icon (`ingMatchCat` substring "ingwer").

**What would confirm on device:** Marcel opens the list right after the symptom. Several "Ingwer" rows with different suffixes ("Ingwer, gerieben", "5 Stück Ingwer", plain "Ingwer") confirm (1). A plain "Ingwer ×2" next to a "Stück" row confirms (3). Whether it follows "Plan → Einkaufsliste" confirms (4). If a single row grows on its own with no plan/recipe/friend action, my hypotheses are wrong and the cause is in sync (architect/bug-hunter).

→ bug-hunter: `needsBuying` ignoring pantry for 🛒 lines, and non-idempotent recipe add. → data-guardian: the merged Nelken/Ingwerpulver ingredient string in the snapshot (`r1749400081000`).

## Status of previous findings (report of 2026-06-14, build v2.5)
| ID | Title | Status | Note |
|----|-------|--------|------|
| SI-01 | Shared `renderHeader()` (10 hand-rolled headers) | ✅ fixed | `appHeader()` at `ui/helpers.js:26` shipped in d42957a (v2.6). 9 feature files call it. 0 `class="app-header"` or `id="menuBtn"` outside `helpers.js` (grep). `🍳→home` is `data-home` in the same helper (A5 done). |
| SI-02 | `wireHeader()` companion | ✅ fixed | `ui/helpers.js:43`. No remaining inline `#menuBtn.onclick` (grep). |
| SI-03 | `buildLine()` footer helper | ⏳ still open | Now **9** occurrences, not 8: `assistant.js:44` (+ spacer variant `:78`), `capture.js:86`, `cookbook.js:181`, `guide.js:39`, `lager.js:62`, `match.js:83`, `planner.js:140`, `shopping.js:121`. 8 are byte-identical. `settings.js` and `app.js` still import `BUILD` for other reasons. See below. |
| (verified) | Catalog single-source (D2) | ✅ stays single-source, **path changed** | Moved from `features/shopping/catalog.js` to `data/catalog.js` in v2.13. See Verified single-source. |

## New findings (highest payoff first)

### SI-04 One shared "is this the same list item?" predicate, with tombstone preference  ·  payoff: high  ·  risk: med  ·  evidence: E1
- **Pattern:** the question "is this the same shopping item?" is answered 7 different ways (×7), and only some of them are consistent:

  | # | Site | Lowercase | Collapse ws | Unit | `nameDe` / `name` | Tombstones |
  |---|------|-----------|-------------|------|-------------------|-----------|
  | 1 | `shopping.js:73-76` `shopAdd` `same` | yes | yes | yes (null→"") | both | prefers live, else revives |
  | 2 | `shopping.js:422` `catItemHTML` | yes | **no** | **ignored** | `nameDe\|\|name` | live only |
  | 3 | `shopping.js:456-457` click badge | copy of #2 (×2 total) | | | | |
  | 4 | `logic.js:120` `mergeItems` `keyOf` | yes | yes | yes | `nameDe\|\|name` only | **first match wins, may pick tombstone over live** |
  | 5 | `logic.js:87` `aggregateIngredients` | yes | yes | yes | German name | n/a |
  | 6 | `friendMerge.js:41-42` `applyFriendItems` | copy of #1 | | | both | **ignores tombstones, never revives** |
  | 7 | `friendMerge.js:78-83` `isListed` | own `norm` | yes | n/a | snapshot label `endsWith` | n/a |

  Plus 3 separate `toLowerCase().replace(/\s+/g," ").trim()` copies: `logic.js:51`, `friendMerge.js:78` and `:80` (twice in one function), `lager/logic.js:28`.
- **Proposal:** put these in `shopping/logic.js` (already imported by `friendMerge.js`; no cycle):
  ```js
  export const normName = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  export const keyOf = (x) => itemKey(x.nameDe || x.name, x.unit);
  /** live beats tombstone; matches nameDe OR name */
  export function findSame(items, name, unit = null) {
    const key = itemKey(name, unit);
    const hit = (x) => keyOf(x) === key || itemKey(x.name, x.unit) === key;
    return items.find((x) => !x.deleted && hit(x)) || items.find(hit) || null;
  }
  ```
  Then `shopAdd`, `mergeItems`, `applyFriendItems` call `findSame`, and `catItemHTML` plus the click handler use one `badgeFor(name)` that calls it. `lager/logic.js` and `isListed` import `normName`.
- **Saves:** ~25 lines across 4 files, plus one definition of "same item" that the next change cannot half-update.
- **Behaviour:** changes, and these are the point.
  - `mergeItems` stops reviving a tombstone when a live twin exists (fixes the FR-01 live+tombstone double).
  - `applyFriendItems` revives/merges against a tombstone instead of leaving it beside a new row. If a friend adds something you deleted, keep it a new row (current) or revive (shared): decide explicitly.
  - Badge lookup becomes whitespace-insensitive.
  - Everything else (existing 215 tests) should be unchanged. `test-shopping`/`test-friends`/`test-list-sync` cover the happy paths. Add tests for live+tombstone and unit-less vs unit rows.
- **Effort:** M

### SI-05 Key policy: unit-less tap vs recipe row, and ingredient qualifiers split rows  ·  payoff: med  ·  risk: med  ·  evidence: E1
- **Pattern:** `itemKey` (`logic.js:50-52`) bakes the **unit** into the identity. So `ingwer|` (catalog tile, friend, free text), `ingwer|stück` (recipe) and `ingwer, gerieben|stück` (recipe with qualifier) are three rows by design. That is correct for "200 g Mehl" vs "1 Packung Mehl", but surprising for a tile tap on an item that already has a counted row.
- **Proposal (needs Marcel's decision, so it is a `💡 idea`):**
  - A) Keep as is, and show a hint when the tapped tile name already has a row with another unit.
  - B) For unit-less incoming (tile, friend, free text) add into the **existing same-name row** if there is exactly one live match, as +1 piece when the row has `unit` "Stück" or null, otherwise a separate row. Recommended.
  - C) Also strip trailing prep qualifiers (", gerieben") from the key but keep them in the label. Higher risk: amounts of different units sum wrongly, so only do it together with B and a test.
- **Saves:** 0 lines (this is behaviour, not size). **Behaviour:** changes. Bundle with SI-04 so there is one place to change.
- **Effort:** S (after SI-04)

### SI-06 "aggregate + add to list + confirm message" copy-pasted  ·  payoff: med  ·  risk: low  ·  evidence: E2
- **Pattern:** `cookbook/detail.js:150-165` and `planner/planner.js:166-176` do the same 5 steps (×2): `getStaples()`, pick German recipe(s), build `displayById`, `aggregateIngredients`, `addItemsToList`, then build the identical `detail.addedToShopping` + `inStockSkipped` + `switchToList` message and `confirm()`. Inside `shopping.js:94`, `addItemsToList` does `await import("./logic.js")` although `./logic.js` is already statically imported on line 13 (same module, pointless dynamic import).
- **Proposal:** one `addRecipesToList(recipeIds)` in `features/shopping/` that returns `{ added, skipped }`. Callers keep only their own navigate/confirm. This is also the single place to add an idempotency guard later (relevant to FR-01 point 4). Make the `./logic.js` import static in `shopping.js`.
- **Saves:** ~15 lines across 3 files. **Behaviour:** unchanged.
- **Effort:** S

### SI-07 Dead code, unused imports, over-exported internals  ·  payoff: low  ·  risk: low  ·  evidence: E1
- **Dead (no importer in app, tests or tools; script over all `export`s in `v2/src`):**
  - `router.js:20` `currentRoute()`: no caller anywhere.
  - `baseLang.js:90` `_CONTENT_FIELDS`: no caller anywhere.
  - `derive.js:30` `getTags()`: test-only (`tests/test-derive.js`), no app caller.
- **Unused imports (7):** `app.js` `esc`; `cookbook/detail.js` `state`, `tn`; `cookbook/form.js` `EFFORT_VALUES`; `lager/lager.js` `removeFridgeItem`; `planner/planner.js` `DAYS`; `settings/settings.js` `AiError`.
- **Exported but only used inside their own file (14):** `gate.js` `DEFAULT_MODEL`, `isOffline`; `db.js` `openDB`; `drive.js` `KNOWN_FILE_ID`, `clearToken`, `DriveError` (callers use `e.status`); `settings.js` `applyTheme`; `supabase.js` `SUPABASE_URL`, `SUPABASE_KEY`; `match.js` `dishKind`; `ui/tabs.js` `HIDE_ON`; plus test-only ones (`tippsToString`, `buildCollectionContext`, `isSpecialChip`, `makeRng`, etc.). Harmless; do not churn the test-only ones.
- **Proposal:** delete the 3 dead symbols and 7 imports. Drop the `export` keyword on the internal-only ones only when touching those files. Do not add a linter for this (one-person, no-bundler app; a one-off pass is enough).
- **Saves:** ~12 lines across 9 files. **Behaviour:** unchanged. **Effort:** S

### SI-08 Tiny repeated expressions: aisle sort ×3, "has amount" ×5  ·  payoff: low  ·  risk: low  ·  evidence: E1
- **Pattern:**
  - Aisle ordering via `SECTION_ORDER.indexOf(..) < 0 ? 99 : i`: `shopping.js:362-365`, `logic.js:148-151`, `friendMerge.js:63` (×3).
  - `amount !== null && amount !== undefined` (or negation): `logic.js:127` (twice in one condition), `:160`, `:169`, `shopping.js:340`, `friendMerge.js:72` (×5). `logic.js:91` uses a third form (`!== null` only), which is fine for `parseIngredient` output but is the same idea.
- **Proposal:** `sectionRank(cat)` exported from `data/catalog.js` (next to `SECTION_ORDER`); `hasAmount(it)` in `shopping/logic.js`. Do **not** introduce a generic emitter for the 10 listener `Set`s (`listSync.js:22-36`, `friendInbox.js:18-19`, `sync.js:40`, `drive.js:25`, `i18n.js:17`, `store.js:24`). Each is 1-2 lines and a helper would not pay for itself.
- **Saves:** ~14 lines across 4 files. **Behaviour:** unchanged. **Effort:** S. Fold into SI-04.

### SI-09 Permanently-on feature flag + stale scaffold comment  ·  payoff: low  ·  risk: low  ·  evidence: E1
- **Pattern:** `flags.js:9` `captureParse: true` is the only flag and gates `capture/parse.js:103` and `:133`. The comment above it still says "Scaffold … nur der Parse-Schritt ist deaktiviert", which is false since capture shipped. `CaptureDisabledError` (`capture/parse.js`) exists only for this gate.
- **Proposal:** either delete `flags.js`, both `if` guards and `CaptureDisabledError` (and any `instanceof` handler in `capture.js`), or fix the comment and keep it as the kill-switch for AI-capture. The existing convention says "umlegen + Cache-Bump = Release", so a kill-switch is legitimate, but a comment that says it is off is misleading.
- **Saves:** ~25 lines if deleted. **Behaviour:** unchanged. **Effort:** S

### SI-03 (carried) `buildLine()` footer helper  ·  payoff: low  ·  risk: low  ·  evidence: E1
- **Pattern:** 8 identical `<div class="build-line">Build ${esc(BUILD)}</div>` (list in the status table) plus the deliberate spacer at `assistant.js:78`.
- **Proposal:** `buildLine()` in `ui/helpers.js`. Removes 7 `BUILD` imports (`assistant`, `capture`, `cookbook`, `guide`, `lager`, `match`, `planner`, `shopping` import it only for this; `settings.js` and `app.js` need it elsewhere, check first).
- **Saves:** ~16 lines across 8 files. **Behaviour:** unchanged. **Effort:** S. Not worth a standalone PR; do with any view edit.

## Checked and refuted
- "Twin modules `capture/parse.js` vs `ai/parse.js`": not twins. `capture/parse.js:8` imports `extractJson`/`coerceRecipe` from `ai/parse.js` and only adds prompts and orchestration. Layering is right.
- "Twin modules `data/sync.js` vs `data/listSync.js`": they share only the status/listener boilerplate (see SI-08 on why not to extract it). `sync.js` uses whole-file `decideSync` (conflict detection), `listSync.js` uses item-level `syncStep`. Different algorithms by design; extracting a core would couple them. Leave separate.
- "Friend inbox re-applies items on every sync": guarded by `seen` (`friendMerge.js:34-38`) and ack-after-save order (`friendInbox.js:93-100`), covered by `test-friends.js` (re-pull test). Not a duplication problem.
- "A second Ingwer/name→icon table exists": none. `ingMatchCat` is the only matcher and gives one icon per name.

## Verified single-source (do not re-flag)
- **Catalog (D2):** `CATALOG`, `SECTION_ORDER`, `ingMatchCat`, `itemIcon`, `ingredientIcons`, `sectionIcon` are defined once in `data/catalog.js`. Consumers: `shopping.js:12`, `shopping/logic.js:7`, `friendMerge.js:10`, `lager/lager.js:12`, `cookbook/detail.js:8`, `cooking/cooking.js:7`. No rival Name→Symbol table anywhere in `v2/src`.
- **App header / menu wiring:** `appHeader`/`wireHeader` only in `ui/helpers.js`; 9 feature files use it; nothing bypasses it.
- **`esc()`:** one definition at `ui/helpers.js:8`.
- **Ingredient parsing:** `parseIngredient`/`scaleIngredient` only in `data/derive.js`. `nameOf` in `logic.js:55` is a thin wrapper, not a second parser.
- **Sheet and busy wiring:** `openSheet` is single-source (`ui/sheet.js`). The `busy()` helper exists once (`shopping.js:262`); other "busy" hits are unrelated state variables, so no extraction candidate yet.
- **Sync algorithms:** `listMerge.js` is pure and imported by both `listSync.js` and `shopping.js`; no copy of `mergeList`.

## Definition drift
The agent file lists `catalog.js` under `features/shopping/`. It is now `data/catalog.js` (the file still names `shopping/catalog.js` in its "where to look" list). Otherwise the file names and line references in the definition match the tree.

## Summary
Counts open: **high 1 · med 2 · low 4** (SI-04; SI-05, SI-06; SI-03, SI-07, SI-08, SI-09). Fixed since last run: SI-01, SI-02.
- **FR-01 contribution:** the diverging matching logic explains the "multiple times" part (3 merge keys for Ingwer, live+tombstone double, badge/tap mismatch; all E1). It does not explain "randomly". That looks like random-plan + 🛒-overrides-pantry + non-idempotent add (E2, other lenses).
- **Top item:** SI-04, one `findSame` predicate (live over tombstone) used by `shopAdd`, `mergeItems`, `applyFriendItems` and the tile badge; follow with SI-05 (key policy decision for Marcel) and SI-06 (shared add-recipes flow).
