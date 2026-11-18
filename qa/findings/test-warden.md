# Test-Warden — findings (2026-11-18T00:00:00Z)
_Build 2026-10-27-v2.17 (release candidate v2.18, version bump not yet applied) · CACHE koch-v2.17-1 · tests 583/583 · HEAD fe191d6 · mode DELTA (origin/main..HEAD)_

Suite is green: 583 passed, 0 failed. DELTA touched 16 new files (8 modules/tests pairs: `ingredientMatch`, `ingredients`, `units`, `recipeImport`, `recipeExport`, `portions`, `timers`, `importFile`) and 25 changed files. Every new pure module has a test file wired in `run.js`. The new work is well covered. I found **no P0/P1** and no defect in unreleased logic that I could trigger with a probe. The gaps below are one pinned-behaviour question (TW-20), one open bug without a regression test (TW-21 = BH-14), and a few low-value pins. Probes are in `/tmp/claude-0/tw/{p,q,r,s}.mjs` (outside the repo).

## Field reports
FR-01 is the only entry and it is already marked fixed (v2.15.2/v2.15.3). The tests that pin it now exist (`test-shopping-identity.js`, 20 cases, wired at `run.js:28`). No open field report touches this lens.

## Status of previous findings
The previous report (2026-10-12, v2.14, 215 tests) is largely obsolete: the suite grew from 215 to 583.

| ID | Title | Status | Note |
|---|---|---|---|
| FR-01 regression set | `FR01.*` proposed cases | ✅ fixed | Implemented as `v2/tests/test-shopping-identity.js` (one key rule, tombstone-before-live, partner merge, two ingredients per line); BH-04..09/11 confirm in the bug-hunter table. |
| TW-09 | Cross-path item identity | ✅ fixed | `test-shopping-identity.js` (41e5ea0). |
| TW-10 | `mergeItems` first-hit revives tombstone | ✅ fixed | `test-shopping-identity.js:139` per BH-07. |
| TW-11 | `applyFriendItems` replay / duplicate id | ✅ fixed | `test-friends.js:34`, `:118` (crash-before-ack replay), `:133` (`trimSeen` 300 bound, DG-12). |
| TW-12 | Stale-device resurrection after tombstone prune | ✅ fixed | `test-list-file.js:211`, `test-sync-core.js:667` (BH-11/T7). |
| TW-13 | `parseIngredient` real-data lines | ✅ fixed | BH-09 two-ingredient line pinned; `test-ingredient-match.js:337` runs every snapshot line through `matchLine`. |
| TW-05 | `sync.js` async I/O never run against fakes | ✅ fixed | `data/syncCore.js` + `syncRules.js` take injected deps; `test-sync-core.js` has 38 cases (fake drive/store/offline). |
| TW-06 | Recipe vs list file ids, offline queue | ✅ fixed | Same engine (`syncCore`) for both files, covered by `test-sync-core.js` and `test-list-file.js`. |
| TW-14 | `listSync` / `friendInbox` I/O shells untested | ⏳ still open (low) | `friendInbox.js` still has no test of the `applyExternal → patchInbox(seen) → fl_ack` order. Pure core covered. Not touched by this release; stays low. |
| TW-07 | `toFileString` without injected `now` | ⏳ still open (low) | `test-migrate.js:81` only covers `setUpdated` with injected `now`; the default-clock branch is still unpinned. Not touched. |
| TW-08 | `extractJson` adversarial inputs | ⏳ still open (low) | Re-probed (E1, `s.mjs`): `'{"a":1'`→`null`, `'[1,2,3]'`→`null`, `'{"a":"}"}'`→`{a:"}"}`. Right behaviour, still unpinned (`test-ai.js:88-93` has only the valid cases). |

## New findings

### TW-20 `v2/src/data/recipeMerge.js:119-120` `mergeRecipes` twin rule · risk: low · evidence: E1
- **Covered today:** `test-recipe-merge.js:113-147` (origin-only twin, import-then-login, "no base keeps old rule", "known id never duplicated") and 8 `forked` references.
- **Gap:** two sides created the same id independently (not in base) with identical content but different personal fields. `sameContent` says "same recipe", the code returns the remote object, so the local ♥/rating is dropped. Probe (`r.mjs`): `mergeRecipes({base:[], local:[{…, favorite:true, rating:5}], remote:[{…}]})` → merged `favorite: undefined, rating: undefined`. The doc comment (`recipeMerge.js:107-108`, "Unterscheiden sich nur persönliche Felder, ist es dasselbe Rezept") does not say which side's personal fields win. Rare in practice (same id from a double import before the first sync, then a ♥ before sync), so low.
- **Proposed cases:**
  - `mergeRecipes twin: same content, local-only personal fields → decision pinned`: base `[]`, local `{id:x, favorite:true}`, remote `{id:x}` → expect exactly 1 recipe, `forked: []`, and assert whichever rule Marcel picks (keep local personal fields is the safer one; it matches "personal fields belong to the user", `schema.js:39`).
  - `mergeRecipes twin: idempotent after fork`: re-run with `base = merged` → 1 recipe per id, `forked: []` (probe `idem` confirmed 1 today; not pinned).
- **Guards against:** silent loss of ♥/rating on the #49 twin path.

### TW-21 `v2/src/features/cookbook/importFile.js:29` + `data/recipeImport.js` import outcome · risk: med · evidence: E1
- **Covered today:** `summarizeImport` cases at `test-recipe-import.js:113,124,296`; the DOM sheet is untested by design.
- **Gap:** open bug-hunter finding **BH-14** has no test. Probe (`s.mjs`): `parseImportFile('{"version":3,"recipes":[]}')` → `errors: []`; `importText` then substitutes the placeholder `["–"]`, and `summarizeImport` returns `{imported:0, skipped:1, reasons:["–"]}`, so the sheet shows "invalid file" plus a bullet "–" for a valid empty file. Parser reasons are German literals (`recipeImport.js:36-47`), shown unchanged in EN/ES/DA. Logic lives inside the DOM function, so it cannot be unit-tested today.
- **Proposed cases (after extracting a pure `importOutcome(parsed)` or `emptyFileProblem` helper into `data/recipeImport.js`):**
  - `parseImportFile: valid envelope with recipes [] → error code "empty"` (not an empty `errors` list that the caller papers over).
  - `summarizeImport: empty file → skipped 0, no reasons`.
  - `parseImportFile: every error carries a code that has an i18n key in all 4 languages` (data-driven over the code list).
- **Guards against:** BH-14.

### TW-22 `v2/src/data/recipeMerge.js:95` `sameCollection` · risk: low · evidence: E1
- **Covered today:** only indirectly through sync tests. No test names `sameCollection`.
- **Gap:** it decides whether a sync writes to Drive or IndexedDB (`syncRules.js:89,99`, `store.js:96`). It is order-sensitive: `sameCollection([r,q],[q,r])` → `false` (probe `s.mjs`), so a pure reorder triggers a write; that is plausibly intended (new local recipes go first) but unpinned.
- **Proposed cases:** `sameCollection: same list → true; empty/empty → true; different length → false; same ids different order → false (pinned: order is part of identity); personal-field-only difference → false`.
- **Guards against:** a "harmless" refactor to a set comparison that would stop reorder/personal-field syncs.

### TW-23 `v2/src/features/cookbook/filter.js:168-194` `cookedMonthKey` abbreviations · risk: low · evidence: E1
- **Covered today:** `test-filter.js` (full month names in 4 languages, numeric forms).
- **Gap:** `Sept 2026` / `Sept. 2026` → `202600` (month 0, sorts before every real month of that year); `Sep` works, `Sept` does not because only the full name and the first three letters are in `MONTH_WORDS`. The app itself writes long names, so only hand-edited or imported `lastCooked` values are affected.
- **Proposed cases:** `cookedMonthKey: "Sept 2026" → 202609` (or document it as unsupported and pin `202600`); `cookedMonthKey: "Mon 2026" → 202600` (weekday word is not a month — passes today, pins the whole-word rule).
- **Guards against:** wrong "zuletzt gekocht" order for edited values.

### TW-24 `v2/src/data/recipeImport.js:84` `isSameRecipe` (direct export) · risk: low · evidence: E1
- **Covered today:** behaviour is pinned through `planImport` (`test-recipe-import.js:53-89`, origin cases `:389-412`) but the export itself is not named in any test.
- **Gap:** none in behaviour. Probes: same content + `origin:"user"` on one side → skipped; personal-field difference → skipped; `" r1 "` id trimmed on parse → matches `r1`; version `-1` and id `__proto__` are accepted (harmless, `byId` is a `Map`). Listed only so the next run does not re-flag the grep result.
- **Proposed cases:** none required.

## If you add three tests, add these
1. **TW-21 `importOutcome` for an empty-but-valid file** (extract the helper first): guards the only open P3 bug in the import path and finally makes the German-reasons problem testable.
2. **TW-20 `mergeRecipes twin: same content, local-only personal fields`**: forces a decision on whose ♥/rating wins on the #49 twin path before real users hit it.
3. **TW-22 `sameCollection` truth table**: five lines, protects the "write or not" decision of both sync engines.

## Already well-covered
- Shopping list identity and sync: `test-shopping-identity.js` (20), `test-list-merge.js`, `test-list-file.js`, `test-sync-core.js` (38), `test-friends.js` (replay, `trimSeen`, crash-before-ack).
- Import/export (#36 #48 #50 #52 #72 #83): 36 cases in `test-recipe-import.js` and `test-recipe-export.js`, including round trips, size limits, https-only images, trimmed ids, late id clash, failed save rollback, share/download fallback (BH-15), canonical guard.
- Ingredient master/matcher: `test-ingredients.js`, `test-ingredient-match.js` (31 cases; real-data smoke over all snapshot lines). My own probe over 839 snapshot lines: 0 throws, 0 NaN grams, 45 lines stay free text, 89 split into several items (`q.mjs`).
- Assistant instruction template (#69 #70): `test-ai.js:255-440` has a frozen pre-change copy of the system prompt and checks default/empty/whitespace template, variable injection (`{language} Suppe` in a recipe name stays text), empty fridge line removal, custom-template fixed contract.
- Model migration (#79): `resolveModel` has 4.x→5.5 successor, unknown id and null cases (`test-ai.js:53-65`); prototype keys (`toString`, `__proto__`) fall back to the default (E1).
- Cooking portions and step timers: `test-cook-portions.js`, `test-cook-timers.js` (clock-based, per-step independence, `takeFired` once).
- Recipe merge (#49 #72): forked twin, origin ignored, no-base rule, idempotent second run.

## Checked and refuted
- "`resolveModel` downgrades a stored Sonnet choice": refuted. `claude-sonnet-4-6` → `claude-sonnet-5-5`; my first probe used a non-existent id (`claude-sonnet-4-5`) and fell to the default correctly.
- "Template `$&` / `$1` in a staple or recipe name is interpreted by `String.replace`": refuted (E1). The replacer is a function (`prompts.js` `text.replace(VARIABLE_RE, (_, name) => blocks[name])`); `staples:["$&"]` comes out literally.
- "`planImport` can overwrite a recipe when the file contains an identical and a changed copy of the same id": refuted; the second becomes a fresh id (`test-recipe-import.js:45`; probe `p.mjs`: `r1000`, `r1001`).
- "Import accepts a newer format": fixed by `envelopeProblem` (`schema.js`), pinned at `test-recipe-import.js:276` (this closes BH-13).
- "Whole-cookbook export doubles base recipes on import": fixed by `isSameRecipe`/`sameContent` skip (`recipeImport.js:84-87`), pinned at `test-recipe-import.js:53-74,399` (this closes BH-12).
- `getFactor`/`setFactor` without `localStorage` (Node, private mode): `store === null` throws inside `read`/`write` and is caught; returns 1 / no-op (E2, `portions.js:13-25`).

## Verified clean
- Suite wiring: all new test files are imported in `run.js`; `test-sw-shell.js` and `test-syntax.js` cover the new modules.
- Untested exports by name grep (DELTA modules): only `isSameRecipe` (behaviour covered, TW-24), `sameCollection` (TW-22), DOM wrappers `importText`/`pickAndImport`, `baseLang.{LOCALIZED,isLocalized,assertCanonical,_CONTENT_FIELDS}` (exercised through `test-recipe-export.js` `assertCanonical` path and `test-baselang.js`), schema constants, `settings.js` theme/profile accessors (IO), `ai/prompts` four user-prompt builders and `shopMarkerRule`, `ai/client` helpers (IO), `i18n.{onLangChange,MONTH_DICT}`. None is a logic risk.
- `settings.getInstructions/setInstructions` (whitespace-only and default text both reset) are IO-bound; the pure decision `custom = template non-blank and !== DEFAULT_INSTRUCTIONS` is covered at `test-ai.js:391-395`.

## Cross-lens notes
- → architect: `data/ingredientMatch.js:5-6` imports `features/shopping/logic.js` and `features/cookbook/filter.js` (which pulls in `i18n.js`) into the data layer. Not a test problem, a layering one.
- → bug-hunter: BH-14 (untranslated import reasons, stray "–") is still open; see TW-21 for the regression test.

## Definition drift
The agent file speaks of an older tree (no `syncCore`, ~20 test files); the tree now has 36 `test-*.js` files, `data/syncCore.js` + `syncRules.js`, `ingredientMatch`/`units`/`recipeImport`/`recipeExport`, and `test-shopping-identity.js`. `qa/findings/bug-hunter.md` still lists BH-12/13/15 as open although #48/#50/#83 fixed them (the orchestrator should update that file).

## Summary
Suite 583/583 green, DELTA covered. New findings: 0 P0, 0 P1, 0 P2; low/med gaps: TW-20 (low, personal fields on twin merge), TW-21 (med, BH-14 has no test, needs a helper extraction), TW-22 (low), TW-23 (low), TW-24 (info, nothing to add). Old: TW-01..06, 09..13 fixed or closed by earlier work; TW-07, TW-08, TW-14 still open (low). The most valuable item is TW-21, the only open bug in this release's import path without a regression test.
