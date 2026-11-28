# Bug-Hunter — findings (2026-11-28T12:00:00Z)
_Build 2026-11-21-v2.19 · CACHE koch-v2.19-1 · tests 718/718 · HEAD e39acc6 · mode DELTA (origin/main..HEAD, branch release-bump/2.20-r2)_

## Δ since origin/main
The full range origin/main..HEAD was hunted in the previous run (HEAD 7076063). This run covers what changed since then
(`git diff 7076063..HEAD -- v2/src v2/sw.js`): `data/recipeMerge.js` (#130 `ownWrite`, #91 `fillPersonalGaps`),
`data/ingredientMatch.js` (#139 `searchIngredients`, no UI caller yet), `data/nutritionGoal.js` (new) + `data/settings.js`
+ `features/settings/settings.js` (#138), `i18n.js` (goal keys), `sw.js` (SHELL + activate filter `koch-v2*`, #135).
The working tree is clean. Importers checked: `syncRules.js:79-98` (only caller of `mergeRecipes` with `pendingBase`), `settings.js`.

New: **none**. No P0, no P1, no P2, no P3.

## Field reports
FR-01 (Ingwer): no shopping-list code changed in this range (`features/shopping/*`, `listSync.js`, `listMerge.js`,
`friendInbox.js`, `derive.js` untouched since origin/main). Status unchanged: waiting for Marcel's device check.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | ✅ fixed | 9019e8c (v2.7), unchanged |
| BH-02 | Match "Nochmal" shows recipes you already matched | ⏳ still open | `features/match/match.js:120` still shuffles all `state.recipes`, `:91` filters. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | ✅ fixed | e9b2b9b (#64), unchanged |
| BH-04 … BH-11 | Shopping identity / merge / horizon | ✅ fixed | 41e5ea0 / 2eab1bb, unchanged |
| BH-12 | Whole-cookbook import doubles the base recipes | ✅ fixed | 2b27980, unchanged |
| BH-13 | Import accepts any `version` | ✅ fixed | 6dd0c52, unchanged |
| BH-14 | Assistant `schemaFail` shows raw German validator text | ⏳ still open (narrowed) | `assistant.js:219`, `:262`; `parse.js` "Unbekanntes Rezept". P3 · E2 · S |
| BH-15 | Export: no download fallback | ✅ fixed | 653dcb9, unchanged |
| BH-16 | Lost Drive ack + later edit → fork | ✅ fixed | #90, re-probed: still no fork |
| BH-17 | Lost ack drops another device's ♥/rating/cooked/photo | ✅ fixed | 4e1913b (#130): `recipeMerge.js:83-90` `ownWrite` + `:151`. E1 below |
| BH-18 | After the move, own shopping rows labelled "from another device" | ⏳ still open | `moveFile.js` still excludes `deviceId`; untouched since last run. P3 · E2 · S |

## New findings
None.

## Checked and refuted
- **#130 `ownWrite` still loses the other device's personal edit:** refuted (E1, probe `p1.mjs`: base = 2 snapshot recipes,
  local `[X,…]`, remote `[{…X,<field>},…]`, pendingBase `[X]`):
  ```
  favorite    → fav:true   forked 0   rating → 4   cookedCount → 1   photos → 1
  lost ack + local rename + remote ♥ → name "Neu X2", fav:true (per-field merge, conflict logged)
  lost ack, local un-♥ (remote still ours) → fav:false · remote un-♥ (B) → fav:false
  ```
- **`ownWrite` with a pendingBase copy missing personal keys deletes remote values and causes a wrong merge:** refuted (E1).
  `pendingBase` is the merged recipe shape (`syncRules.js:95-98`), so keys match `local`. A stripped copy fails `sameContent`
  and falls back to the twin path, which keeps Drive plus local gaps — no loss.
- **#91 `fillPersonalGaps` lets a stale local ♥ beat a remote un-♥:** true in mechanics only when there is no base for the id
  (first sync / twin). Without a base an un-♥ cannot be told apart from "never set"; this is the documented TW-20 decision
  (e39acc6). Where both sides have a value, Drive wins (E1: remote rating 2 vs local 5 → 2). Not a defect.
- **`searchIngredients` throws on regex characters:** refuted (E1). `(`, `[`, `\`, `*`, `$`, `?`, space, `null` master,
  `{}` master, non-string query, `limit` Infinity/"3" → no throw, sane results. No UI caller yet.
- **#135 activate filter leaves old v2 caches behind:** refuted. Every historical `CACHE` name in `git log -p v2/sw.js`
  starts with `koch-v2`.
- **Nutrition goal leaks into sync/friends:** refuted (E2): only `settings.js` reads `GOAL_KEY`; pinned by test "Ziel bleibt lokal".

## Verified clean
- i18n: `settings.goal*` and `settings.goalPresets.<6 presets>` present in de/en/es/da (diff + test suite).
- `cleanGoal`: invalid preset → balanced, out-of-range/non-integer → null; values rendered through `esc()`/`.value`.
- SHELL contains the new `nutritionGoal.js`.

## Definition drift
The agent file still names `decideSync.js` as the recipe sync decision point; recipe sync runs through `syncCore.js` +
`syncRules.js` + `recipeMerge.js` (`decideSync` only as fallback without a base).

## Cross-lens notes
- → ux-curator: the goal form says "✓ Ziel gespeichert" even when an out-of-range kcal/protein (e.g. 7000) was silently
  dropped to empty (`settings.js:181-188` → `cleanGoal`). Consider a hint instead of a silent clear.

## Summary
P0 0 · P1 0 · P2 0 · P3 0 new. Still open: BH-02 (P3), BH-14 (P3), BH-18 (P3). BH-17 ✅ fixed by #130 (E1-verified).
**No new P0/P1.** Most valuable item this run: confirmation that the #130 lost-ack fix keeps another device's personal fields.
