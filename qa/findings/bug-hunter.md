# Bug-Hunter — findings (2026-11-25T12:00:00Z)
_Build 2026-11-21-v2.19 · CACHE koch-v2.19-1 · tests 689/689 · HEAD 7076063 · mode DELTA (origin/main..HEAD, branch release-bump/2.20: #74 #84 #90 #93 #106 #108 #111 #112 #113 #114)_

## Δ since origin/main
Changed under `v2/src`: `ai/parse.js`, `ai/prompts.js`, `data/items.js`, `data/moveFile.js` (new), `data/recipeImport.js`,
`data/recipeMerge.js`, `data/sync.js`, `data/syncRules.js`, `features/assistant/assistant.js`, `features/cookbook/{detail,filter,importFile}.js`,
`features/settings/{move.js (new),settings.js}`, `i18n.js`, plus `v2/data/ingredients.json` and the `sw.js` SHELL. The working tree is clean.
I hunted these files and their importers: `syncCore.js` → `recipeSync.merge`, `store.applySynced`, `listFile.sanitizeItem`, `listMerge.mergeList`,
`friendInbox`/`friendMerge` (seen), `lager.js`, `planner`, `gate.js`, `portions.js`, `usage.js`, and `match.js`.

New: **P2 1 · P3 1**. No P0, no P1.

## Field reports
FR-01 (Ingwer): no shopping-list code changed in this range (`features/shopping/*`, `listSync.js`, `friendInbox.js` and `derive.js` are untouched).
The only new path that touches the list is the move import (`moveFile.js:146-149`, `:227`). It merges by id through `mergeList` and keeps
`updated` and tombstones (`listFile.sanitizeItem:35-65`), so it cannot revive a deleted row or add a second copy (E2). The status stays as the
orchestrator set it: waiting for Marcel's device check.

## Status of previous findings
| ID | Title | Status | Note |
|---|---|---|---|
| BH-01 | Offline edit silently dropped by LWW | ✅ fixed | 9019e8c (v2.7), unchanged |
| BH-02 | Match "Nochmal" shows recipes you already matched | ⏳ still open | `features/match/match.js:120` still shuffles all `state.recipes`, while `:91` filters them. P3 · E2 · S |
| BH-03 | Pager / scaler stops running step timers | ✅ fixed | e9b2b9b (#64), unchanged |
| BH-04 … BH-11 | Shopping identity / merge / horizon | ✅ fixed | 41e5ea0 / 2eab1bb, unchanged |
| BH-12 | Whole-cookbook import doubles the base recipes | ✅ fixed | 2b27980, still holds |
| BH-13 | Import accepts any `version` | ✅ fixed | 6dd0c52, unchanged |
| BH-14 | Import sheet shows German reasons, and "–" for an empty file | ⏳ still open (narrowed) | The import sheet part is ✅ fixed by d9121b4 (#84). Problems are now structured codes, translated by `importFile.js:11-18`, and the `["–"]` is gone. I probed all 27 broken-field cases plus non-object entries, and each one maps to a field name. Still German: the assistant's `schemaFail` `{errors}` (`assistant.js:219`, `:262`) still shows raw `validateRecipe` text and `parse.js:146` "Unbekanntes Rezept: …". P3 · E2 · S |
| BH-15 | Export: no download fallback | ✅ fixed | 653dcb9, unchanged |
| BH-16 | Lost Drive write ack + later edit → recipe forked into a duplicate | ✅ fixed | 5245d94 / 044e162 / 57d83fa (#90): `recipeMerge.js:127-130` uses `pendingBase`. E1: lost ack + local edit → no fork, the edit wins. Lost ack + local delete → stays deleted. A fork remains only when Drive's copy differs in content from what we wrote, which is the documented choice. Side effect: see BH-17 |

## New findings

### BH-17 [P2] Lost Drive ack: a second device's ♥/rating/cooked/photo on the new recipe is dropped · confidence: high · evidence: E1
- **Where:** `v2/src/data/recipeMerge.js:127-130` (#90 branch) → `:133-136`. Called from `v2/src/data/syncRules.js:79-80`, `pendingBase` is set at `:95-98`.
- **What breaks:** Device A creates recipe X, syncs, and the Drive write lands but the response is lost (`pendingBase=[X]`, base without X). Before A syncs again, device B (same account, or a partner) pulls X and favourites it, rates it, marks it cooked or adds a photo, then pushes. On A's next sync, X comes back **without** B's personal fields. Drive is then overwritten, so the ♥/rating/cookedCount/photo reference is gone on all devices. The photo file stays orphaned on Drive.
- **Why:** When `sameContent(p, r)` holds, the branch sets `b = r`. `sameContent` ignores personal fields, so B's personal edit is treated as part of the base. Then `sameRecipe(r, b)` is true, the code takes "only local changed", and local wins with its old personal fields. Before #90 (`b` undefined), the same case went to `prefer` = `"remote"`, so B's edit survived. This is a regression from #90, but only inside the lost-ack window.
- **Proof:** probe `p3.mjs` (scratchpad), using the base = the first 3 snapshot recipes, local `[X, …]`, remote `[{…X, <field>}, …]` and `pendingBase [X]`:
  ```
  favorite   with#90: {}  without: {"favorite":true}
  rating     with#90: {}  without: {"rating":4}
  cookedCount with#90: {} without: {"cookedCount":1,"lastCooked":"2026-11-20"}
  photos     with#90: {}  without: {"photos":[{"id":"abcdefghijk","added":"2026-11-20"}]}
  ```
- **Fix:** In the #90 branch, take the base from what *we* wrote, not from Drive: `b = p` (the pending copy). Or use `r`'s content with `p`'s personal fields. Then B's personal edit shows up as a Drive change: either `r` wins, or it becomes a per-field merge with A's own edits.
- **Regression test:** `mergeRecipes #90: lost ack + other device sets favorite on the new recipe → favorite kept` (base `S`, local `[X,…S]`, remote `[{…X,favorite:true},…S]`, pendingBase `[X]` → merged X has `favorite:true`, no fork). Add the same for `photos`. Keep the existing "lost ack + local edit → local wins, no fork" green.
- **Effort:** S

### BH-18 [P3] After the move, your own shopping rows are labelled "from another device" · confidence: med · evidence: E2
- **Where:** `v2/src/data/moveFile.js:171-190` (ENTRIES, `deviceId` excluded on purpose, see `tests/test-move-file.js:48-49`) → `data/listSync.js:31-36` (the new address creates a new `deviceId`) → `features/shopping/logic.js:368` (`other: row.by !== device`) → `features/shopping/shopping.js:429` (label `shopping.origin.other`).
- **What breaks:** You export on the old address and import on the new one. Every row you added yourself carries the old address's `by` stamp (`d-…`). The new address has a different `deviceId`, so the list shows all of them as "from another device" until they are bought or deleted.
- **Why:** The `by` stamps move with the list, but the device identity they refer to does not. The file excludes `deviceId` as sync state.
- **Proof:** traced path above. The test fixture deliberately lists `deviceId: "d-123"` under "must not move".
- **Fix:** Either carry `deviceId` in the move file as a fill-only entry (never replace an existing one), or on import rewrite the old `by` to the new device id. This is a product choice for Marcel. It only matters until the list is cleared.
- **Regression test:** `moveFile: imported list rows of the exporting device are not "other" on the new address` (export with deviceId `d-old` and a row `by:"d-old"` → after import, `originOf(row,{device}).other === false`).
- **Effort:** S

## Checked and refuted
- **#90 `pendingBase` lists a partner's Drive-new recipes, so a later lost write deletes them:** refuted (E2). `syncRules.js:95-98` keeps only ids that are local and not on Drive. Fork copies (new ids) are excluded too.
- **A stale `pendingBase` misleads later syncs:** refuted (E1/E2). `setBase` clears it (`sync.js:73`) on every successful apply, including the `savedPending` path (`syncRules.js:102`). A failed write leaves it in place, but it only applies when Drive has the same content for that id (cases 3/4/6 of probe `p2.mjs`: local delete stays deleted, a local edit wins with no fork, a partner delete keeps X).
- **The move file drops real data because the checks don't match the real shapes:** refuted (E2). I checked each entry against its writer: pantry `{name,cat,on,custom}` (`lager/logic.js`), fridge `{name,menge,icon}` (`lager.js:225,90`), plan days `{day,recipeId,slot,leftoverOf,locked}` (`planner/logic.js:92-151`), owner token = 64 hex characters (`supabase.js:51-55`), invite = 32 hex characters (migration `p7_hardening.sql:41`), model/sort/lang/theme/shopSort are stored as plain strings, portions and usage as JSON.
- **The move import revives deleted rows or resets timestamps:** refuted (E2). `sanitizeItem` keeps `updated`/`deleted` (`listFile.js:47-48`), and `mergeList` is the same per-id merge that Drive sync uses.
- **The move import into an existing list drops `friendSeen`, so friend items get applied again:** refuted as a defect. `writeValues` (`moveFile.js:227`) does replace the row without `friendSeen`. But `friendMerge.js:76` falls back to the kv `seen` mirror, which `friendInbox.js:99` keeps in sync after every pull, and `fl_ack` empties the server inbox. Re-application needs a lost ack *and* a move at the same moment.
- **The export's "sync first" step reports success after a failed sync:** refuted. A failed `engine.sync` returns no `meta` (`syncCore.js:122-126`), so `state.meta.dirty` stays true and `move.js:78` shows `syncFailed`.
- **The assistant can delete a base recipe, or one that is gone or was swapped:** refuted (E2). `coerceDelete` (`parse.js`) requires `isUserRecipe` and is checked twice: when the card is rendered and again on the click against the current `getRecipeDe` (`assistant.js:298-304`). A second card for the same recipe gives an "unknown" alert, not a crash. Chat HTML is cached, so a repaint keeps the "✓ Gelöscht" state (`assistant.js:149`).
- **The `relinkItems` #112 guard throws away hand-made multi-item corrections:** true in mechanics (E1: two items for one line → one re-derived item, `items.js:37`), but not a defect. SCHEMA.md says `items` is app-managed ("Claude NICHT schreiben"), and nothing in the app produces such corrections. → architect: the doc comment at `items.js:11` ("manuelle Korrekturen überleben") now overstates what the code does.
- **`coerceUpdate` (#113) can no longer clear the tips:** intended (the #113 decision, pinned by TW-27). Not a bug.
- **"sept" collides with another language's month word:** refuted. ES/DA use full words, and `sept` maps only to 9.
- **Import problems with no field name (empty `fields[]`):** refuted (E1). All 27 field-breaking cases map to their field. `items` alone is dropped and the recipe kept, as designed. Non-object entries → `recipeNotObject`.

## Verified clean
- i18n: 198 literal and dynamic-family keys in the changed UI files resolve in de/en/es/da (E1). The only misses are dynamic prefixes (`settings.move.err.`, `.section.`, `importFile.problem.`, `assistant.deleteRefused.`, `settings.instrVar.`). Every concrete code of those families resolves.
- #84 import sheet: the empty file → its own sheet. An all-invalid file → `invalid` plus translated reasons, all through `esc()`.
- #111 `cleanItems`: only lines that exist in the file, string length limits, no `<>` in `ing`, at most `lines` entries. Nothing is mutated.
- #108 move: the secrets (`kochv2_apikey`, token, connected, `koch.supabase`) are never collected (allow-list only). `parseMoveFile` re-checks every entry. Conflicts are only replaced after the user agrees.

## Definition drift
The agent file still names `decideSync.js` as the recipe sync decision point. Recipe sync runs through `syncCore.js` + `syncRules.js` + `recipeMerge.js` (`decideSync` is only the fallback without a base).

## Cross-lens notes
- → test-warden: no test covers BH-17 (lost ack + the other device's personal-field edit). Add the regression test named above.
- → architect: `items.js:11` doc comment vs the #112 guard (see Checked and refuted).
- → ux-curator: BH-18 is a labelling issue after the move. Decide whether `deviceId` should travel with the move file.

## Summary
P0 0 · P1 0 · P2 1 · P3 1 new. Still open: BH-02 (P3), BH-14 (P3, narrowed to the assistant's schemaFail text). BH-16 ✅ fixed by #90.
**No new P0/P1.** The most valuable item is BH-17: the #90 lost-ack fix takes Drive's copy as the base, so in that window it drops another device's ♥/rating/cooked/photo on the new recipe. The fix is one line and was E1-reproduced.
