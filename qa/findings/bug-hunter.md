# Bug-Hunter — findings (2026-11-18T12:00:00Z)
_Build 2026-10-27-v2.17 · CACHE koch-v2.17-1 · tests 583/583 (5 consecutive runs green) · HEAD 40ed058 · mode DELTA (origin/main..HEAD, release candidate v2.18)_

## Δ since 578152b (quick re-verify)
Since the previous pass (HEAD fe191d6, findings unchanged in 578152b), nothing under `v2/src` or `v2/add.html` has changed.
`git diff --name-only fe191d6..HEAD -- v2/` lists only `v2/tests/test-recipe-export.js` (dd3b840, #95). That commit pins the clock in the
DG-17 test, using `buildExportFile(de, now)`. The signature `buildExportFile(recipes, now = new Date())` at
`data/recipeExport.js:8` supports this, so the test is now deterministic. The suite ran 5 times in a row at 583/583.
The other changes in this range are docs/QA only (`docs/process/SCHEDULED-TASKS.md`, `qa/findings/data-guardian.md`).
There are no new findings. All findings and statuses below are carried forward from the fe191d6 pass. Their line numbers are still
current, because no app code changed.

## Δ since origin/main (carried from the fe191d6 pass)
The previous report (HEAD 95ae0f3) already covered the first 8 commits of this range. This run hunted the code
that changed **after** 95ae0f3: 29 files under `v2/src`. Main areas: import hardening and dedup (#36 #48 #49 #50 #52,
`data/recipeImport.js`, `schema.js` `envelopeProblem`/`PERSONAL_FIELDS`/`origin`), the Drive fork rule
(`recipeMerge.js` `forked`, `syncRules.js`), `origin` stamping (`store.js` add/update/import), English default plus the
legacy-user migration (`i18n.js`, `app.js`), cooking portions and timers (`cooking.js`, `portions.js`, `timers.js`),
the assistant template and its settings editor (`ai/prompts.js`, `data/settings.js`, `settings.js`, `assistant.js`), the
5.5 chat models (`models.js`, `gate.js`, `client.js`, `usage.js`), similar-name warning (`filter.js`, `form.js`,
`capture.js`), month parsing (`filter.js`), the `Liter` unit (`derive.js`), export fallback (`export.js`), the LOCALIZED
marker (`baseLang.js`), and the pure modules `units.js`/`ingredients.js`/`ingredientMatch.js`, which no app code imports
yet. Working tree is clean.

New: **1 × P3** (BH-16). No P0, no P1, no P2.

## Field reports
FR-01 (Ingwer): no shopping-list code (`features/shopping/*`, `listSync.js`, `friendInbox.js`) changed in this range.
`derive.parseIngredient` changed in one place: `Liter`/`L` now normalise to unit `l`. The probe shows `1 Lauch` still
gets unit `null` and item `Lauch`, so there is no new "L…" mis-split. The status stays as the orchestrator set it
(waiting for Marcel's device check on ≥ v2.15.3).

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | ✅ fixed | 9019e8c (v2.7), unchanged |
| BH-02 | Match "Nochmal" shows recipes you already matched | ⏳ still open | `features/match/match.js:120` still shuffles all `state.recipes`, while `:91` filters `swipeMatches`. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | ✅ fixed | e9b2b9b (#64). Timer state now lives in `cooking/timers.js`, and `paint()` no longer calls `clearTimers()` (`cooking.js:214`). Only the route cleanup at `:296` clears them |
| BH-04 … BH-11 | Shopping identity / merge / horizon | ✅ fixed | 41e5ea0 / 2eab1bb, code unchanged in this range |
| BH-12 | Whole-cookbook import doubles the 105 base recipes | ✅ fixed | 2b27980 (#48). `recipeImport.js:84` skips same id + `sameContent`. Tests in `test-recipe-import.js` |
| BH-13 | Import accepts any `version` | ✅ fixed | 6dd0c52. `schema.js` `envelopeProblem` → `recipeImport.js:52` rejects `newerFormat` |
| BH-14 | Import sheet shows German reasons, and "–" for an empty file | ⏳ still open | Still German literals at `recipeImport.js:43-52,64` plus the limit messages in `limitProblems` and the `validateRecipe` texts. Placeholder `["–"]` is still at `importFile.js:29`. This release adds more German-only strings (size limits, https note). P3 · E2 · S |
| BH-15 | Export: no download fallback, sync throw escapes `.catch` | ✅ fixed | 653dcb9 (#83). `export.js:96-101` falls through to download, and `exportFile` is `async` (`:114`) |

## New findings

### BH-16 [P3] Lost Drive write acknowledgement + a later edit on either side → the recipe is forked into a duplicate · confidence: med · evidence: E1
- **Where:** `data/syncCore.js:114` (`drive.updateFile` succeeds on the server) → the response is lost or the app is closed before `:117` `plan.apply` → `syncRules.js:93` `store.setBase(merged)` never runs. On the next sync, `recipeMerge.js:121` (`B && !b && !sameContent(l, r)`) treats the recipe as two independent creations, and `:160` adds the local version as a copy with a fresh id.
- **What breaks:** Marcel creates recipe X and the sync uploads it, but the phone loses signal before the reply comes back. The base is not updated. Then either (a) he edits X on the phone, or (b) his partner edits X on her device. On the next sync X appears **twice**: Drive's version under the old id and the phone's version under a new id. The duplicate syncs to every device. Before #49 this sub-case resolved to `prefer: "remote"`: no duplicate, but in case (a) the edit was lost. So the change trades a silent loss for a visible duplicate in (a). In (b) it turns a correct result into a duplicate.
- **Why:** the fork rule assumes that "id not in base" means "never agreed with Drive". That is false when the write reached Drive but the base update did not.
- **Proof:** probe `p2.mjs` / `p4.mjs` against the real `mergeRecipes`:
  ```
  lost-ack+edit:           [ 'r1795035307745:New edited', 'r200:New', 'r01:A' ]  forked 1
  lost-ack + partner edit: [ 'r1795035361525:1 steps', 'r200:2 steps', 'r01:1 steps' ] forked 1
  ```
- **Fix:** only fork when the local recipe is not `origin: "user"`-created-and-pushed. A simpler option: record the ids of locally created recipes that were *written* (e.g. update base for written ids before `updateFile` resolves, or keep a "pushed ids" set in meta). Then a known own push falls back to the normal three-way path. Accepting the edge as is would also be reasonable, since a duplicate is recoverable and a loss is not.
- **Regression test:** `test-recipe-merge.js` "lost ack: own recipe on Drive but not in base, local edit → no fork": `mergeRecipes({base:[a], local:[{...x,name:"edited"},a], remote:[x,a]})` → `forked.length === 0`, one `x` with the edited name (needs the chosen marker in the input).
- **Effort:** M

## Checked and refuted
- **Import dedup misses identical recipes because of `origin`/personal fields/`withDefaults`:** refuted. `sameContent` ignores `PERSONAL_FIELDS` and `origin`. Within-file duplicate ids → the first is kept or skipped and the second is renamed (`recipeImport.js:84-95`).
- **Importing the same file again shows "Nothing imported – invalid":** refuted. `importFile.js:11` now subtracts `duplicates`, so the sheet reads "0 imported · 105 skipped".
- **The same friend file imported on two devices of one account → duplicates after sync:** refuted for unchanged ids (`sameContent` → no fork). Renamed clashes give two copies, as expected for a double import.
- **`updateRecipe` lets an edit change or drop `origin`:** refuted. `store.js:113-118` restores the previous string in both the optimistic and the queued edit.
- **LOCALIZED marker (now an enumerable Symbol) reaches IndexedDB/JSON:** refuted. Symbol keys are skipped by `JSON.stringify` and structured clone. Only `assertCanonical` reads the marker (`export.js:35`, `recipeExport.js:9`), and every caller passes `getRecipesDe()`/`getRecipeDe()` (`menu.js:40-41`, `detail.js:181`).
- **Month table collisions across DE/EN/ES/DA after the whole-word rewrite:** refuted by probe (0 collisions). "martes, 3 de marzo de 2026" → 202603, "Mai 2026" → 202605, "dic 2025" → 202512.
- **`buildSystemPrompt` re-expands `{recipes}` inside a recipe name, or `$&` patterns:** refuted. It makes one pass with a function replacer (probe: the name stays literal). An empty `{fridge}` line is removed cleanly, also as the last line of a custom template.
- **Timers: the pager and list views use different indices, or a fired alarm is missed on a hidden step:** refuted. Both use the step index (`cooking.js:186,204`), and `takeFired` runs on every 250 ms tick regardless of the visible step.
- **Portions: a stored factor gives NaN/Infinity on reopen:** refuted. `startFor` guards `!(base > 0)` and non-finite values, and `setFactor` drops non-finite factors. (Pre-existing, not in this delta: the scaler clamps any target to 1..24, so a 40-cookie recipe jumps to 24 on the first tap.)
- **English default flips existing German users:** refuted. `app.js:51-55` runs `migrateDefaultLang` before the seed. Existing devices always have IndexedDB recipes, so they get `de`. No module computes `t()` strings at top level (grep: 0), so nothing caches English before the migration.
- **`Liter` added after `l` in the unit alternation fails to match:** refuted. `\b` forces a backtrack. Probe: "1 Liter Milch" → `l`/`Milch`, "1 Lauch" → no unit.
- **`ingredientMatch.matchLine` crashes on real lines:** refuted. All 839 snapshot ingredient lines parse with 0 throws and no NaN. The module is not wired into the app yet.
- **Similar-name note injects HTML:** refuted. The name goes through `esc()` before `t()` (`form.js:17`). Note: `t()` uses `replaceAll` with a string, so a name containing `$&` would expand. This is pre-existing, unrealistic, and outside the delta.
- **Old stored model ids (`claude-haiku-4-5`) break the chat:** refuted. `gate.resolveModel` maps them to their successors, and `usage.priceOf` keeps the 4.x prices and strips date stamps.

## Verified clean
- i18n: every literal `t()`/`tn()` key under `v2/src` resolves in de/en/es/da. The only misses are dynamic prefixes and one comment. `settings.instrVar.*` resolves for all 5 variables (E1 `i18n_probe.mjs`).
- `parseImportFile` hardening (size limits, https-only image, field whitelist, trimmed id) and `envelopeProblem`, shared with `inspectRemote`.
- Settings instructions editor: empty or default text → reset, missing-variable warning, add-back.
- `export.deliverExportFile` fallback and `exportFile` rejection path.
- SW `SHELL` lists `portions.js`, `timers.js`, `units.js`, `ingredients.js`, `ingredientMatch.js` (`test-sw-shell.js` green).

## Definition drift
The agent file still names `decideSync.js` as the recipe sync decision point. Recipe sync runs through `syncCore.js` + `syncRules.js` + `recipeMerge.js` (three-way merge with `forked`), and `decideSync` is used only for the no-base legacy case.

## Cross-lens notes
- → test-warden: no test covers a lost write acknowledgement (Drive written, base not updated) followed by an edit (BH-16).
- → ux-curator: the instructions editor loads the default template in German even with the new English default UI (`prompts.js` `DEFAULT_INSTRUCTIONS`). This is by design (the prompt is German), but users may not expect it.
- → ux-curator: `settings.js:166` fills the textarea asynchronously, so text typed in the first few ms after opening Settings is overwritten.

## Summary
P0 0 · P1 0 · P2 0 · P3 1 new (BH-16) + 2 carried (BH-02, BH-14). Fixed since last run: BH-03, BH-12, BH-13, BH-15.
**No new P0/P1.** Most valuable: BH-16, a rare duplicate from the new fork rule when a Drive write's acknowledgement is lost. Not a release blocker.
