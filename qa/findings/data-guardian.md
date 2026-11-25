# Data-Guardian — findings (2026-11-25T00:00Z)
_Build 2026-11-21-v2.19 (branch `release-bump/2.20`, the bump is not in the tree yet) · CACHE koch-v2.19-1 · tests 689/689 · HEAD 7076063 · mode DELTA (`origin/main..HEAD`: #74, #84, #90, #93, #106, #108, #111, #112, #113, #114)_

How I tested: I wrote node probes in the session scratchpad, outside the repo. They imported the real pure modules: `recipeMerge`, `recipeImport`, `items`, `ingredientMatch`, `moveFile`, `listMerge`. I ran them against `v2/data/rezepte.snapshot.json` (105 recipes) and `v2/data/ingredients.json`. To test one suggested guard, I also ran a patched **scratch copy** of `recipeMerge.js`. Nothing called Drive, Supabase or Anthropic. I wrote no repo file except this report.

## Delta in my lens
- **#90 `pendingBase`**: `recipeMerge.js:118-130`, `syncRules.js:79-98`, `sync.js:18,71-73`. Before the Drive write, the sync stores the merged recipes that came from this device and are not on Drive yet. If Drive's reply is lost (the "ack"), the next merge uses that list as the base for those ids.
- **#108 move file**: `data/moveFile.js` (new) and `features/settings/move.js` (new). It writes to IndexedDB kv, the `lists` and `plans` stores, and localStorage. It does **not** touch recipes.
- **#111** `cleanItems` on import (`recipeImport.js:43-58`). **#84** structured import errors. **#112** `relinkItems` re-derives when one of two duplicate lines is removed (`items.js:36-38`). **#113** empty tips from the model no longer wipe stored tips (`parse.js:154`). **#74** the assistant can delete a recipe (`parse.js:248-254`, `assistant.js` `deleteFromCard`, `detail.js` `removeRecipe`).
- `SCHEMA.md` has a new section on the move file (`:265-287`).

## Field reports
FR-01 is fixed in code and waits for Marcel's device check. The only delta that touches the list is the move import. DG-23 is a narrow ghost-item path of the FR-01 type: an item comes back, but only after a device was offline for more than 30 days. It does not reopen FR-01.

## Status of previous findings
| ID | Title | Status | Note |
|----|-------|--------|------|
| DG-01…DG-19 | (see earlier reports) | ✅ fixed | Code paths unchanged, or re-checked below. |
| DG-20 | Import writes unbounded, unchecked `items` | ⏳ partly fixed, now **P3** | #111 (`recipeImport.js:43-58`) caps items at 200, drops items whose line is not in the recipe, and rejects `<>` in `ing`. Still let through (E1): unknown keys (`evil:{deep:{…}}`), values that are not strings (`unit:5`), and markup in `prep`, `group` and `unit` (`prep:"<img onerror=…>"` kept, 0 errors). 200 items are still kept on a 2-line recipe. All of it is stored as-is in `rezepte.json`. SCHEMA `:94` lists an allowed key set, but import does not enforce it. Nothing renders these fields today. |
| DG-21 | `relinkItems` keeps doubled items after a duplicate line is removed | ✅ fixed | `items.js:36-38` (#112, d46527d). E1: `["1 Zwiebel","1 Zwiebel","Salz"]` minus one line gives 2 items `['1 Zwiebel','Salz']`. A two-in-one line (`Salz und Pfeffer`, 2 items) on 2 duplicate lines still gives 4 items. |

## New findings

### DG-22 [P1] #90 lost-ack fix silently overwrites another device's rating/favorite/photos/cookedCount on a new recipe · confidence: high (mechanism), med (frequency) · evidence: E1
- **Asset at risk:** `rezepte.json`, the personal fields of a recipe (`photos`, `rating`, `favorite`, `cookedCount`, `feedback`), across devices. This is a **regression introduced in this delta**. Before #90 the same sequence kept those fields.
- **Where:** `v2/src/data/recipeMerge.js:129`. When the pending copy matches Drive by content, the code sets `b = r`, so the **Drive copy** becomes the base instead of the copy this device wrote. After that, `:136` (`if (sameRecipe(r, b)) return l;`) always returns the local copy.
- **How it corrupts:**
  1. On device A (the phone), the user creates recipe X and the sync writes it to Drive. The write lands, but the reply is lost: the app was backgrounded or killed mid-request, or the network dropped. `pendingBase = [X]`, and the base does not contain X.
  2. Device B (the tablet) syncs and gets X. The user cooks it, rates it 5, marks it ♥ and adds a photo. B writes this to Drive.
  3. Device A syncs again. `sameContent(p, r)` is true, because personal fields do not count as content, so `b = r`. Then `l ≠ r` and `r == b`, so A's copy without rating, ♥ or photo wins. It is written to Drive and then reaches B.
  4. Nothing is reported: `conflicts: []`, nothing is forked, and nothing is logged. Only B's single T2 backup slot still holds the old state, until B's next sync that changes something.
  5. The same happens when A edited X's content after the lost reply. Before #90 that case forked, so both copies survived. Now B's personal fields are dropped.
- **Proof** (E1, the real module, base `[r1]`, local `[X, r1]`, remote `[X+{rating:5,favorite:true,cookedCount:2}, r1]`, `pendingBase:[X]`):
  ```
  case1 partner personal edit: {"id":"rX",...,"steps":["kochen"]} conflicts []                       ← rating/favorite/cookedCount gone
  case1 pre-#90 (no pending):  {"id":"rX",...,"rating":5,"favorite":true,"cookedCount":2}             ← kept
  case2 both personal (local rating 3, remote favorite): {..."rating":3} []                          ← remote ♥ lost, no conflict
  ```
  - Test gap: `test-recipe-merge.js` "#90: lost ack, Drive = pendingBase, lokal geändert, Drive-Rezept bekommt Felder → pro Feld" never gives the Drive copy a field that only exists there. It only checks the local `time`.
- **Guard** (do not apply): use the stored pending copy as the base: `b = p`. Keep the raw `pendingBase` entries, without `withDefaults`. `sameContent` already applies the defaults itself.
  - E1 on a patched scratch copy: case 1 keeps `rating:5, favorite, cookedCount:2`. Case 2 is reported as a conflict and merged field by field (`favorite:true, rating:3`). Case 4 (deleted locally after the lost reply) still deletes. Case 5 (the write never arrived) is unchanged.
  - Test: lost reply, then Drive gains `rating`, `favorite` and `photos` on X while local is untouched → merged X keeps them. A second test: local edits content and Drive edits personal fields → both survive.
  - Effort S.

### DG-23 [P3] Move import drops `listMeta.syncedFile`, so the first list sync on the new address skips the T7 prune horizon · confidence: high · evidence: E1
- **Asset at risk:** `einkaufsliste.json` (no ghost items).
- **Where:** `v2/src/data/moveFile.js:104-111`. `shoppingLink` keeps only `{fileId, ownFileId, linked}`, and `writeValues` (`:225`) replaces `listMeta` with that. `syncRules.js:169` turns the horizon on only when `meta.syncedFile === meta.fileId`.
- **How it corrupts:** this needs the old address to have gone more than 30 days without a list sync when the move file is exported. Then an item deleted on Drive whose tombstone has since been pruned is still live in the file. The new address imports it, and its first list sync runs with `horizon ""`, so the item comes back on Drive and on the partner's list. The old address itself would drop it, because `syncedFile` matches there.
- **Proof** (E1): `listMeta written: {"fileId":…,"ownFileId":…,"linked":false}`, then `horizon used: "" -> Ingwer alive after first sync: true`. With the old address's horizon: `false`.
- **Guard:** carry `syncedFile` in `shoppingLink` when it equals `fileId`, or sync the list before export the same way recipes do. Test: a moved stale item older than `prunedBefore` does not come back. Effort S.

No new P0. **One new P1 (DG-22, a regression in this release branch).**

## Checked and refuted
- **#90 deletes a partner recipe after a lost reply:** refuted. `pendingBase` holds only ids that came from this device and are missing on Drive (`syncRules.js:96-97`). E1 cases 4 and 5: a delete after the lost reply sticks, and a stale pending entry brings nothing back. The new `test-sync-core` cases (partner, fork, delete) pass.
- **Stale `pendingBase` leaks into later syncs:** refuted. `setBase` always clears it (`sync.js:73`), including on the `savedPending` path (`syncRules.js:102`). It only takes effect for ids that are not in the base and whose Drive copy matches by content.
- **Two lost replies in a row fork the recipe** (E1 case 3: `forked rX`): this is real, but it is a duplicate, not a loss, and it needs two lost replies in a row. Not filed.
- **Move file carries recipes or translated data:** refuted. `ENTRIES` has no recipe source, and the move feature never calls `getRecipes*`, `saveCollection` or Drive. If the app is not connected to Drive, the user is warned in all four languages (`i18n.js:388`).
- **Move import resurrects deleted list items in normal use:** refuted. `mergeList` is last-writer-wins: a newer tombstone on the new address beats an older live item from the file (E1: `unchanged: ["shoppingList"]`). Only DG-23 (stale for more than 30 days) slips through.
- **Move import drops `friendSeen` from the `lists` row** (`moveFile.js:227` writes `{id, items, updated}`): true, but `applyFriendSuggestions` falls back to `friendInbox.seen`, which is carried and mirrored after every pull (`friendInbox.js:94-99`). Friend item ids are tied to their suggestion, so a replay merges by id. Not filed.
- **Hostile move file:** `""`, `{}`, missing `data`, `version` 2 or 1.5 are rejected with a code. A `shoppingList` that is not an array is dropped on its own. Export → parse is an exact round trip (E1). Markup in list names is kept as data, the same as from Drive (rendering is `esc()`'s job).
- **#74 assistant delete hits a built-in recipe or a translated view:** refuted. The card and the click both re-check `getRecipeDe` plus `isUserRecipe` (`assistant.js` `renderDelete`/`deleteFromCard`), followed by the same `confirm` and `deleteRecipe` as the detail view.
- **#113 `tips: !!content.tips`** loses a legitimate edit: no. An empty value keeps the stored tips. Only "clear the tips via the assistant" stops working, which is not data loss.
- **#84 structured errors change what gets imported:** no. Only the error format changed. The accept and reject decisions are the same as in the previous run.

## Invariants verified clean
- Round-trip fixed point: the snapshot gives 105 recipes, `inspectRemote` gives 0 notes, and the result is byte-identical. `withItems` is idempotent on 105/105 and does not mutate its input.
- Canonical German: the new write paths (`setPendingBase` ← merged collection from IndexedDB, assistant delete ← `getRecipeDe`, the move feature ← no recipes) never see `state.recipes`.
- `version` stays 3, and no format change reaches `rezepte.json`.
- The move file is checked before anything is written, and it never overwrites existing data without asking (except the lossless list and usage merges).

## Definition drift
- Agent file: it names `decideSync.js` as the engine and a repo-root `rezepte.json`. In fact the engine is `syncCore`, `syncRules` and `recipeMerge`, and the in-repo copy is `v2/data/rezepte.snapshot.json`. Also, `SCHEMA.md` says a move file whose "version keine Zahl" is rejected. The code also rejects any version that is not an integer, such as 1.5 (`moveFile.js:260`). This is harmless.

## Cross-lens notes
- → test-warden: the #90 test named "Drive-Rezept bekommt Felder → pro Feld" does not test what its name says (DG-22). No test covers the move import plus the T7 horizon (DG-23).
- → bug-hunter: `removeRecipe` deletes the Drive photos (fire-and-forget) **before** `deleteRecipe`. If the delete throws, the recipe stays with dead photo references. This is older code that now has a second caller (#74).

## Summary
P0: 0 · P1: 1 new (DG-22) · P2: 0 · P3: 1 new (DG-23) plus DG-20 downgraded to P3 (still open) · DG-21 fixed. Most valuable item: **DG-22**. Change one line (`b = p`) and add a test before v2.20 ships.

## Verdict
**Not quite trustworthy for v2.20 as branched:** round trips are exact, canonical German holds, and the move file is safe. But the #90 fix brings back silent loss of personal fields after a lost Drive reply (DG-22). It is a small, contained fix.
