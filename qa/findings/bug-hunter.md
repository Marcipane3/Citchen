# Bug-Hunter — findings (2026-11-18T20:57:05Z)
_Build 2026-10-27-v2.17 · CACHE koch-v2.17-1 · tests 583/583 (intermittently 582/583, see BH-16) · HEAD fe191d6 · mode DELTA (origin/main..HEAD, release candidate v2.18 retry)_

## Δ since origin/main
36 commits, 85 files under `v2/`. Since my last pass (95ae0f3) these files under `v2/src` changed: `data/{recipeImport,recipeMerge,schema,baseLang,recipeExport,derive,settings,syncRules}.js`, the new pure modules `data/{ingredientMatch,ingredients,units}.js`, `features/cooking/{cooking,portions(new),timers(new)}.js`, `features/cookbook/{export,filter,form,importFile}.js`, `features/capture/capture.js`, `features/settings/settings.js`, `features/assistant/assistant.js`, `ai/{client,gate,models,prompts,usage}.js`, `store.js`, `app.js`, `i18n.js`. I hunted in those files and in the code they call. The working tree is clean.

New: 0 × P0, 0 × P1, 1 × P2 (BH-16, a flaky unit test), 1 × P3 (BH-17). **No release blocker from this lens.**

## Field reports
FR-01 (Ingwer): no shopping-list code changed in this delta (`features/shopping/*` is untouched). The only shared change is `derive.js` (`Liter` unit, see "Checked and refuted"), and it does not touch the FR-01 path. The status stays as the orchestrator set it.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | ✅ fixed | 9019e8c (v2.7), unchanged |
| BH-02 | Match "Nochmal" shows recipes you already matched | ⏳ still open | `features/match/match.js:120` still shuffles all `state.recipes`, while the first deck at `:91` filters `swipeMatches`. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | ✅ fixed | e9b2b9b (#64). Timer state now lives in `features/cooking/timers.js`. `paint()` no longer calls `clearTimers()`; only the router cleanup does (`cooking.js:296`) |
| BH-04…BH-11 | Shopping identity / sync items | ✅ fixed | unchanged since v2.15.3 (no shopping code in delta) |
| BH-12 | Whole-cookbook import doubles all 105 base recipes | ✅ fixed | 2b27980 (#48). E1: seeded sender (+1 own recipe, personal fields set) → seeded recipient: `{imported:1, skipped:105, duplicates:105, renamed:0}`. Importing the same file again gives `{imported:0, skipped:106}`. `planImport` `recipeImport.js:84-101`, `sameContent` `recipeMerge.js:75-81` |
| BH-13 | Import accepts any `version` | ✅ fixed | 6dd0c52. `schema.js:50-55` `envelopeProblem` → `recipeImport.js:53`. E1: `{version:4}` → "Datei stammt aus einer neueren App-Version (Format 4)" |
| BH-14 | Import sheet: German reasons, stray "–" for an empty file | ⏳ still open | `recipeImport.js:17-27,45-53,61,66` (German literal strings), `importFile.js:29` (`["–"]` placeholder). E1: `parseImportFile('{"version":3,"recipes":[]}')` → `{recipes:[],errors:[]}` → sheet "invalid" + "–". New in this delta: the dedup reason `"…: bereits vorhanden"` (`:93`) and the https note (`:66`) are German too. P3 · S |
| BH-15 | Export: no download fallback on share error; sync throw escapes `.catch` | ✅ fixed | 653dcb9 (#83). `export.js:95-101` falls through to `<a download>` on a non-Abort error; `exportFile` is `async` (`export.js:114`) |

## New findings

### BH-16 [P2] Unit test "DG-17: Marker erscheint nie in JSON…" is flaky (millisecond race on `updated`) · confidence: high · evidence: E1
- **Where:** `v2/tests/test-recipe-export.js:153`. It calls `buildExportFile(de)` twice without `now`. `data/recipeExport.js:8,15` defaults `now = new Date()` and writes it into `updated`.
- **What breaks:** `node v2/tests/run.js` goes red at random when the two calls fall into different milliseconds. The first suite run of this pass failed with `582 bestanden, 1 fehlgeschlagen`. Output: `erwartet: …"updated":"2026-11-18T20:53:56.411Z"… erhalten: …"20:53:56.410Z"…`. That was 2 red runs out of about 35 locally. CI on `next` and the release PR can go red with no code change, and per rule 9 someone then has to chase it.
- **Why:** The test compares whole export files, and that includes the wall-clock timestamp. This is a test bug, not a product bug.
- **Proof:** the full suite in a loop, red at run 9 with the diff above. A tight-loop probe (`/tmp/bh/flake.mjs`) shows `95 / 20000` mismatches with a warm JIT. The rate is higher in the cold suite.
- **Fix:** Pass a fixed `now` to both calls (e.g. `const NOW = new Date("2026-01-01T00:00:00Z")`), or compare only `.recipes`.
- **Regression test:** the same test with a fixed `now`. It should pass 100/100 in a loop (`for i in $(seq 100); do node v2/tests/run.js | tail -1; done`).
- **Effort:** S

### BH-17 [P3] "Last cooked" sort no longer reads "Sept"/"sept." (regression from #51) · confidence: high · evidence: E1
- **Where:** `v2/src/features/cookbook/filter.js:182-193` (`MONTH_WORDS` holds only full names and 3-letter prefixes; `monthFromWord` matches whole words only).
- **What breaks:** A hand-entered or Claude-written `lastCooked: "Sept 2026"` (the en-GB short form) or the Spanish variant `"setiembre 2026"` now sorts as month 0 of the year, i.e. behind every dated 2026 entry. On `origin/main` the old 3-letter-prefix rule mapped these to 202609. The app itself writes `de-DE` long names ("September 2026"), so only foreign or hand-written values are hit.
- **Proof:** probe `/tmp/bh/cm.mjs`: `"Sept 2026" → 202600`, `"sept. 2026" → 202600`, `"setiembre 2026" → 202600`. All other DE/EN/ES/DA forms are correct ("Mär. 2026" 202603, "martes, 3 de marzo de 2026" 202603, "maj 2026" 202605).
- **Fix:** Add `sept` (and optionally `setiembre`) to `MONTH_WORDS` as explicit aliases. This keeps the whole-word rule that fixed "Martes"/"Mayonesa".
- **Regression test:** `test-filter.js` "cookedMonthKey: 4-letter 'Sept' → September": `cookedMonthKey("Sept 2026") === 202609`, `cookedMonthKey("sept. 2026") === 202609`. "Martes 2025" must stay at 202500.
- **Effort:** S

## Checked and refuted
- **#48 dedup could hide a real edit:** refuted. Same id with different content → renamed copy (E1 via the existing tests and my probe). `sameContent` ignores only personal fields and `origin`, and it compares `withDefaults` on both sides, so a missing default field does not count as a difference.
- **#49 fork in `mergeRecipes` (`recipeMerge.js:121`, `B && !b && !sameContent`) duplicates recipes in normal sync:** traced, refuted for the normal paths. The base is written in every apply (`syncRules.js:53,90`), including `savedPending`. A recipe this device pushed is therefore in the base on the next run. A recipe edited during the round trip is in `merged` → base (E2 `syncRules.js:89-95`). Only two independently created ids that collide land in `forked`, which is the intent.
- **Import keeps a whitespace-only id:** refuted. `validateRecipe` rejects `"   "` (`schema.js:74`). `" r01 "` is trimmed and then deduped (E1).
- **Import lets `javascript:`/`http:` image URLs through:** refuted. Both are cleared with a note (E1).
- **#43 English default flips existing German users:** refuted. `app.js:51-55` → `migrateDefaultLang(hasLegacyLocalData(n))` (`i18n.js:35-51`) stores `de` before `loadLocal` seeds IndexedDB. `getLang()`'s cache is reset (`current = null`).
- **#64 timer leaks / double alarms:** refuted. One `setInterval` (`cooking.js:120`), stopped when nothing is running (`:108`) and in the cleanup (`:296`). `takeFired` signals each step once. Fold, scaler, pager and check now repaint without touching `timers`.
- **#63 portions:** `startFor`/`targetFor` (`portions.js:50-64`) keep the old behaviour for factor 1 and for non-numeric servings. A broken `localStorage` value counts as an empty map. Clean.
- **#69/#70 template:** single-pass replace with a function, so `$`/`{…}` inside recipe names stay literal. With an empty fridge the `{fridge}` line is removed. Empty text or the default text saves as a reset (`data/settings.js:45-49`). A custom template always gets the fixed contract plus the German-content rule (`prompts.js:142`). Clean.
- **`derive.js` "Liter" unit changes shopping/cooking output:** E1 diff of the old vs. new `parseIngredient` over all 105 snapshot recipes: 8 lines change, all `… Liter …` → unit `l`, item without "Liter" (correct). Scaling now prints `2,4l Gemüsebrühe` (old: `2,4 Liter`). That matches the existing `800g`/`400ml` style. A list row "Liter Gemüsebrühe" added before the update won't merge with a new "Gemüsebrühe l" row. That is a one-time transitional duplicate, not worth a finding.
- **Import sheet with 105 duplicates + 1 broken recipe says "invalid":** true (`importFile.js:11`: `imported 0 && skipped > duplicates`), but the bullet names the broken recipe. This is borderline wording, so it is folded into BH-14 rather than a new ID.
- **`t()` uses `String.replaceAll(str, str)`**, so a recipe name containing `$&` would be mangled in `form.similar`. This is theoretical and not a finding.

## Verified clean
- i18n: every literal `t()`/`tn()` key under `v2/src` resolves in de/en/es/da, and the placeholders match the call params (E1 `/tmp/bh/i18n.mjs`: 0 placeholder mismatches; the only "misses" are dynamic prefixes such as `settings.instrVar.` + `TEMPLATE_VARIABLES`, all 5 present in 4 languages). Dict parity: no drift.
- Export → import round trip (seeded 105 + own recipe): 106 parsed, 0 errors, personal fields dropped, `origin: "user"` stamped on added recipes only.
- `store.importRecipes` (`store.js:157-187`): returns early when everything is a duplicate (no persist, no emit). The queue re-plan and `swapShown` are unchanged.
- `store.updateRecipe` keeps `origin` across edits (`store.js:111-127`).
- AI models: `resolveModel` maps the stored 4.x choice to its 5.5 successor; `priceOf` strips the date suffix. Static check only; no API calls.
- `ingredientMatch.js` / `ingredients.js` / `units.js`: not imported by any app view (only `sw.js` SHELL), so they cannot affect users in v2.18.

## Definition drift
Unchanged from the last run: recipe sync runs through `data/syncCore.js` + `syncRules.js` (the agent file names only `sync.js` + `decideSync.js`), and recipe data probes use `v2/data/rezepte.snapshot.json` (there is no root `rezepte.json`). The spawn prompt's "583/583 green" holds only most of the time (BH-16).

## Cross-lens notes
- → test-warden: BH-16 is a flaky test (`test-recipe-export.js:153`). Grep for other `buildExportFile(` equality checks without a fixed `now`; there are none beyond this one.
- → ux-curator: BH-14 (German import reasons in EN/ES/DA) now also covers the new "bereits vorhanden" and https-note strings.

## Summary
P0 0 · P1 0 · P2 1 (BH-16) · P3 1 new (BH-17) + 2 carried (BH-02, BH-14). Fixed since the last pass: BH-03, BH-12, BH-13, BH-15.
Most valuable: **BH-16**. The suite is not reliably green (a 1 ms race in a DG-17 test). Fixing it is a one-line test change and makes CI on the release PR trustworthy. The BH-12 blocker of the first v2.18 attempt is fixed and verified by probe.
