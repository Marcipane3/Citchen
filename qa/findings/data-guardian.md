# Data-Guardian — findings (2026-11-28T00:00Z)
_Build 2026-11-21-v2.19 (branch `release-bump/2.20-r2` = origin/next; the bump is not in the tree yet) · CACHE koch-v2.19-1 · tests 718/718 · HEAD e39acc6 · mode DELTA (`origin/main..HEAD`; new since the last guard pass ab4e6a1: #130/DG-22, #91, #135, #138, #139, #140, #141)_

How I tested: I wrote node probes in the session scratchpad, outside the repo. They imported the real `recipeMerge.js` and `schema.js`. I ran them against `v2/data/rezepte.snapshot.json` (105 recipes). Nothing called Drive, Supabase or Anthropic. I wrote no repo file except this report.

## Delta in my lens (since ab4e6a1)
- **#130 (DG-22 fix)** `recipeMerge.js:83-90` `ownWrite(p, r)`, used at `:151`. `pendingBase` is now read as stored, without `withDefaults` (`:142`).
- **#91** `recipeMerge.js:106-114` `fillPersonalGaps(r, l)`, used at `:156`. This is a twin with the same content and no base entry. Drive wins, but a personal field that is empty on Drive takes the local value.
- **#138** `data/nutritionGoal.js` and `settings.js:39-53`. This is device-only kv `nutritionGoal`, cleaned by `cleanGoal`. It never reaches `rezepte.json`, the list or the inbox.
- **#139** `ingredientMatch.js` `searchIngredients`/`forms`. It is pure and read-only over the master.
- **#135** `sw.js`/`v2/sw.js`: the cache cleanup is now limited by prefix. No storage names changed, and IndexedDB is untouched.
- `SCHEMA.md`: the only change since main is the move-file section, already reviewed last pass.

## Field reports
FR-01 has not changed since the last pass. Nothing in this delta touches the list merge or the friend inbox. DG-23 (P3, still open) is the only remaining ghost-item path, and it needs a device that was offline for more than 30 days plus a move export.

## Status of previous findings
| ID | Title | Status | Note |
|----|-------|--------|------|
| DG-01…DG-19 | (see earlier reports) | ✅ fixed | Code paths unchanged. |
| DG-20 | Import writes unchecked `items` sub-fields (unknown keys, non-strings, markup in `prep`/`group`/`unit`) | ⏳ still open, P3 | `recipeImport.js` is unchanged since the last pass. Nothing renders these fields raw today. |
| DG-22 | #90 lost-ack fix overwrote another device's personal fields | ✅ fixed | 4e1913b (#136), `recipeMerge.js:83-90,151`. E1 below: the partner's ♥, rating, photos, cookedCount and lastCooked all survive. A delete after a lost reply still sticks, and "write never arrived" is unchanged. |
| DG-23 | Move import drops `listMeta.syncedFile`, so the T7 prune horizon is skipped once | ⏳ still open, P3 | `moveFile.js` is unchanged (`shoppingLink` `:104-111`, `writeValues` `:225`). |

## New findings

### DG-24 [P3] #91 twin merge treats `lastCooked: ""` on Drive as a value, so the local date is lost · confidence: high · evidence: E1
- **Asset at risk:** `rezepte.json`, the personal field `lastCooked`. It only feeds the "Zuletzt gekocht" sort and the detail line.
- **Where:** `v2/src/data/recipeMerge.js:110`. The empty check compares against `withDefaults({})`, but `withDefaults` (`schema.js:170-179`) gives `lastCooked` no default. So `""`, which every new recipe carries (`store.js:149`), counts as "Drive has a value".
- **How it corrupts:** a twin with the same content (same id, no base entry) has Drive `lastCooked:""` and local `lastCooked:"2026-11-01"`. Drive's `""` wins, while `cookedCount:3` from the same device is kept. The result is inconsistent: the recipe was cooked 3 times but never "last cooked".
- **Proof (E1):** `twin lastCooked "" 3`
- **Guard:** treat `""` as empty for `lastCooked` in `fillPersonalGaps`, or give `lastCooked` a `""` default in the comparison. Test: a twin with Drive `lastCooked:""` and a local date keeps the date. Effort S.

No new P0, no new P1.

## Checked and refuted
- **`ownWrite` loses a partner's personal edit when the stored pending copy has defaults and the local copy is raw** (E1 `c7`): this only happens with a constructed fixture where `l` and `p` differ in shape. In real use `p` is the same `merged` entry that became `l`, because new recipes go through `withDefaults` (`store.js:149`). With consistent shapes (`d1`–`d3`) all partner fields survive. `#90` is not released yet, so no legacy `pendingBase` from an older shape exists on devices.
- **The partner un-♥s a recipe we wrote with ♥, and the old ♥ comes back** (E1 `c3`): refuted. The result is `favorite:false, rating:0`, so the partner's change wins.
- **Both devices change personal fields after a lost reply** (E1 `c2`, `d3`): the merge goes field by field and both edits survive (`favorite:true, rating:2`). A local content edit plus a partner ♥ also both survive (`c2b`, `d2`).
- **A partner content edit after a lost reply is lost:** no. It forks (`c6`), so the result is a duplicate, not a loss. The behaviour is the same as the last pass.
- **`fillPersonalGaps` resurrects a value that Drive deliberately cleared:** this only applies when the base does not know the id. Then nobody "cleared" anything that we knew about, and the case is a twin. It converges in one round (E1 `t1 converge true`).
- **The #138 nutrition goal leaks into synced data:** refuted. It is only kv `nutritionGoal` (`settings.js:39-53`), and the move file's `ENTRIES` does not carry it. `cleanGoal` bounds every input.
- **#135 cache-prefix cleanup affects IndexedDB or localStorage:** no. It only touches `caches.keys()`.

## Invariants verified clean
- Round-trip fixed point: the snapshot gives 105 recipes and 0 `inspectRemote` notes. `withDefaults(raw)` is identical to the inspected copy for 105/105, and base=local=remote merges to the same collection (E1).
- Canonical German: no new persist path in this delta. `ownWrite` and `fillPersonalGaps` only see `local` from IndexedDB (`recipesDe`) and remote from Drive.
- Lost-ack matrix (E1): partner personal edit kept (`c1`, `d1`); delete after a lost reply sticks (`c4`); a write that never arrived keeps the recipe (`c5`).
- `version` stays 3, and no format change reaches `rezepte.json`.

## Definition drift
- Agent file: it names `decideSync.js` as the engine and a repo-root `rezepte.json`. In fact the engine is `syncCore`, `syncRules` and `recipeMerge`, and the in-repo copy is `v2/data/rezepte.snapshot.json`. `PERSONAL_FIELDS` also includes `lastCooked`, which the agent file does not list.

## Cross-lens notes
- → test-warden: no test covers the `lastCooked:""` twin case (DG-24). The DG-23 move import plus T7 horizon case is still untested.
- → bug-hunter (carried): `removeRecipe` deletes the Drive photos before `deleteRecipe`.

## Summary
- P0: 0 · P1: 0.
- DG-22 is fixed (E1).
- P3: DG-24 is new. DG-20 and DG-23 are still open.
- Most valuable item: DG-23, the narrow ghost-item path, if the move export ships before the address switch.

## Verdict
**Trustworthy for v2.20:** the DG-22 regression is fixed and proven, round trips are exact, and canonical German holds. Only P3 edge cases remain.
