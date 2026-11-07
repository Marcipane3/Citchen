# Bug-Hunter — findings (2026-11-07T07:22:11Z)
_Build 2026-10-27-v2.17 · CACHE koch-v2.17-1 · tests 393/393 · HEAD 95ae0f3 · mode DELTA (origin/main..HEAD, release candidate v2.18)_

## Δ since origin/main
8 commits (#25, #26, #28, #30, #33, #35, #42 + e2e race fix). Changed under `v2/src`: `data/recipeImport.js` (new),
`data/recipeExport.js` (new), `data/baseLang.js` (LOCALIZED marker + `assertCanonical`), `store.js`
(`getRecipesDe`, `importRecipes`, test seam), `features/cookbook/{export,importFile(new),detail,filter,cookbook}.js`,
`features/menu.js`, `features/assistant/assistant.js`, `features/settings/settings.js`, `ui/helpers.js`, `i18n.js`.
Hunted in those files and the code they call (`schema.js` validate/defaults/id factory, `sync.saveChange`,
`syncCore.run`, `localizeRecipes`/`buildLangMap`, `loadHeroInto`). Working tree is clean.

New: **1 × P1** (BH-12), 1 × P2 (BH-13), 2 × P3 (BH-14, BH-15). No P0.

## Field reports
FR-01 (Ingwer): no shopping-list code changed in this delta. The status stays as the orchestrator set it
(fixed in code in v2.15.2/v2.15.3, waiting for Marcel's device check). Nothing new to probe.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | fixed | 9019e8c (v2.7), unchanged |
| BH-02 | Match "Nochmal" shows recipes you already matched | still open | `features/match/match.js:120` still shuffles all `state.recipes`. The first deck at `:91` filters `swipeMatches`. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | still open | `features/cooking/cooking.js:269-273` (prev/next/check → `paint()` → `clearTimers()` at `:201`). P3 · E2 · M |
| BH-04 | Lager ignored for 🛒 lines | fixed | 41e5ea0 (v2.15.3, T6). `logic.js:41`, test `test-shopping-identity.js:33` |
| BH-05 | Same ingredient → several rows | fixed | 41e5ea0 (T5), one key rule at `logic.js:84` |
| BH-06 | Catalog badge shows a different row | fixed | 41e5ea0. `shopping.js:117` returns the touched row, test `test-shopping-identity.js:117` |
| BH-07 | `mergeItems` revives a tombstone next to a live row | fixed | 41e5ea0. `logic.js:287`, test `test-shopping-identity.js:139` |
| BH-08 | Partner sync keeps same-item duplicates | fixed | 41e5ea0. `listMerge.js:98`, test `test-shopping-identity.js:184` |
| BH-09 | Two ingredients on one line | fixed | 41e5ea0. `logic.js:209`, test `test-shopping-identity.js:100` |
| BH-10 | "Zutaten auf die Liste" without in-flight guard | fixed | `detail.js:154` (`addIngBtn.disabled` guard) |
| BH-11 | Device offline > 30 days revives deleted rows | fixed | 2eab1bb (v2.15.2, T7). Tests `test-list-file.js:211`, `test-sync-core.js:667` |

## New findings

### BH-12 [P1] "Whole cookbook as import file" → importing it on another Citchen device doubles all 105 base recipes · confidence: high · evidence: E1
- **Where:** `v2/src/features/menu.js:41` (the only export path: `exportFile(getRecipesDe())`, the whole cookbook) → `data/recipeExport.js:10-18` (all recipes, base ids `r01…r105` kept) → recipient `features/cookbook/importFile.js:27-34` → `store.js:147-176` (`importRecipes`) → `data/recipeImport.js:31-47` (`planImport`: every id clash becomes a fresh-id copy, `skipped` is always `[]`). Every install is seeded from `v2/data/rezepte.snapshot.json` (`data/sync.js:5,20,96`), so every recipient already has all 105 base recipes under the same ids.
- **What breaks:** Marcel wants to give a friend or his partner his own recipe. There is no per-recipe file export in the UI (`detail.js` share is Markdown only), so he uses ☰ → "Ganzes Kochbuch als Import-Datei". The friend imports it. Result: "106 importiert · 0 übersprungen · 105 mit neuer ID", and the friend's cookbook goes from 105 to 211 recipes, with every base recipe listed twice. In a non-German UI the copies stand out because they lose the translation overlay (it is keyed by id): the original shows "Sweet Potato Curry with Chickpeas" and the copy right next to it shows "Süßkartoffel-Curry mit Kichererbsen". The doubles are saved, synced to the friend's `rezepte.json` (and to the partner, who shares it), and can only be removed one at a time with 🗑. Running the same import on a second device of the same Drive account (e.g. as a backup restore) does the same.
- **Why:** G2.1 AC (6) chose "no silent merge, duplicates are the user's call" for re-importing the same file. That rule did not account for the seeded base set that both sides share. `planImport` has a `skipped` slot, but nothing ever fills it.
- **Proof:** probe `dup_probe.mjs` (sender = seeded snapshot + 1 own recipe, recipient = fresh seeded install):
  ```
  { imported: 106, skipped: 0, reasons: [], renamed: 105 }
  recipient cookbook size 105 -> 211
  EN view: original "Sweet Potato Curry with Chickpeas" | imported copy "Süßkartoffel-Curry mit Kichererbsen"
  ```
- **Fix:** In `planImport`, skip an incoming recipe whose id is taken *and* whose content (name, category, ingredients, steps, tips, times, servings, tags…; ignore the personal fields and `photos`) equals the existing recipe. Report it in `skipped` with the reason "schon im Kochbuch" (i18n). Only rename on a real clash (same id, different content). This needs Marcel to confirm, because it changes G2.1 AC (6). Ask before the v2.18 release. Short-term alternative: exclude unedited base recipes from the whole-cookbook export.
- **Regression test:** `test-recipe-import.js` "planImport: identical recipe under same id is skipped, not duplicated": `planImport(parse(buildExportFile(snapshot)).recipes, snapshot)` → `toAdd.length === 0`, `skipped.length === 105`. Plus "same id, different content → renamed" with `existing=[{id:"r01",name:"A"}]`, `incoming=[{id:"r01",name:"B"}]` → 1 renamed.
- **Effort:** S

### BH-13 [P2] Import accepts any `version` number, so a future format-4 file is written into the flat-v3 store · confidence: med · evidence: E1
- **Where:** `v2/src/data/recipeImport.js:15-17` (checks only `typeof number`), then `:21-26` (each recipe through the v3 `validateRecipe`, all unknown fields kept), then `store.js:163` → `rezepte.json`.
- **What breaks:** v2.21 plans format 4 (P6, R1 fields). A file exported from the new app (version 4) and imported into a v2 install is checked against v3 rules only. Recipes whose fields changed type get dropped with German validator messages. Recipes that only gained fields are imported with the unknown v4 fields, and those then sit in the v3 `rezepte.json` that v1 and Project-Claude also read. This works against rule 1 ("flat-v3, additive fields only"). It also works the other way: `version: 99` imports silently.
- **Proof:** probe `ie_probe.mjs`: `parseImportFile({version:99, recipes:[valid]})` → 1 recipe, 0 errors.
- **Fix:** Reject `version > SCHEMA_VERSION` with a clear reason ("Datei stammt aus einer neueren App-Version"). Optionally accept older versions through `migrate.js`.
- **Regression test:** `parseImportFile: newer version rejected`: `{version: SCHEMA_VERSION+1, recipes:[valid]}` → `recipes: []`, `errors.length === 1`.
- **Effort:** S

### BH-14 [P3] Import result sheet shows untranslated German reasons, and a stray "–" for an empty file · confidence: high · evidence: E1
- **Where:** `data/recipeImport.js:10,13,16,18,23` (German literal error strings, plus `validateRecipe` messages from `schema.js:41-72`) → `features/cookbook/importFile.js:17` (rendered as `<li>`). `importFile.js:29` passes the placeholder `["–"]` when nothing parsed and there were no errors.
- **What breaks:** (a) With an EN/ES/DA UI, an invalid file shows "Nothing imported…" followed by bullets like "Datei ist kein gültiges JSON" or "Rezept[0]: category ungültig: \"Pasta\"". (b) A valid file with `"recipes": []` shows the "file is invalid" error plus a bullet "–", and the counter says "1 skipped" (`summarizeImport` counts the placeholder as an error).
- **Proof:** probe: `summarizeImport({toAdd:[],skipped:[],renamed:[]},["–"])` → `{ imported: 0, skipped: 1, reasons: ['–'], renamed: 0 }`.
- **Fix:** Have the parser return error codes (plus index and field) and map them through `t()` in `importFile.js`. Show an "empty file" message instead of the placeholder.
- **Regression test:** `importText('{"version":3,"recipes":[]}')` sheet → no `.import-reasons`, and the message is "no recipes in file". i18n: every parser error code has a key in all 4 languages.
- **Effort:** S

### BH-15 [P3] File export: a share error other than cancel gives no download fallback, and a synchronous throw escapes the menu's `.catch` · confidence: med · evidence: E2
- **Where:** `features/cookbook/export.js:92-98` (`deliverExportFile` rethrows every non-`AbortError` from `navigator.share`, e.g. `NotAllowedError`). Compare `shareRecipeText` at `:65-76`, which falls back to the clipboard. `export.js:111-112`: `exportFile` is not `async`, so a throw from `buildExportFile` → `assertCanonical` (`baseLang.js:61-65`) happens before a promise exists, and `menu.js:41` `.catch(...)` never sees it (uncaught error, no alert).
- **What breaks:** On iOS/macOS Safari, where `canShare({files})` is true, a rejected share means the user gets a raw DOMException text in an alert and no file. The download path is never tried. The second part is a trap: today `getRecipesDe()` keeps localized records out, but a future caller passing `state.recipes` would fail with nothing on screen, not with the intended error.
- **Fix:** On a non-Abort share error, fall through to the `<a download>` path. Make `exportFile` `async` (or wrap the call in `try`) so builder errors reach `.catch`.
- **Regression test:** `deliver: share rejects NotAllowedError → falls back to download` (stubbed navigator, assert an anchor `click`). `exportFile(localized) returns a rejected promise` (does not throw synchronously).
- **Effort:** S

## Checked and refuted
- **Import overwrites an existing recipe on id clash** (including a clash that appears between planning and saving): refuted. `planImport` locks the existing and incoming ids (`recipeImport.js:32`). `importRecipes` plans again inside the save queue against the stored list (`store.js:160-166`), and `saveChange` calls the change function exactly once (`sync.js:122-124`). Duplicate ids inside one file get renamed (E1: `['x','r179…']`).
- **Rename ids differ between the optimistic plan and the queued plan** (both use `Date.now`): true, but harmless. `swapShown` replaces the shown copies by identity before anyone can edit them.
- **Failed import leaves ghost recipes on screen**: refuted. The `catch` at `store.js:168-174` removes exactly the shown objects.
- **Export / Markdown / share leaks translated text**: refuted. The menu uses `getRecipesDe()` (`menu.js:40-41`), the detail share uses `getRecipeDe(r.id)` (`detail.js:180`), and `buildExportFile`/`exportMarkdown` throw on records with the LOCALIZED marker (E1: throws for `localizeRecipes` output). The marker is non-enumerable, so it never reaches JSON. A spread copy drops it, which is correct for the canonical store.
- **Round trip loses fields**: refuted. 105 snapshot recipes → `buildExportFile` → `parseImportFile` → 105 recipes, 0 errors. Personal fields are dropped on export, `photos` on import.
- **Import keeps `favorite`/`rating`/`feedback`/`cookedCount`/`lastCooked` from a raw `rezepte.json`**: confirmed by probe, but this is as specified (G2.1 AC 3 "all other fields are kept"). Not a bug. → data-guardian if that should change.
- **Unescaped `title="${t(…)}"`** (`cookbook.js:196`, `detail.js:40`, `settings.js:27`): static dict strings with no straight quotes in any language (E1). Safe.
- **New `t()` calls with wrong placeholder names** (`form.saveFailed {e}`, `importFile.* {n,msg}`, `detail.shareFail {msg}`, `export.copyFail {msg}`): refuted by probe, 0 mismatches.
- **`cookedMonthKey` word matching**: the probe gives correct results for DE/EN/ES/DA full names and abbreviations. Known harmless edge: any word starting with a month prefix also counts ("maybe 2026" → 202605), and US `3/15/2026` → 202615 (old `num` branch, not part of this delta). The app always writes `de-DE` "Mai 2026", and `SCHEMA.md:74` documents the accepted formats. Not a finding.
- **File picker leaks `<input>`** if neither `change` nor `cancel` fires: at most one hidden node per cancelled pick on old browsers. Not worth a finding.

## Verified clean
- i18n: every literal `t()`/`tn()` key under `v2/src` resolves in de/en/es/da, and the placeholders match the call params (E1 `i18n_probe.mjs`; the only "misses" are dynamic prefixes and a comment).
- `recipeExport.exportFileName`: path-unsafe characters stripped, blank name → `rezept.citchen.json`, multi → dated name.
- `shareRecipeText`: share → `shared`, AbortError → `cancelled`, other error → clipboard.
- `importFile.js` result sheet: all dynamic text goes through `esc()`.
- `store.importRecipes` / `persist` / `setSaveChangeForTest`: `pendingSaves` balanced in `finally`, a single persist per file.
- SW `SHELL` contains the new modules (`test-sw-shell.js` green).

## Definition drift
The agent file names `data/listSync.js`/`friendInbox.js` etc. correctly, but recipe sync now runs through `data/syncCore.js` + `syncRules.js` (the agent file only mentions `sync.js` + `decideSync.js`). There is no root `rezepte.json`; recipe data probes use `v2/data/rezepte.snapshot.json`.

## Cross-lens notes
- → release-captain / ux-curator: Epic G2 promised a detail "Share" chooser ("for import into the app" / "readable"). G2.4 (#30) deferred the chooser to G2.3, but G2.3 (#42) doesn't include it. There is no UI to export **one** recipe as a file (`exportFileName` supports it, no caller does). This is what makes BH-12 the normal path.
- → simplifier: `store.js:76-78` puts the new `getRecipesDe` between `getRecipeDe` and its doc comment.
- → test-warden: no test imports a whole-cookbook export into a seeded store (BH-12), and none checks `version > SCHEMA_VERSION` (BH-13).
- → data-guardian: a foreign `image` URL from an imported file is fetched as a CSS background (`ui/helpers.js:74-75`). This is a new trust boundary (files from friends), but the feature is as designed.

## Summary
P0 0 · P1 1 (BH-12) · P2 1 (BH-13) · P3 2 new (BH-14, BH-15) + 2 carried (BH-02, BH-03). BH-04…BH-11 fixed.
Most valuable: **BH-12**. Sharing the whole cookbook, the only file export there is, doubles all 105 base recipes on the recipient's device. Decide the dedup rule with Marcel before v2.18 ships.
