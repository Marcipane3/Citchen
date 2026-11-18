# Test-Warden — findings (2026-11-18T00:00:00Z)
_Build 2026-10-27-v2.17 (release-prep bump to 2.18 not yet applied) · CACHE koch-v2.17-1 · tests 583/583 · HEAD fe191d6 · mode DELTA (origin/main..HEAD)_

Suite green. No P0/P1 test-gap: every release-delta path that writes `rezepte.json` (import, `origin`, merge, schema envelope) and the shopping list has named tests, including regression pins for BH-12/#48 and FR-01. Probes run in `/tmp/claude-0/tw/p.mjs` (E1).

## Field reports
FR-01 (Ingwer on the list): now pinned by `tests/test-shopping-identity.js` (`FR01.oneRowPerIngredient`, `unitVariants`, `twoIngredientsInOneLine`, `tombstoneBeforeLive`, `idempotentRepeat`, `replayAfterDelete`, `invariant.noDuplicateIds`, real-recipe smoke). `git diff origin/main..HEAD` touches no shopping/listMerge/listSync/friendInbox source, so no new shopping risk in this delta. Only the stale-device case (TW-12) is still unpinned.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| TW-05 | sync I/O shell never run against fakes | ✅ fixed | `syncCore.createSyncEngine` (`syncCore.js:34`) is exercised with `fakeDrive`/`fakeKv` for recipes and list configs in `tests/test-sync-core.js:13-190,521` (offline, patchMeta with missing fileId, separate fileIds). |
| TW-06 | separate fileIds / list never touches recipe file | ✅ fixed | `test-sync-core.js:67,115-116,521` use distinct `rezepte.json` / `einkaufsliste-<user>.json` locate + meta keys. |
| TW-07 | `toFileString` without injected `now` | ⏳ still open (low) | `test-canonical.js:41` and `test-migrate.js` still only use injected clocks. |
| TW-08 | `extractJson` adversarial | ⏳ still open (low) | `test-ai.js:88-93` has nested-brace/fence/empty only; unbalanced `{"a":1` and array root unpinned (behaviour was right at E1). |
| TW-09 | cross-path item identity | ✅ fixed | `test-shopping-identity.js:63-238`. |
| TW-10 | `mergeItems` first-hit wins | ✅ fixed | `findSame` prefers the open row (`test-shopping-identity.js:139,246`). |
| TW-11 | `applyFriendItems` duplicate id / seen boundary | ✅ fixed | `test-shopping-identity.js:159`, `test-friends.js:104,133` (`trimSeen` 300). |
| TW-12 | tombstone pruned remotely, stale live copy returns | ⏳ still open (med→low) | Re-probed: `syncStep([live x, updated 40 d ago], [], now)` → `merged [["x",false]], writeRemote true` (E1). No test pins a decision; same class as DG-13. Needs a device idle >30 d. |
| TW-13 | real-line `parseIngredient` | ✅ fixed | `test-shopping-identity.js:92-107,238` (units, two-in-one line, data-driven smoke). |
| TW-14 | `listSync.js` / `friendInbox.js` I/O shells | ⏳ still open (low) | `listSync`/`friendInbox` are not imported by any test (only their pure cores); ordering `applyExternal → patchInbox(seen) → fl_ack` unpinned. Engine underneath is covered (TW-05). |

## New findings

### TW-18 `v2/src/data/recipeImport.js:84-96` `planImport` · risk: low · evidence: E1
- **Covered today:** `test-recipe-import.js:45` (two *different* recipes with one id → one renamed), `:53` (same file twice), `:399` (own full export).
- **Gap:** two *identical* recipes inside one file are not recognised as duplicates, because `isSameRecipe` is checked only against `existing` (`byId`), never against `toAdd`. Probe: `parseImportFile(file([A id x, A id x]))` → `planImport` imports both, the second as a renamed copy (`renamed [{from:"x",to:"r1795…"}]`). A hand-merged or appended file therefore yields a visible duplicate. Not a regression and not reachable from the app's own export (ids unique).
- **Proposed cases:**
  - `import: identisches Rezept zweimal in der Datei`: `planImport([r("x","A"), r("x","A")], [])` → expect `toAdd.length 1`, `skipped.length 1`, `renamed.length 0` (decide first; pin whichever behaviour is wanted).
  - `import: gleiche id, anderer Inhalt in der Datei` stays renamed (existing `:45`).
- **Guards against:** BH-12/#48 class (import duplication). Severity P3.

### TW-19 coverage map of the delta · risk: low · evidence: E1 (export-name grep over `v2/tests`)
Pure modules changed in the delta, exports with **no reference** in `v2/tests`:

| module | untested exports | assessment |
|---|---|---|
| `data/recipeImport.js` | `isSameRecipe` | covered indirectly through `planImport`/`importRecipes` skip cases (`test-recipe-import.js:53,389-406`). Fine. |
| `data/recipeMerge.js` | `sameCollection` | **gap, med-low.** Used by `store.js:96` (decides whether to replace local state after a sync pull) and `syncRules.js:89,99` (decides `write`/no-write, i.e. whether `rezepte.json` is rewritten). No direct test for length mismatch, reorder, or `origin`/personal-field-only difference. Proposed: `sameCollection: gleiche Reihenfolge+Inhalt → true; vertauscht → false; nur origin verschieden → false; andere Länge → false; [] vs [] → true`. |
| `data/schema.js` | `envelopeProblem`, `ORIGIN_USER`, `SCHEMA_VERSION`, enums | `envelopeProblem` is covered through `parseImportFile`/`inspectRemote` cases (null, `{}`, newer version). Add one direct table test: `null/[]/1 → notObject`, `{}` → noRecipes, `{recipes:[],version:99}` → newerFormat, `{recipes:[],version:"3"}` → null. |
| `data/baseLang.js` | `assertCanonical`, `isLocalized`, `LOCALIZED` | exercised via `test-baselang.js`/`test-canonical.js` (not by name). Export path calls it (`recipeExport.js:9`, `cookbook/export.js:35`); one named test "export of a localized recipe throws" is in `test-recipe-export.js` per #83. Fine. |
| `ai/prompts.js` | `generateUserPrompt`, `elaborateUserPrompt`, `leftoverUserPrompt`, `shopMarkerRule` | low (prompt builders). #69 instruction-template path is covered. |
| `ai/gate.js`, `ai/usage.js`, `i18n.js` | `DEFAULT_MODEL`, `isOffline`, `priceOf`, `onLangChange`, `MONTH_DICT` | low; `models.js` single-source rule is test-enforced. |
| `features/cooking/timers.js`, `portions.js`, `data/units.js`, `ingredients.js`, `ingredientMatch.js`, `recipeExport.js` | none | fully referenced. |

DOM files in the delta (`cookbook/importFile.js`, `export.js`, `form.js`, `detail.js`, `cooking.js`, `menu.js`, `assistant.js`, `settings.js`, `capture.js`, `ui/helpers.js`) are intentionally untested. Logic worth extracting only if it grows: none seen that writes `rezepte.json` outside `store.js`.

### TW-20 `v2/src/data/recipeMerge.js:119-123` `mergeRecipes` `origin` field in three-way merge · risk: low · evidence: E1
- **Covered today:** `test-recipe-merge.js:113-133` (twin differing only in origin is the same recipe; backup import then login does not duplicate).
- **Gap:** `mergeFields` (both sides changed) treats `origin` like any field: local `origin:"user"` wins over a remote without it whenever local changed anything else vs base. Probable-intended; unpinned. Probe: twin differing only in `favorite` with a base that lacks the id → `merged 2, forked 0` (correct).
- **Proposed cases:** `mergeRecipes: beide geändert, lokal origin "user", Drive ohne → merged hat origin "user"`; `mergeRecipes: Drive-Rezept ohne origin, lokal geändert → origin bleibt "user"`.
- **Guards against:** #72 silently dropping the user/base distinction on a merge. Severity P3.

## If you add three tests, add these
1. `import: identisches Rezept zweimal in der Datei` (TW-18) — one line, decides a visible-duplicate edge.
2. `sameCollection` direct table (TW-19) — it gates both "write `rezepte.json`" and "replace local state".
3. `FR01.sync.staleDeviceResurrection` (TW-12) — pin the chosen rule for pruned tombstones.

## Checked and refuted
- "Import of a malformed envelope slips into the store": `{recipes:[null,[],"x"]}` → three per-recipe errors, `version:"3"` and missing version rejected, `http://` image stripped with a note, blank/non-string `id` rejected (E1).
- "Personal-field-only twin forks on sync": `forked 0` (E1).
- "`origin` makes the second import of the same file non-idempotent": refuted by `test-recipe-import.js:389`.
- "Release delta changes shopping logic": no diff in `features/shopping`, `listMerge`, `listSync`, `friendInbox`.

## Verified clean
- Suite 583/583; wiring: 34 imports in `run.js`; `test-syntax.js`, `test-sw-shell.js` present.
- Import core (limits, https image, id trim, collision rename, summary), export file, `origin` stamping, cooking portions/timers, units/ingredients/matcher, contrast, i18n: all exports referenced.
- FR-01 regression pack present and passing.

## Definition drift
Agent file mentions no stale facts; previous report's "20 test files / sync I/O untested" is obsolete: tree has 34 test files and `createSyncEngine` with fakes. `BUILD`/`CACHE` still 2.17 (release-prep not yet applied).

## Summary
Suite 583/583. New: P0 0 · P1 0 · P2 0 · P3 3 (TW-18, TW-19 sameCollection gap, TW-20). Old: 6 fixed (TW-05, 06, 09, 10, 11, 13), still open TW-07 (low), TW-08 (low), TW-12 (med→low), TW-14 (low). No release blocker from the test lens. Most valuable item: a direct `sameCollection` test, since it decides whether `rezepte.json` is rewritten.
- Renumbered by release-prep: new findings were first written as TW-15/16/17, which issues #51/#52 already use.
