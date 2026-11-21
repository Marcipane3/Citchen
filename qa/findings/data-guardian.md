# Data-Guardian — findings (2026-11-21T08:26Z)
_Build 2026-11-18-v2.18 (v2.19 bump not yet in tree) · CACHE koch-v2.18-1 · tests 636/636 · HEAD 556b19c · mode DELTA (`origin/main..HEAD`: #73, #89, #92, #105, #107)_

How I tested: node probes imported the real pure modules (`items`, `ingredientMatch`, `recipeImport`, `recipeExport`, `recipeMerge`, `migrate`, `schema`, `ai/parse`). I ran them against `v2/data/rezepte.snapshot.json` (105 recipes) and the real `v2/data/ingredients.json`. Scratch scripts were kept outside the repo. Nothing called Drive, Supabase or Anthropic. I wrote no repo file except this report.

## Delta in my lens
- **#107 R3.2 `items[]`:**
  - New `data/items.js`.
  - `items` was added to `RECIPE_FIELDS` (`schema.js:34`). There is a shape check (`schema.js:102-105`), plus `withoutBadItems` (`schema.js:122-127`).
  - `items` is excluded from content in `sameContent` (`recipeMerge.js:75`).
  - The store derives `items` **only into the view** (`store.js:33-37`). `setItemIndex` is called from `app.js:77-80`.
  - Import and export now carry `items`. SCHEMA documents it (`SCHEMA.md:94`).
- **#89 (DG-19 fix):** `cleanRecipe` (`recipeImport.js:37-44`) is now used both for the incoming recipe and for the existing one it is compared with (`:91-98`).
- **#73 assistant update:** `coerceUpdate`, `makeUpdatePatch` and `applyUpdatePatch` (`ai/parse.js:143-233`). The result is applied through `updateRecipe` on `getRecipeDe` (`assistant.js:285-290`).
- **#92:** tests only. **#105:** ingredient master data only, which has no persistence impact.

## Field reports
None open in my lens. FR-01 is fixed in code and waits for Marcel's device check. Nothing in this delta touches the shopping list, list sync or the friends inbox.

## Status of previous findings
| ID | Title | Status | Note |
|----|-------|--------|------|
| DG-01…DG-18 | (see the 2026-11-18 report) | ✅ fixed | Unchanged code paths. List and friend modules are not in the diff. |
| DG-19 | Re-import of own export duplicates recipes with unknown field / non-https image | ✅ fixed | `recipeImport.js:37-44`, `:91-98` (#89, b6f46d8). E1: an existing recipe with `nutrition` plus one with an `http:` image are re-imported from their own export → `skipped 2, added 0`. Tests `test-recipe-import.js` "#89: …" (5 tests). |

## New findings

### DG-20 [P2] Import writes unbounded, unchecked `items` into `rezepte.json` · confidence: high · evidence: E1
- **Asset at risk:** `rezepte.json` on Drive. SCHEMA calls `items` "app-managed, derived". A file import is a foreign channel (#36), and its limits do not cover the new field.
- **Where:** `recipeImport.js:13` (`KEPT_FIELDS` now includes `items`), `recipeImport.js:15-29` (`limitProblems` has no rule for `items`), and `schema.js:114-116` (only checks that `items` is an array of objects with a string `text`).
- **How it corrupts:**
  1. Someone imports a file whose recipe carries `items`. The items may be arbitrary: thousands of them, very long `text`, `text` that is not one of the recipe's ingredient lines, or any extra keys and values (objects, HTML strings).
  2. All of it is stored as-is in `recipesDe`, then written to IndexedDB and Drive. It syncs to every device and to project Claude.
  3. The view rebuilds clean items (`items.js:180-203` drops orphans), so nothing is visible. The junk stays on disk for good, because nothing in the app ever rewrites the persisted `items`.
- **Proof:**
  - An import with `items:[{text:"NOT A LINE", ing:"huge"}]` is kept unchanged, with 0 errors.
  - An import with 20,000 items is accepted, with 0 errors. The only limit is the 2 MB file size.
  - `{text:<line>, ing:"<img onerror=x>"}` passes validation, and `relinkItems` keeps it as the item for that line.
  - No user data is lost, and nothing renders `items` today (grep: `withItems`/`relinkItems` have no consumer outside `store.js`).
- **Guard:** do not apply.
  - On import, either drop `items` entirely (it is derived, so the app rebuilds it), or keep only items whose `text` is one of the recipe's `ingredients`. Limit the count to about `lines × 4`.
  - Allow only the documented keys (`text, ing, amount, amountMax, unit, g, group, prep, buy, optional`) and check their types.
  - Test: a hostile `items` in an import file never reaches `toAdd`.
  - Before any UI renders `item.ing` or `item.prep`, it must go through `esc()`.
  - Effort S.

### DG-21 [P3] `relinkItems` keeps doubled items when a duplicated ingredient line is reduced to one · confidence: high · evidence: E1
- **Asset at risk:** the derived `items` (future quantities and nutrition). This applies only to recipes whose stored `items` came from an import or an external writer. Recipes without stored `items` are rebuilt fresh on every view.
- **Where:** `items.js:197-199`. When a line occurs `n` times and has `kept` stored items, it uses `kept.length % n === 0`. That rule cannot tell "one line with 2 items" from "2 lines with 1 item each".
- **How it corrupts:** `ingredients:["1 Zwiebel","1 Zwiebel","Salz"]` with stored items, then the user deletes one "1 Zwiebel" line → the view still shows 2 Zwiebel items for 1 line (E1: `after removing one 3 ['1 Zwiebel','1 Zwiebel','Salz']`). The ingredients themselves are never touched.
- **Guard:** do not apply.
  - When the count of a line changes, re-derive that line instead of redistributing the stored items. Or store an occurrence index on each item.
  - Test: 2 duplicate lines go down to 1, and the result has the matchLine count for one line.
  - Effort S. This is a trap for the first consumer of `items`. Today nothing reads it.

No new P0/P1.

## Checked and refuted
- **The `items` view leaks into persistence:** refuted.
  - `withItems` returns a copy and never mutates (E1: `recipesDe` contains no `items` after deriving all 105; the snapshot is byte-identical).
  - Every persist path is fed from `recipesDe` or IndexedDB, as in the last report: `updateRecipe`/`addRecipe`/`deleteRecipe`/`importRecipes` (`store.js:122-200`), export through `getRecipesDe` (`export.js:115`), the edit form through `getRecipeDe` (`detail.js:195`), and the assistant through `getRecipeDe` and `updateRecipe` (`assistant.js:256`, `:285-290`).
  - Startup never marks the collection as changed and never writes to Drive.
- **A broken `items` on Drive drops or blocks a recipe:** refuted.
  - `inspectRemote` does not validate each recipe (`recipeMerge.js:32-58`), so the recipe is kept (E1: `items:"oops"` → 1 recipe kept, and the view still gets a valid array).
  - `updateRecipe` strips a bad `items` before validating (`store.js:128`, `:133`), so editing such a recipe never fails.
- **A merge conflict over `items`:** `mergeRecipes` uses the full `sameRecipe` comparison. E1: local changes `rating` while Drive adds `items` → conflict, merged per field, rating 5 kept and the Drive items adopted. Nothing is lost.
- **`sameContent` ignores `items`, so import or fork could hide real differences:** this is intended, because `items` is derived. Twin and duplicate detection still compares `ingredients`, which is the contract.
- **#73 update overwrites personal or app fields:** refuted (E1).
  - The model sent `rating:0`, `id:"evil"`, `origin:"x"`, `feedback:""` and `toTry:true`. The stored rating 4, favorite, feedback, `nutrition` (unknown field), `origin:"user"`, the id and `items` all stayed. The patch contained only `ingredients`.
  - Applying the patch twice, or applying it after the field changed elsewhere, does nothing: `applied:false`, conflict `["ingredients"]`.
  - A wrong id is refused.
- **#73 writes a translation:** the attached recipe and the patch base are always `getRecipeDe`. The prompt requires German (`prompts.js`, change rule). This is a prompt-level guard only, as with DG-10. The confirmation card shows the diff before anything is saved.
- **Round trip:** 105-recipe snapshot load → serialize → load gives a fixed point. `withItems` is idempotent on 105/105 (same object returned), and 0 orphan items.

## Invariants verified clean
- Round-trip fixed point (snapshot) · canonical German on every persist path (the deltas re-checked above) · `version` stays 3 and `items` is additive · DG-19 duplicate-on-restore closed · the assistant update path is limited to `CONTENT_FIELDS` and detects stale patches · list, list sync and friends inbox are unchanged in this delta.

## Definition drift
- The agent file still names `decideSync.js` as the engine and a repo-root `rezepte.json`. In fact sync runs through `syncCore`, `syncRules` and `recipeMerge`, and the in-repo copy is `v2/data/rezepte.snapshot.json`.
- SCHEMA `:94` says "Die App leitet `items` ab … ordnet neu zu". It does not say that the app **never persists** `items` itself. Only an import (or an external writer) puts it into the file.

## Cross-lens notes
- → test-warden: no test for a hostile or oversized `items` in an import file (DG-20), and none for a duplicate line shrinking (DG-21).
- → bug-hunter / ux-curator: in EN/DA/ES the view `items[].text` stays German, while `ingredients` is translated. Any future UI that joins items to lines by text in the view will miss.
- → release-captain: DG-19 / #89 is fixed and can close with v2.19.

## Summary
P0: 0 · P1: 0 · P2: 1 new (DG-20) · P3: 1 new (DG-21) · DG-19 fixed. The most valuable item is DG-20: limit or drop `items` on import, before the first feature reads `items`.

## Verdict
**Trustworthy for v2.19:** `items` stays in the view and never touches `recipesDe` or Drive on its own, round trips are exact, the assistant can only change content fields after confirmation, and the restore duplicate (DG-19) is closed. The only gap is that an imported file can still put unchecked `items` into the cookbook (DG-20, P2).
