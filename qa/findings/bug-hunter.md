# Bug-Hunter — findings (2026-11-21T12:00:00Z)
_Build 2026-11-18-v2.18 · CACHE koch-v2.18-1 · tests 636/636 · HEAD 556b19c · mode DELTA (origin/main..HEAD, release candidate v2.19: #73 #89 #92 #105 #107)_

## Δ since origin/main
Changed under `v2/src`: `ai/parse.js`, `ai/prompts.js`, `app.js`, `data/items.js` (new), `data/recipeImport.js`,
`data/recipeMerge.js`, `data/schema.js`, `features/assistant/assistant.js`, `features/cookbook/detail.js`, `i18n.js`,
`store.js`, plus `v2/data/ingredients.json` and `sw.js` SHELL. The working tree is clean. I hunted these files and their importers
(`store.js` → every `updateRecipe`/`getRecipe` caller, `detail.js` → `assistant.startChange`).

New: **none**. No P0, no P1, no P2, no P3.

## Field reports
FR-01 (Ingwer): no shopping-list code (`features/shopping/*`, `listSync.js`, `friendInbox.js`, `derive.js`) changed in
this range. The new recipe `items[]` exists only in the view, and no shopping code reads it (grep: no consumer of
`recipe.items` under `features/`). The status stays as the orchestrator set it: waiting for Marcel's device check.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | ✅ fixed | 9019e8c (v2.7), unchanged |
| BH-02 | Match "Nochmal" shows recipes you already matched | ⏳ still open | `features/match/match.js:120` still shuffles all `state.recipes`, while `:91` filters them. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | ✅ fixed | e9b2b9b (#64), unchanged |
| BH-04 … BH-11 | Shopping identity / merge / horizon | ✅ fixed | 41e5ea0 / 2eab1bb, unchanged |
| BH-12 | Whole-cookbook import doubles the base recipes | ✅ fixed | 2b27980, still holds. #89 (b6f46d8) now also cleans the *existing* recipe before comparing it (`recipeImport.js:363-369`) |
| BH-13 | Import accepts any `version` | ✅ fixed | 6dd0c52, unchanged |
| BH-14 | Import sheet shows German reasons, and "–" for an empty file | ⏳ still open | German literals at `recipeImport.js:53-62`, `["–"]` at `importFile.js:29`. This delta adds more German-only reasons that reach the UI through `assistant.schemaFail`: `schema.js` "items muss Array von {text, …} sein" and `parse.js:78` "Unbekanntes Rezept: …". P3 · E2 · S |
| BH-15 | Export: no download fallback | ✅ fixed | 653dcb9, unchanged |
| BH-16 | Lost Drive write ack + later edit → recipe forked into a duplicate | ⏳ still open | `recipeMerge.js:121` fork condition unchanged. Only `NOT_CONTENT` gained `items` (`:75`). P3 · E1 · M |

## New findings
None.

## Checked and refuted
- **The assistant's update card shows spurious changes when the model echoes the recipe unchanged:** refuted (E1). I fed all 105 snapshot recipes through `coerceUpdate`, using their own content fields as the model answer. Result: 0 failures, 0 spurious entries from `recipeChanges`.
- **Applying an update overwrites personal fields or `origin`:** refuted (E1). With `favorite:false` in the model answer, `favorite` stays `true`. `toTry` is never taken from the model (`parse.js:90`). `updateRecipe` restores `origin` (`store.js:133`).
- **`applyUpdatePatch` re-applies the same card, or applies over a newer edit:** refuted (E1). A second apply returns `applied:false` with conflicts `[ingredients, tips]`. A changed non-patch field (`favorite`) does not block the patch. The patch survives the JSON round-trip through the `data-*` attribute.
- **`updateRecipe` runs `fn` twice (in memory, then in the queue), and the second `applyUpdatePatch` reports a false "stale":** refuted (E2). `sync.saveChange` (`data/sync.js:124`) applies the change to the IndexedDB list, which does not contain the in-memory edit yet, so both calls see the same base. If the queue really diverged, the error and the restored `res.recipes` agree (`store.js:105-113`). Side note, not a defect: a stale apply still persists a no-op edit (dirty flag plus one sync round-trip).
- **`items[]` leaks into IndexedDB or Drive, or makes the collection dirty on boot:** refuted (E2). `withItems` runs only inside `recomputeView` (`store.js:31-35`). `recipesDe` and persistence are untouched. All write paths (`updateRecipe`, form, export) read `recipesDe`/`getRecipeDe`, and `sameContent` ignores `items`.
- **`relinkItems` is not idempotent, so it creates new objects on every render:** refuted (E1). 105/105 recipes come back as the same object on a second pass. 839 lines give 1013 items, 1002 of them linked, 0 invalid, about 22 ms for the whole cookbook.
- **`startChange` from a detail sheet opened inside the assistant does nothing (same hash):** refuted. `router.navigate` calls `resolve()` when the hash is already the target (`router.js:16`).
- **XSS on the new update card / attach bar:** refuted. Every recipe-derived value goes through `esc()`. `data-field` comes from the constant `CONTENT_FIELDS`.
- **The ingredient master is missing offline:** refuted. `./data/ingredients.json` and `items.js` are in SHELL. A failed fetch is caught and leaves the view without `items` (`app.js:235-238`).

## Verified clean
- i18n: every literal `t()`/`tn()` key plus every `fieldLabel` key for all 17 `CONTENT_FIELDS` resolves in de/en/es/da (E1). The only misses are dynamic prefixes and plural objects, the same as last run.
- #89/#92 import comparison: `cleanRecipe` is shared by parse and compare, and nothing is mutated.
- #107 schema: `withoutBadItems` drops only a malformed `items`, never the recipe. Import keeps a valid `items`.
- `detail.js` "✨ change with assistant" is gated by `isPremium()` and always attaches the German original.

## Definition drift
The agent file still names `decideSync.js` as the recipe sync decision point. Recipe sync runs through `syncCore.js` + `syncRules.js` + `recipeMerge.js`.

## Cross-lens notes
- → test-warden: no test checks that the view-only `items` never reach `db.replaceAll`/Drive after an edit (store-level).
- → ux-curator: if the model changes `prepTime` but echoes the old `totalTime`/`time`, the card keeps the inconsistent times (`parse.js:100-103` recomputes only when they are not given).

## Summary
P0 0 · P1 0 · P2 0 · P3 0 new. Still open: BH-02, BH-14 (has grown a little), BH-16, all P3.
**No new P0/P1.** The most valuable check: the assistant update path (#73) was E1-verified on all 105 real recipes. It produces no spurious changes and does not overwrite personal fields.
