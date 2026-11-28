# Test-Warden — findings (2026-11-28T00:00:00Z)
_Build 2026-11-21-v2.19 (bump to 2.20 not yet applied) · CACHE koch-v2.19-1 · tests 718/718 · HEAD e39acc6 · mode DELTA (origin/main..HEAD, release-bump/2.20-r2)_

Suite green: 718 passed, 0 failed (was 689 at the last pass). **No new P0/P1.** Since 7076063 the diff added `data/nutritionGoal.js` (#138), `searchIngredients` (#139), same-origin isolation (#137), the DG-22 pendingBase fix (#136) and the twin-merge decision test (#149). Each one comes with tests in the same diff.

## Field reports
FR-01 is fixed in code, and the shopping modules are not in this diff. No open report touches the changed modules.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| TW-20 | `mergeRecipes` twin keeps remote personal fields | ✅ fixed | e39acc6 (#149). `test-recipe-merge.js:166` pins that the twin keeps the local favorite and rating. |
| TW-21 | empty envelope outcome (BH-14) | ⏳ open (med) | Not re-verified. `recipeImport.js` is unchanged since the last pass. |
| TW-22 | `sameCollection` unpinned | ⏳ open (low) | Still named in only one test file. |
| TW-24 | `isSameRecipe` not named in tests | ⏳ open (low) | grep count is 0. |
| TW-28 | pendingBase lifecycle after a no-write sync | ⏳ open (low) | #136 added tests at `test-recipe-merge.js:321-347` (fork cases). The stale-pendingBase-without-write case is still not named. |
| TW-29 | `parseMoveFile` `__proto__` keys | ⏳ open (low) | No test uses those keys. |
| TW-30 | `shopMarkerRule` / `leftoverUserPrompt` / `generateUserPrompt` / `elaborateUserPrompt` untested | ⏳ open (low) | grep count is still 0 for all four. |
| TW-25, TW-07, TW-08, TW-14 | older low items | ⏳ open (low) | Not touched in this diff. |

## New findings

### TW-31 `v2/src/data/nutritionGoal.js` constants and `data/settings.js` `getStaples`, theme helpers · risk: low · evidence: E1
- **Covered today:** `test-nutrition-goal.js` M1 cases cover `cleanGoal` and the `get/set/resetNutritionGoal` round trip. `GOAL_KEY`, `DEFAULT_PRESET`, `KCAL_RANGE` and `PROTEIN_RANGE` are not named in any test. They are only used indirectly.
- **Gap:** The probe shows `cleanGoal` is correct on every edge I tried:
  - `null`, `[]` and `"x"` → defaults.
  - `"2000"` → 2000, and `" 50 "` → 50.
  - 2000.5, 6001, `true` and `NaN` → null.
  - 800 is accepted. The `__proto__` and `constructor` presets → balanced.
  Missing pins: the upper boundaries (6000 and 400 accepted, 6001 and 401 rejected), the lower boundaries (799 and 9 rejected), and a pin that `GOAL_KEY` stays `"nutritionGoal"`. Renaming the key would silently orphan stored goals.
- **Proposed cases:**
  - `cleanGoal: 6000/400 ok, 6001/401 → null, 799/9 → null`.
  - `GOAL_KEY === "nutritionGoal"` (storage-name contract).
- **Guards against:** a boundary regression, or a silent loss of a user's stored goal.

## Checked and refuted
- `cleanGoal` rejects non-integer, boolean and NaN input and prototype-named presets (probe above).
- `searchIngredients` guards an empty or non-string query and `limit <= 0`. It escapes regex metacharacters, and ties are ordered deterministically by rank, length and id. Tests at `test-ingredient-match.js:385-400` cover this.
- `GOAL_PRESETS` and the DE/EN/ES/DA wording are pinned by M1 tests.

## Verified clean
Coverage of the changed pure modules, counted as exports named in at least one test file:
- `moveFile` 13/13, `items` 2/2, `syncRules` 3/3, `filter` 12/12, `ai/parse` 13/13.
- `ingredientMatch` 4/4. `recipeMerge` 7/7, with the TW-22 caveat.
- `recipeImport` 4/5, because `isSameRecipe` is not named (TW-24).
- `ai/prompts` 14/18 (TW-30). `nutritionGoal` 2/6 named (TW-31).
- `settings` 8/14: `resetProfile`, `getStaples` and the theme helpers are not named. They sit on IndexedDB/DOM and are low value.

## Definition drift
None. `BUILD` and `CACHE` still read 2.19 because release-prep has not applied the bump.

## If you add three tests, add these
1. TW-28: a lost ack followed by a no-write sync leaves pendingBase unchanged.
2. TW-29: `parseMoveFile` drops `__proto__` and `constructor` keys.
3. TW-31: `cleanGoal` boundaries plus the `GOAL_KEY` contract.

## Already well-covered
`moveFile`, `ai/parse`, `filter`, `syncRules`/`items` (#112, #114), `recipeMerge` twin and pendingBase fork cases, `searchIngredients` and `cleanGoal` basics.

## Summary
P0 0 · P1 0 · P2 0 · P3 4 (TW-28, TW-29, TW-30, TW-31 are all low-risk). Carried over: TW-21 (med), TW-22 and TW-24. The suite is green and coverage of the new code is good. The most valuable item is TW-28, the sync-path lost-ack case.
