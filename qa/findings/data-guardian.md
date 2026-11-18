# Data-Guardian — findings (2026-11-18T21:30Z)
_Build 2026-10-27-v2.17 (not yet bumped on this branch) · CACHE koch-v2.17-1 · tests 583/583 · HEAD fe191d6 (release-bump/2.18-r2 = origin/next) · mode DELTA origin/main..HEAD_

This is the v2.18 retry guard pass. Probes ran in Node against the real modules of this tree (`v2/src/...`). The "live code" comparison used verbatim copies of `origin/main:v2/src/data/*.js` in `/tmp/dg/main`. The real data was the bundled `v2/data/rezepte.snapshot.json` (105 recipes) plus the en/da/es snapshots. The repo-root `rezepte.json` no longer exists. Nothing touched Drive, Supabase, Anthropic or any repo file except this report. Probe scripts are in `/tmp/dg/probes/`.

## Field reports
FR-01 (Ingwer duplicates) is covered by fixed DG-04/08/09/12 (v2.15.2/.3). The delta adds one small transitional duplicate source, the `Liter` parse change (DG-22, P3). It is not a new FR-01 cause.

## Status of previous findings
The file on disk was still the v2.14 report (DG-01…DG-14). The v2.18 guard-pass findings DG-15…DG-18 were never written back to it. I rebuilt them from issues #48, #49, #50 and #53/#83.

| ID | Title | Status | Note |
|---|---|---|---|
| DG-01 | Recipe saves overwrite Drive blind | ✅ fixed | T1, v2.15.1: `sync.js:146-160` `saveChange` = queued change + read → three-way merge → write |
| DG-02 | Editing in EN/DA/ES writes the translation into German | ✅ fixed | T3: `detail.js:193` opens `getRecipeDe`. Re-proven E1 in the EN UI: stored name/ingredients stay German (probe `p_en_edit`) |
| DG-03 | Recipe without `id` partly wipes IndexedDB | ✅ fixed | T2: `recipeMerge.inspectRemote` rescues missing ids. Probe: `{no id}` → `r1795…:noid`, 3 notes |
| DG-04 | Id-less list item copies itself every sync (FR-01) | ✅ fixed | T4: `listMerge.js:48-80` `LEGACY_STAMP`/`stableItemId`/`adoptLegacy`/`collapseLegacyCopies` |
| DG-05 | `{}`/`null`/`recipes` not an array wipes the local cookbook | ✅ fixed | Probe: `{}`→noRecipes, `null`→notObject, `recipes:null`→noRecipes, v4→newerFormat (all rejected, local kept) |
| DG-06 | Duplicate recipe id loses a recipe | ✅ fixed | Probe: the duplicate `a` was re-id'd and kept |
| DG-07 | In-file `updated` is the only change signal | ✅ fixed | Merge is per content now. Probe: a Claude edit with the same stamp is pulled (`A (Claude)`). `decideSync` only picks `prefer` when there is no base and the copy is dirty |
| DG-08 | `mergeItems` revives a tombstone next to a live twin | ✅ fixed | T5: `logic.findSame` (live first) |
| DG-09 | Same item → several list keys | ✅ fixed | T5: `logic.sameKey` (unit-agnostic, prep note stripped). DG-22 is a new small exception |
| DG-10 | Assistant recipes saved in the UI language | ✅ fixed | T3 (v2.15.1) |
| DG-11 | SCHEMA.md drift | ✅ fixed | T11. The sync section and the new export/import section match the code, except DG-19 below |
| DG-12 | Friend replay crash window | ✅ fixed | P7 (v2.15b): list + `friendSeen` in one IDB transaction |
| DG-13 | Tombstones pruned after 30 d resurrect | ✅ fixed | T7: `prunedBefore` |
| DG-14 | Unexpected list file shape overwritten | ✅ fixed | T10: `listFile.js` refuses it |
| DG-15 | Import keeps a file id that exists only on Drive → silent replace | ✅ fixed | 6dd0c52: `recipeMerge.js:121` fork. Probe: Drive-only `r…099` kept, import moved to `r1790000000500`, 107 recipes |
| DG-16 (=BH-12) | Whole-cookbook re-import doubles base recipes | ✅ fixed | 2b27980. Probe: own export (106, with ♥/rating/feedback/lastCooked) into the same cookbook → imported 0, skipped 106. Raw `rezepte.json` (v1 shape) into the seed → 0 imported |
| DG-17 | `LOCALIZED` marker lost on `{...r}` | ✅ fixed | 653dcb9: `baseLang.js:84` enumerable symbol. Probe: a spread copy is refused by `buildExportFile`; `JSON`/`structuredClone` carry no marker |
| DG-18 (=BH-13) | Import accepts any version / untrimmed ids; export file not in SCHEMA | ✅ fixed | 6dd0c52: `recipeImport.js:48-51` (version required, >3 refused), `:61` trim, `SCHEMA.md:234-262` |

## New findings

### DG-19 [P2] Re-importing your own backup still duplicates recipes whose stored content doesn't survive the import filter (unknown field, non-https image) · confidence: high · evidence: E1
- **Asset at risk:** The cookbook (no duplicates), and the SCHEMA promise "so verdoppelt der eigene Vollexport nichts" (`SCHEMA.md:260`).
- **Where:**
  - `v2/src/data/recipeImport.js:72-74`: `isSameRecipe` compares the *sanitized* incoming recipe with the *raw* stored one.
  - The sanitizing happens at `recipeImport.js:13` / `:60` (unknown fields dropped) and `:62-63` (non-https `image` cleared).
  - `recipeExport.js:8-15` writes both of those into the file unchanged.
- **How it corrupts:**
  - Unknown field: a recipe carries an extra field. `SCHEMA.md:170`/`:226` allow this ("unbekannte Felder innerhalb eines Rezepts bleiben"), e.g. project-Claude adds `nutrition`. Whole-cookbook export → import into the same cookbook → the recipe is not "the same" → a renamed copy **without** the field, `origin:"user"`, under a new id.
  - Image: a user recipe with an `http:` image URL (the form doesn't restrict it) → re-import → duplicate with no image.
  - Nothing is lost, but every backup → restore round adds one more copy of each such recipe, and the copy syncs to Drive and the partner.
- **Proof (`/tmp/dg/probes/p_import.mjs`, case 4, + inline probe):**
  - `recipe with unknown additive field, own export -> same cookbook: {"imported":1,…,"renamed":1,"duplicates":105}` (renamed "Apfelkuchen vom Blech…")
  - `http image + own export: {"imported":1,"skipped":106,…,"renamed":1}`
  - The bundled snapshot has 0 unknown fields and 0 images, so the seed alone is not affected. The live Drive file may differ.
- **Guard:** In `planImport`, compare the incoming recipe with the existing one *passed through the same filter* (KEPT_FIELDS + image rule), e.g. `sameContent(r, sanitize(existing))`. Test: "own export of a recipe with `nutrition` / `http:` image → 0 imported". Effort S.

### DG-20 [P3] Import edge cases a backup or hand-edited file can hit: the app exports recipes its own importer refuses, and one recipe listed twice becomes two copies · confidence: high · evidence: E1
- **Asset at risk:** Backup completeness; no duplicates.
- **Where:**
  - `v2/src/data/recipeExport.js:8` has no `IMPORT_LIMITS` check, while `recipeImport.js:10` / `:57-58` refuse over-limit recipes. The form has no `maxlength`.
  - `recipeImport.js:87-95`: a second entry with the same id and the same content is not matched against the first (only against `existing`), so it is renamed.
- **How it corrupts:**
  - A recipe with `tips` over 5000 characters exports fine, but the restore skips it ("Rezept[1]: tips länger als 5000 Zeichen"). The user only learns this on restore.
  - A file that lists the same recipe twice → 2 copies.
  - Real data is far from the limits (max `tips` 398 characters, max 15 lines), so practical risk is low.
- **Proof:**
  - Probe: `reasons:["Rezept[1]: tips länger als 5000 Zeichen", …]`
  - `file lists same recipe twice -> {"imported":2,…,"renamed":1}`
- **Guard:** Warn at export time for recipes over `IMPORT_LIMITS` (or apply the limits in the form). In `planImport`, skip an incoming recipe that `isSameRecipe` matches an earlier `toAdd` entry. Effort S.

### DG-21 [P3] The new "same id, different recipe" fork also fires on a lost write acknowledgement, and the two copies share Drive photo ids · confidence: med · evidence: E1 (merge) + E2 (trigger)
- **Asset at risk:** Recipe identity (planner and translation links by id) and recipe photos on Drive.
- **Where:**
  - `v2/src/data/recipeMerge.js:121`: the fork condition `B && !b && !sameContent(l, r)`.
  - `recipeMerge.js:158`: `{ ...l, id }` copies `photos`.
  - `v2/src/features/cookbook/detail.js:209`: deleting a recipe deletes its Drive photos.
  - `syncRules.js:94-95`: `setBase` only runs after a successful round trip.
- **How it corrupts:**
  1. Add recipe X. The Drive write lands, but the tab is killed or the response is lost before `setBase`, so the base doesn't know X.
  2. The user changes X's content before the next successful sync.
  3. The next merge sees "two different recipes with one id": the Drive version keeps `rX`, and the edited one moves to a new id. One recipe becomes two.
  4. If X had photos, both copies point at the same Drive photo files. Deleting the stale copy deletes the photos of the kept one.

  Usually the boot sync heals the base first (l == r → no fork), so the window is narrow.
- **Proof (`/tmp/dg/probes/p_fork.mjs`):** `lost-ack + local edit: r1795000000000:Linsen-Dal (scharf):photos=drivePhoto1 | rX:Linsen-Dal:photos=drivePhoto1 … forked [{"from":"rX",…}]`
- **Guard:**
  - Fork only when the local twin has `origin` from an import that is newer than the base, or record "ids I pushed" in meta before the write and treat those as known.
  - Strip `photos` from the forked copy, or only delete photos that no other recipe references.
  - Effort S–M.

### DG-22 [P3] The `Liter` parse change makes one transitional duplicate list row per open "Liter …" item · confidence: high · evidence: E1
- **Asset at risk:** The shopping list (no duplicates; FR-01 lens).
- **Where:** `v2/src/data/derive.js:97` and `:144` (`"1 Liter Gemüsebrühe"` → unit `l`, item `Gemüsebrühe`; previously item `Liter Gemüsebrühe`). Identity is `logic.sameKey(name)`.
- **How it corrupts:** A list that still has an open row "Liter Gemüsebrühe" (added by ≤ v2.17) gets a second row "Gemüsebrühe" the next time a recipe with that line is added after the update. 8 of 839 snapshot lines are affected (Gemüsebrühe ×7, Milch ×1). It is a one-time effect, and going forward the change is an improvement, because it now matches the catalog tile.
- **Proof:** `sameKey("Liter Gemüsebrühe") = "liter gemüsebrühe"` vs `sameKey("Gemüsebrühe") = "gemüsebrühe"`. Old/new parse diff: 8 lines.
- **Guard:** Have `sameKey` strip a leading unit word ("liter ") the same way the parser does, or accept it as a one-off and mention it in the release notes. Effort S.

## Checked and refuted
- **`origin` read by the live (main) code:**
  - `origin/main` validates a file with `origin:"user"` and `origin:"shared"` plus an unknown field (0 errors), pulls them, keeps them through a form-style `Object.assign` edit and a three-way merge with a Claude edit, and writes them back (probe `p_main_origin`: `after pull origin: user shared {"kcal":400} | after local edit origin: user | 3-way origin: user … Claude tip`).
  - HEAD gives the identical result. No field loss in either direction.
- **v1 (`index.html`) and `origin`:** `normalize` (`index.html:503`) and edit (`:1420` `Object.assign(ed, fields)`) keep the whole object, so `origin` survives v1 saves. A v1-created recipe has no `origin` and counts as a base recipe, which is consistent with the SCHEMA "fehlt = Grundrezept".
- **Non-string `origin` from an external writer:** `inspectRemote` keeps it (null/5 kept, no crash). `store.updateRecipe` drops it on edit so the edit still validates (`store.js:113-117`). The import refuses that recipe with a named error. Safe.
- **Fresh install + import before sign-in → stale seed overwrites Drive:** refuted. `loadLocal` seeds `recipesBase` = snapshot (`sync.js:90`), so the first sync is three-way, not "prefer local".
- **Personal-only difference on an id the base doesn't know** (e.g. ♥ on an imported recipe that another device also imported): no fork, and Drive's personal state wins (`recipeMerge.js:123`). This predates the delta and is an edge case. Not reported.
- **Import into a fresh install duplicates edited base recipes** (probe case 3: 3 renamed). This is the documented rule "gleiche id, anderer Inhalt → neue id" (`SCHEMA.md:260-262`). Nothing is lost. Design, not a bug.
- **HTML in an imported name:** it is stored raw by design. Every render path for names uses `esc()` (import sheet `importFile.js:18`, similar-note `form.js:18`). Clean.
- **Marker leaking into storage:** it is an enumerable symbol. `JSON.stringify` and `structuredClone` drop it (probe), so IDB and the file never see it.

## Invariants verified clean
- **Canonical German:** every outbound path is fed `recipesDe` or `getRecipeDe`. Persist: `store.js:96` `saveChange(change)` on the IDB list. Exports: `menu.js:40-41` `getRecipesDe()`. Share: `detail.js:180` `getRecipeDe`. Edit: `detail.js:193`. List: `detail.js:163`, `planner.js:169`. `lastCooked` is written with `de-DE` (`detail.js:201`). The EN-default UI (#43) edit probe stored 0 English names out of 105.
- **Round trip:** the snapshot (105) goes through `inspectRemote` → `mergeRecipes` → `toFileString` with no field lost. Unknown per-recipe fields and `origin` pass the sync path on both HEAD and main.
- **Export → import of the seed / own cookbook:** 0 added, personal fields stripped (`feedback` not imported).
- **The ingredient master (`ingredients.js`, `ingredientMatch.js`, `units.js`, `data/ingredients.json`)** is pure and not imported by any app path yet, so nothing persists it.
- **Device-only settings:** `assistantInstructions` (kv) and per-recipe portions (localStorage, `portions.js:2`) never reach `rezepte.json`.
- **`importRecipes`:** it re-plans against the queued IDB list (`store.js:170-176`), so an id clash that appears in between never overwrites. The DG-15 fork handles ids that exist only on Drive.

## Definition drift
- The repo-root `rezepte.json` is gone; I used `v2/data/rezepte.snapshot.json`.
- The agent file names `data/decideSync.js` as the recipe sync decider. Since v2.15.1 that is `syncRules.recipeSync` + `recipeMerge.mergeRecipes` (three-way), and `decideSync` only picks `prefer` without a base.
- The DG-15…18 findings of the first v2.18 pass were never saved to this file.

## Cross-lens notes
- → release-captain: issues #48, #49, #50 and #83 are still `open` on GitHub although fixed on `next` (2b27980, 6dd0c52, 653dcb9).
- → test-warden:
  - No test covers "own export with an unknown field / http image → 0 imported" (DG-19), or a fork copy sharing photo ids (DG-21).
  - #87 reports the DG-17 test flaking on a millisecond boundary of two `updated` stamps.

## Summary
New: P0 0 · P1 0 · P2 1 · P3 3. All 18 previous findings are fixed (DG-01…DG-18). The most valuable item is **DG-19**: the "own backup never duplicates" promise breaks for recipes with an unknown field or a non-https image. Fix it by comparing against the existing recipe after the same import filter.

## Verdict
**The data layer is trustworthy for v2.18:** no path writes translated text, loses `origin` or unknown fields, or overwrites a recipe. The only new risks are duplicate-copy edge cases (P2/P3), none of which block the release.
