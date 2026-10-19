# Test-Warden — findings (2026-10-12T16:30:00Z)
_Build 2026-10-04-v2.14 · CACHE koch-v2.14-1 · tests 215/215 · HEAD 70e8b9d · mode FULL_

Suite is green (215 passed, 0 failed). `v2/` has no uncommitted changes (the dirty tree is agents/roadmap/docs plus an untracked root `rezepte.json`). The suite is strong on the pure shopping/sync primitives, but it **tests each primitive in isolation and never the cross-path invariant that FR-01 violates: "one real-world ingredient = one open list row"**. Every FR-01 probe below was executed (E1) against the current modules and the real root `rezepte.json`.

## Field reports

### FR-01 — "Ingwer" appears randomly and multiple times (probe: `%TEMP%/tw/probe.mjs`, E1)
The suite cannot catch this today: no test feeds real `rezepte.json` lines through `aggregateIngredients → mergeItems → shopAdd/applyFriendItems → mergeList` and asserts a single row.

Root-cause hypotheses, ranked (all pure-logic, all reproduced):

1. **H1 · Key fragmentation (E1, confidence high).** `aggregateIngredients` over the 7 recipes that mention Ingwer returns three differently keyed rows:
   `Ingwer, gerieben|Stück` (1), `Ingwer|Stück` (amount **5**), and a bogus row `gemahlene Nelken , 1 TL Ingwerpulver|TL` (recipe line `"½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"` is two ingredients in one string). Also `2 cm Ingwer`→`cm ingwer|` (unit not recognised, `cm` leaks into the name), `1 Daumen Ingwer`→`daumen ingwer|`, `Ingwer 🛒`→`ingwer|`, `1 TL Ingwer, frisch gerieben`→`ingwer, frisch gerieben|tl`, `1 Stück Ingwer (ca. 3 cm)`→`ingwer (ca. 3 cm)|stück`. Catalog tile / friend suggestion key is `ingwer|` (unit null) so they never merge with the recipe rows (`mergeItems` of a catalog row then a recipe row → two rows; `applyFriendItems` with an existing `Ingwer|Stück` row → second row `fr-f1`). Since every Ingwer recipe line carries 🛒, any plan→list or recipe→list pulls it in — this is the "randomly, without selecting it" feel (implicit via plan) and "multiple times" (several rows plus 5 Stück).
2. **H2 · `mergeItems` revives the wrong row (E1, high).** `existing=[tombstone a, live b]` (same key) + incoming → `out.find` returns the tombstone first, revives it, leaves `b` live → **2 live duplicate rows** (probe P3). `shopAdd` deliberately prefers the live row (`shopping.js:76`); `mergeItems` (`logic.js:123`) does not. Reachable after any two-device delete+re-add merge (tombstone and a live row with the same key coexist because ids differ).
3. **H3 · `applyFriendItems` duplicate id (E1, high, needs `seen` loss/trim).** Replaying friend id `f9` after its item `fr-f9` was deleted pushes a second element with the same id `fr-f9` (probe P8/P9: `[[fr-f9,true],[fr-f9,false]]`) — `same` skips tombstones (`friendMerge.js:281`) and the new id is not checked against existing ids. Also: `trimSeen` at 300 then a re-delivered old id → `added 1` (probe P7). Server re-delivery after 300 later suggestions is unlikely, but the missing id-guard makes any `seen` loss (inbox re-enable, `fl_ack` failure after a cleared IndexedDB kv) re-add the item.
4. **H4 · Tombstone prune resurrects a deleted item (E1, medium).** `syncStep([live x, updated 2026-08-01], [] , now)` → `merged=[x live]`, `writeRemote:true` (probe P5b). If Drive's tombstone was already pruned (>30 d, `listMerge.js:214`) by device A, a stale device B pushes the old live "Ingwer" back. Needs a device unused for >30 days.
5. **H5 · UI tap-target drift (E3, low, not unit-testable).** `paintList` grows above the catalog grid on every tap, shifting tiles under the finger. Confirm on device with the steps in FR-01; not a pure-logic test.

How to confirm on device: open the list, read each "Ingwer" row's label (`1 Stück Ingwer, gerieben` vs `5 Stück Ingwer` vs `Ingwer`) — different labels ⇒ H1; identical labels ⇒ H2/H3; appearance weeks after deleting with a long-idle second device ⇒ H4.

### Regression tests that pin FR-01 (propose; none exist)
Put them in a new `tests/test-shopping-identity.js`, with a tiny fixture of the real Ingwer lines (copy the 7 lines above verbatim, do not read `rezepte.json` from the suite).

- `FR01.oneRowPerIngredient`: aggregate recipes [`1 Stück Ingwer, gerieben 🛒`, `1 Stück Ingwer 🛒` ×5] → expect exactly **1** Ingwer row, `amount 6`, `unit Stück`. (Today 2 rows; needs a canonical name = strip after `,`/`(` qualifier, a `canonicalItem()` helper used by `itemKey`.)
- `FR01.catalogTileMergesWithRecipeRow`: list holds `{name "Ingwer", unit "Stück", amount 1}`; `shopAdd("Ingwer")`-equivalent merge → expect 1 row, qty/amount incremented. Extract `shopAdd`'s match+bump into a pure `addByName(items, name, …)` in `shopping/logic.js` first (it is DOM-adjacent module state now), then test it.
- `FR01.recipeThenCatalogThenFriend`: recipe row, catalog tap, friend "Ingwer" → expect 1 open row (sum/qty 3), 0 new `fr-` rows.
- `FR01.unitVariants`: `2 cm Ingwer 🛒`, `1 Daumen Ingwer 🛒`, `Ingwer 🛒`, `1 TL Ingwer, frisch gerieben 🛒`, `1 Stück Ingwer (ca. 3 cm) 🛒` → each yields `item === "Ingwer"` (no `cm`/`Daumen` in the name) and all five aggregate into ≤ 2 rows (count vs. TL unit).
- `FR01.twoIngredientsInOneLine`: `½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒` → expect two parsed items (`Nelken`, `Ingwerpulver`), never one item containing `, 1 TL`. (Alternatively a data-guardian rule; either way a guard test belongs here.)
- `FR01.mergeItems.tombstoneBeforeLive`: existing `[{id a, deleted:true, key K}, {id b, live, key K}]` + incoming K → expect exactly one live row, id `b`, `a` stays deleted.
- `FR01.mergeItems.idempotentRepeat`: apply the same recipe aggregate twice → live row count unchanged (amount doubles, rows not).
- `FR01.friend.replayAfterDelete`: `applyFriendItems(deletedFrItems, [{id same}], {seen: []})` → expect no duplicate id in output (revive the tombstone instead, or skip), `new Set(ids).size === ids.length`.
- `FR01.friend.seenTrimBoundary`: 301 ids → `trimSeen` → 300 kept (oldest dropped); then replay of the dropped id on a list with its tombstone → expect no second row. Pins the boundary documented in `trimSeen`.
- `FR01.invariant.noDuplicateIds`: property-style — run a fixed sequence (aggregate, mergeItems, applyFriendItems, mergeList with a second device, syncStep) and assert `ids unique` and `no two live rows share (canonical name, unit)` after each step. This is the one test that would have caught the whole FR-01 class.
- `FR01.sync.staleDeviceResurrection`: local live `x` (updated 40 d ago), remote `[]` (tombstone already pruned) → today live comes back; expect a decision recorded. Options: keep tombstones ≥ 90 d, or a `lastSync` guard (items older than the device's last sync that are absent remotely are treated as deleted). Test the chosen rule.
- `FR01.sync.sameKeyDifferentIdMerge`: two devices add "Ingwer" independently (`li-A`, `li-B`, different ids) → after `syncStep` expect 1 live row (merge by canonical key) — today 2 (probe P4); this encodes the missing key-level dedupe in `mergeList`.

## Status of previous findings (2026-06-14 report, 145 tests; no IDs then — assigned now)

| ID | Title | Status | Note |
|---|---|---|---|
| TW-01 | `data/sync.js` LWW/dirty decision branches untested | ✅ fixed | Decision extracted to `data/decideSync.js` (K2) with 9 cases in `tests/test-decide-sync.js` (create/pull/noop/push/conflict, empty marks, defaults). |
| TW-02 | `sync.localDirtyButRemoteNewer` silently overwrites local edit | ✅ fixed | Now `conflict`, local kept (`decideSync.js:371`, `sync.js:114-121`), pinned by `decideSync: dirty, aber Remote ist NEUER → conflict`. |
| TW-03 | `i2.decidePure.*` seam + equalDriveSource/equalNonDriveSource | ✅ fixed | Covered in `test-decide-sync.js`. |
| TW-04 | `i2.twoWriterConverge`, tombstone propagation, CR-02 idempotency | ✅ fixed | `test-list-sync.js` (CR-01, CR-02, concurrent adds, touch) via `syncStep`/`mergeList`. |
| TW-05 | `sync.js` async I/O (`syncWithDrive`, `saveCollection`, `loadLocal`) never run against fakes (`save.pushFailsRemainsDirty`, `driveThrows401/offline`, `load.snapshotUnreachable`) | ⏳ still open, downgraded high→med | Decision is pure and tested; the I/O shell (`sync.js:41-170`, 6 exports, none referenced by tests) is not. `listSync.js` (13 exports) has the same shape. |
| TW-06 | `i2.offlineQueuePerObject`, `i2.separateFileIds` | ⏳ still open (med) | `listSync.doSync` never uses `decideSync`; it uses `syncStep`. No test proves the list sync never touches the recipe fileId/`META_KEY "collection"`. |
| TW-07 | `toFileString` without injected `now` | ⏳ still open (low) | `test-migrate.js` only tests the injected clock path (`migrate.js:45-54`). |
| TW-08 | `extractJson` adversarial (unbalanced, brace in string, array root) | ⏳ still open (low) | Probe now: `'{"a":1'`→`null`, `'[1,2,3]'`→`null`, brace-in-string OK (E1) — behaviour is right, still not pinned by a test (`test-ai.js:57-62` has the nested-brace case only). |

## New findings

### TW-09 `features/shopping/logic.js` + `listMerge.js` + `friendMerge.js` — item identity · risk: high · evidence: E1
- **Covered today:** `test-shopping.js` (aggregation sums same name+unit, unit-different stays separate — asserted *as intended*), `test-list-merge.js`, `test-list-sync.js` (id-based LWW, tombstones, prune), `test-friends.js` (qty+1 on exact key, seen replay, tombstone not counted).
- **Gap:** no test asserts cross-path identity. The suite *encodes* the fragmented keys (`unterschiedliche Einheiten bleiben getrennt`) with no counter-case for qualifier/spelling/unit-null variants, and `mergeList` never dedupes by key. This is the direct cause class of FR-01 (H1–H4).
- **Proposed cases:** see "Regression tests that pin FR-01" above (`FR01.*`).
- **Guards against:** FR-01.

### TW-10 `features/shopping/logic.js` `mergeItems` — first-hit wins · risk: high · evidence: E1
- **Covered today:** `test-list-sync.js:96` (revives tombstone, same id), `test-shopping.js:96` (sum/qty/done).
- **Gap:** `out.find(keyOf===key)` (`logic.js:123`) picks the first matching row, tombstone or not; test only has a single matching row.
- **Proposed cases:** `mergeItems.tombstoneBeforeLive`, `mergeItems.liveBeforeTombstone` (live preferred, tombstone untouched), `mergeItems.twoLiveSameKey` (one gets bumped, other unchanged — pin which).
- **Guards against:** FR-01 (H2).

### TW-11 `features/shopping/friendMerge.js` `applyFriendItems` — id uniqueness · risk: med · evidence: E1
- **Covered today:** `test-friends.js:34` (seen blocks replay), `:43` (tombstone not incremented).
- **Gap:** replay without `seen` after deletion yields duplicate id `fr-<id>` (probe P8); re-delivery after `trimSeen` 300 boundary adds again (P7); friend name vs unit-bearing recipe row creates a second row (P6).
- **Proposed cases:** `friend.replayAfterDelete`, `friend.seenTrimBoundary`, `friend.vsUnitRow` (see FR01 list), plus `friend.sameBatchTwiceSameName` (two ids, same name → one row qty 2, both ids in `seen`).
- **Guards against:** FR-01 (H3).

### TW-12 `features/shopping/listMerge.js` `pruneTombstones` / `syncStep` — stale-device resurrection · risk: med · evidence: E1
- **Covered today:** `test-list-sync.js:81` (prune only old tombstones).
- **Gap:** no test of "tombstone pruned remotely, stale live copy returns" (probe P5b: `merged=[x live]`, `writeRemote true`).
- **Proposed cases:** `FR01.sync.staleDeviceResurrection` (see above); `syncStep.tieSameUpdatedPrefersLocal` pin (`mergeList` strict `>`, equal stamps keep local — document it); `syncStep.duplicateIdsInInput` (two entries same id in `local` → exactly one in output).
- **Guards against:** FR-01 (H4).

### TW-13 `data/derive.js` `parseIngredient` — real-data lines · risk: med · evidence: E1
- **Covered today:** `test-derive.js` units/fractions/ranges/groups/🛒/optional.
- **Gap:** no real-`rezepte.json` lines: `cm`/`Daumen` units not recognised; comma-joined two-ingredient line yields one item with `, 1 TL …` in the name (probe: `item 'gemahlene Nelken , 1 TL Ingwerpulver'`).
- **Proposed cases:** `FR01.unitVariants`, `FR01.twoIngredientsInOneLine`; plus a **data-driven smoke test**: for every line in a fixture copy of `rezepte.json` ingredients, assert `item` contains no `🛒` and no `/,\s*\d/` (comma followed by a quantity). Cheap, catches the next bad line the user captures.
- **Guards against:** FR-01 (H1).

### TW-14 `data/listSync.js` / `data/friendInbox.js` — I/O shells untested · risk: med · evidence: E2
- **Covered today:** their pure cores (`syncStep`, `applyFriendItems`, `trimSeen`, `snapshotOf`); no export of `listSync` (13) or `friendInbox` (11) is referenced by any test.
- **Gap:** ordering invariant `applyExternal → patchInbox(seen) → fl_ack` (`friendInbox.js:93-100`) and the debounce/inflight sharing are untested; injecting `db`, `drive`, `rpc` fakes needs a seam (pass the modules as parameters or export a `createListSync(deps)` factory). Only worth doing as part of the FR-01 fix; otherwise treat as the "extract to a pure helper, then test" backlog.
- **Proposed cases (after a `deps` seam):** `friendInbox.ackAfterSave` (fake `applyExternal` throws → `fl_ack` not called, `seen` unchanged), `friendInbox.ackFailsThenRepull` (ack rejects, second `fl_pull` returns same ids → `added 0`), `listSync.concurrentSyncShareRun` (two simultaneous calls → one `readFile`), `listSync.neverUsesRecipeFileId` (all `drive.*` calls use the list fileId, `createFile` always with `einkaufsliste.json`).
- **Guards against:** TW-05/06 and FR-01 H3.

## If you add three tests, add these
1. **`FR01.invariant.noDuplicateIds` + `FR01.oneRowPerIngredient`** — a sequence test over aggregate → mergeItems → friend → mergeList with real Ingwer lines asserting unique ids and one live row per canonical item. Catches H1+H2+H3 in one go and will keep guarding every future shopping change.
2. **`FR01.mergeItems.tombstoneBeforeLive`** — smallest reproducer of the duplicate-live-row bug; a three-line test, fails today.
3. **`FR01.friend.replayAfterDelete`** — fails today with duplicate id `fr-<id>`; pins the one path where a friend suggestion can come back without anyone adding it.

## Checked and refuted
- "sync.js overwrites a dirty local edit" — refuted by `decideSync` + `sync.js:114-121` (conflict preserves local).
- "`applyFriendItems` re-adds when `fl_ack` fails" — refuted while `seen` persists: `friendInbox.js:99` writes `seen` *before* `fl_ack` and `test-friends.js:34` pins it. Only the `seen`-lost/trimmed edge (H3) remains.
- "Deleted Ingwer revived by a normal sync on up-to-date devices" — refuted: probe P5 (37-day-old remote tombstone vs stale live) → merged `[]` (tombstone newer, then pruned); only the already-pruned case (H4) resurrects.
- "mergeList is non-idempotent / flips on ties" — `test-list-merge.js:46` idempotent; ties keep local deterministically.
- Pure-module coverage by export-name grep: every export of `schema` (except 3 constants), `migrate`, `derive`, `decideSync`, `shopping/*`, `planner/logic`, `lager/logic`, `cookbook/filter`, `ai/parse` is referenced in `v2/tests`. Untested exports are only IO/DOM: `sync.js` (5), `listSync.js` (13), `friendInbox.js` (11), `supabase.js` `rpc/randomToken`, `drive.js`, `db.js`, `settings.js`, `data/lager.js`, `store.js`, `ui/helpers.js`, `ai/client.js`, `router.js`; low-value untested pure bits: `catalog.sectionIcon`, `capture/parse.parseBulk`, `ai/prompts` 4 prompt builders, `i18n.hasLang`.

## Verified clean
- Suite wiring: `run.js` imports all 20 `test-*.js` files; `test-syntax.js` and `test-sw-shell.js` guard the shell.
- `decideSync` truth table (9 cases), `listMerge` LWW/tombstone/idempotency, `friendMerge` invite/author/snapshot/isListed, K4b canonical-German persistence invariant (`test-canonical.js`), `migrate` round trip.
- `ai/parse.extractJson` behaves correctly on unbalanced / brace-in-string / array root (E1), just unpinned.

## Cross-lens notes
- → bug-hunter / data-guardian: `rezepte.json` line `"½ TL gemahlene Nelken 🛒, 1 TL Ingwerpulver 🛒"` is two ingredients in one string; data fix is in data-guardian's lens, the parser guard is TW-13.
- → bug-hunter: `shopping.js:41` `save()` does not await `listSync.saveList`, while `friendInbox.doSync → applyExternal` reads `loadLocalList()` independently; a tap landing between the two could be overwritten (loss, not duplication). E3, unverified.
- → ux-curator: H5 (catalog grid shifts under the finger when `paintList` grows above it).

## Definition drift
Agent file says the suite lives in "~11 test files / sync.js untested"; tree now has 20 test files, `decideSync.js` extracted, `listSync.js`/`friendInbox.js`/`friendMerge.js` exist. Old report's file list and sync gap description are obsolete (handled above).

## Summary
Suite 215/215 green. Gaps: 0 critical, **high 2** (TW-09 identity, TW-10 mergeItems first-hit), **med 6** (TW-05, TW-06, TW-11, TW-12, TW-13, TW-14), **low 2** (TW-07, TW-08); 4 old gaps fixed (TW-01..04). FR-01 reproduced at E1 via four independent pure-logic paths (key fragmentation, tombstone-first revive, friend duplicate id, prune resurrection); the most valuable item is a cross-path "one live row per canonical ingredient, unique ids" invariant test with real Ingwer lines.
