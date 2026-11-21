# Test-Warden — findings (2026-11-21T12:00:00Z)
_Build 2026-11-18-v2.18 (bump to 2.19 not yet on branch) · CACHE koch-v2.18-1 · tests 636/636 · HEAD 556b19c · mode DELTA (origin/main..HEAD, release candidate v2.19: #73, #89, #92, #105, #107)_

Suite green: 636 passed, 0 failed (was 583). Pure logic changed in `ai/parse.js`, `data/items.js` (new), `data/recipeImport.js`, `data/recipeMerge.js`, `data/schema.js`, `store.js`; each has new tests in the same diff. **No new P0/P1.** Probes: `/tmp/claude-0/tw/d.mjs` (outside the repo).

## Field reports
None open that touch this lens.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| TW-20 | `mergeRecipes` twin keeps remote personal fields | ⏳ still open (low) | `recipeMerge.js` only changed `NOT_CONTENT` (+`items`); twin rule untouched. |
| TW-21 | import outcome / BH-14 empty file | ⏳ still open (med) | `recipeImport.js` `parseImportFile` still returns `errors: []` for an empty envelope; not touched by this diff. |
| TW-22 | `sameCollection` unpinned | ⏳ still open (low) | No test names it. |
| TW-23 | `cookedMonthKey` "Sept" | ⏳ still open (low) | `filter.js` not in diff. |
| TW-24 | `isSameRecipe` export not named in tests | ⏳ still open (low) | Behaviour pinned via `planImport`. |
| TW-07 / TW-08 / TW-14 | default-clock `toFileString`, `extractJson` adversarial, `friendInbox` order | ⏳ still open (low) | Not touched. |

## New findings

### TW-25 `v2/src/data/schema.js` `withoutBadItems` · risk: low · evidence: E1
- **Covered today:** indirectly via import and store paths (`test-recipe-import.js`, `test-canonical.js`, `test-sync-core.js`). No test imports the export directly (grep count 0 in schema/items tests).
- **Gap:** identity contract ("same object when nothing to do", no mutation of the input, `null` or non-object input passes through) is unpinned. Probe: `withoutBadItems({id:1, items:[null]})` → `{id:1}`; behaviour correct.
- **Proposed cases:**
  - `withoutBadItems: valid items → same object (===)`.
  - `withoutBadItems: bad items → copy without items, input unmodified`.
  - `withoutBadItems: null / non-object / no items → returned unchanged`.
- **Guards against:** a refactor that always copies, which would make `updateRecipe` and import churn.

### TW-26 `v2/src/ai/parse.js` `coerceUpdate` tips type coercion · risk: low · evidence: E1
- **Covered today:** `test-ai.js` update cases (typed-field "given" rule).
- **Gap:** stored `tips:"t"`, model sends `tips:{}` (an object counts as "given" at `parse.js` `typed.tips`) → result `tips:""`, so the stored tip is silently wiped by an empty object. Probe output: `"tips":""`. A model that echoes an empty tips object is plausible. The user sees it in the diff card, so low.
- **Proposed cases:** `coerceUpdate: tips {} over stored string → decide: keep stored tips, or pin "" (card shows removal)`.
- **Guards against:** silent content loss through the assistant update card.

### TW-27 `v2/src/ai/parse.js` `coerceUpdate` + `data/items.js` stale `items` · risk: low · evidence: E1
- **Gap:** `coerceUpdate` carries `items` through unchanged while `ingredients` changes (probe: `ingredients:["2 Eier"]`, `items:[{text:"1 Ei"}]` stays). Harmless today (`relinkItems` matches by text and drops stale entries on the view side), but nothing pins it.
- **Proposed case:** `coerceUpdate then withItems: changed ingredient line → items for the old line vanish, new line is derived`.

## Checked and refuted
- `applyUpdatePatch` double-apply: probe → second call returns `applied:false` (conflict), no overwrite. Good.
- `coerceChange` with `__proto__` id → `null` (a `Set` lookup is safe).
- `relinkItems` with duplicate lines and a mismatched count → re-derives, no multiplication (probe returned 2 items for 2 lines).
- `coerceUpdate` ignores model-sent `id`, `favorite` and `toTry`; stored personal fields survive.

## Verified clean
Coverage map of the changed modules (export → tests): `CONTENT_FIELDS`, `applyContentFields`, `coerceUpdate`, `recipeChanges`, `makeUpdatePatch`, `applyUpdatePatch`, `coerceChange` (`test-ai.js`, `test-canonical.js`); `relinkItems`, `withItems`, `setItemIndex` (`test-items-relink.js`, 135 lines); items shape in `test-schema.js:123-`; `recipeImport` cleaned-existing comparison (#89) in `test-recipe-import.js`; `recipeMerge` `NOT_CONTENT` items in `test-recipe-merge.js`. Only `withoutBadItems` has no direct test (TW-25). Shopping and sync modules are not in the diff.

## Definition drift
None.

## If you add three tests, add these
1. TW-21 empty-envelope outcome (open bug BH-14, needs a small helper extracted first).
2. TW-26 `coerceUpdate` empty-tips decision.
3. TW-25 `withoutBadItems` identity and non-mutation.

## Already well-covered
Assistant update patch (base/set conflict, re-apply), derived `items[]` relinking (idempotence, duplicate lines, manual corrections), schema items shape, import dedupe against cleaned existing recipes.

## Summary
P0 0 · P1 0 · P2 0 · P3 3 new (TW-25..27) · carried: TW-21 (med) plus 7 low. Most valuable: TW-21 regression test for BH-14.
