# Test-Warden — findings (2026-11-25T12:00:00Z)
_Build 2026-11-21-v2.19 (bump to 2.20 not yet applied) · CACHE koch-v2.19-1 · tests 689/689 · HEAD 7076063 · mode DELTA (origin/main..HEAD, release-bump/2.20)_

Suite green: 689 passed, 0 failed (was 636). Pure logic changed in `data/moveFile.js` (new), `data/recipeMerge.js` + `syncRules.js` + `sync.js` (#90 pendingBase), `data/items.js` (#112), `data/recipeImport.js`, `ai/parse.js`, `ai/prompts.js`, `features/cookbook/filter.js` (#93). Every changed module has new tests in the same diff. **No new P0/P1.**

## Field reports
FR-01 (shopping duplicates) is fixed in code and the shopping modules are not in this diff. No open report touches the changed modules.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| TW-20 | `mergeRecipes` twin keeps remote personal fields | ⏳ open (low) | Twin rule untouched. The #90 tests add the pendingBase variants, not this case. |
| TW-21 | empty envelope outcome (BH-14) | ⏳ open (med) | Not re-verified in this delta. `recipeImport.js` changed in this diff, so re-check next FULL run. |
| TW-22 | `sameCollection` unpinned | ⏳ open (low) | Still no test names it directly. `grep` count of 1 file is `test-recipe-merge.js` only via the merge path. |
| TW-23 | `cookedMonthKey` "Sept" | ✅ fixed | Commit f140080 (#93, #122). |
| TW-24 | `isSameRecipe` export not named in tests | ⏳ open (low) | Grep count is 0 again. |
| TW-25 | `withoutBadItems` identity | ⏳ open (low) | Not in diff. |
| TW-26 | `coerceUpdate` `tips {}` wipes stored tips | ✅ fixed | Commit 1a62ede (#113, #127). |
| TW-27 | `coerceUpdate` + `withItems` stale items | ✅ fixed | Commit 7076063 pins it (#114, #128). |
| TW-07 / TW-08 / TW-14 | default-clock `toFileString`, `extractJson` adversarial, `friendInbox` order | ⏳ open (low) | Not touched. |

## New findings

### TW-28 `v2/src/data/syncRules.js` pendingBase lifecycle · risk: low · evidence: E2
- **Covered today:** `test-sync-core.js` "#90: Schreiben ohne Bestätigung…" and "#90: … lokal gelöscht → bleibt gelöscht". `test-recipe-merge.js` has five #90 merge cases.
- **Gap:** `setPendingBase` runs only when `write` is true. `pendingBase` is cleared only by `setBase`. No test covers a stale pendingBase surviving a later sync that does not write. It is also unpinned that a pendingBase holding only local-only ids (the `!remoteIds.has` filter) excludes partner recipes.
- **Proposed cases:**
  - `recipeSync: lost ack, then a no-write sync → pendingBase unchanged, no duplicate, base set only on confirmed write`.
  - `recipeSync: partner recipe added on Drive between write and retry → not in pendingBase, not removed as "locally deleted"`.
- **Guards against:** a lost write turning a partner's recipe into a deletion.

### TW-29 `v2/src/data/moveFile.js` `parseMoveFile` prototype keys · risk: low · evidence: E1
- **Covered today:** `test-move-file.js` "Import prüft jeden Wert — Unbekanntes und Kaputtes fällt weg". No test uses `__proto__` or `constructor`.
- **Gap:** behaviour is correct today. Probe `data:{"__proto__":{polluted:1},"constructor":{…}}` → `{data:{}, dropped:["__proto__","constructor"]}` and `({}).polluted` is `undefined`. A refactor to a `for..in` or a spread could regress it silently, and the import writes to IndexedDB.
- **Proposed case:** `parseMoveFile: __proto__ / constructor keys are dropped, Object.prototype stays clean`.

### TW-30 `v2/src/ai/prompts.js` `shopMarkerRule`, `leftoverUserPrompt`, `generateUserPrompt`, `elaborateUserPrompt` · risk: low · evidence: E1
- **Covered today:** none (grep count 0 for each name in `v2/tests`). The delta added a delete line to the prompt text and is covered through `buildSystemPrompt`.
- **Gap:** pure string builders with interpolated user input. No test checks that an empty or undefined argument does not print the literal "undefined".
- **Proposed case:** `each *UserPrompt with empty input → no "undefined" / "[object Object]" in output`.

## Checked and refuted
- `parseMoveFile` rejects `[]`, `null`, wrong kind, a future version, a missing `data` and a file over `MAX_BYTES` with a typed error, not a crash (probe).
- `relinkItems` #112 fix: `kept.length / n <= derived.length` still re-derives on a count mismatch and does not multiply. The new `test-items-relink.js` case covers it.
- `db.kvDel` exists (`v2/src/data/db.js:155`), so `setBase` in `v2/src/data/sync.js` is safe.

## Verified clean
Coverage map for the changed modules (export → number of test files naming it):
- `moveFile`: all 12 exports are named in `test-move-file.js` (236 lines).
- `recipeImport`: 4 of 5 are tested. `isSameRecipe` is named in no test, but `planImport` pins it.
- `recipeMerge`: 6 of 6 are named in tests, with the TW-22 caveat.
- `syncRules`, `items`, `filter`: 100% of exports named.
- `ai/parse`: 13 of 13.
- `ai/prompts`: 14 of 18 (see TW-30).

## Definition drift
None.

## If you add three tests, add these
1. TW-28 lost-ack then a no-write sync (sync path, highest risk).
2. TW-21 empty-envelope import outcome (open bug).
3. TW-29 `__proto__` keys in a move file.

## Already well-covered
The #90 lost-acknowledgement merge (five cases at merge level plus two at engine level), `moveFile` (round-trip, secret exclusion, idempotent re-import, shopping merge, i18n for every reject code), `relinkItems` duplicate lines, and the assistant update/delete patch.

## Summary
P0: 0 · P1: 0 · P2: 0 · P3: 3 (TW-28, TW-29, TW-30). Fixed since the last run: TW-23, TW-26, TW-27. Most valuable: TW-28, a regression test for the pendingBase lifecycle.
