# Data-Guardian — findings (2026-11-18, delta re-verify)
_Build 2026-10-27-v2.17 (release bump to 2.18 not yet in tree) · CACHE koch-v2.17-1 · tests 583/583 · HEAD 40ed058 · mode DELTA (`origin/main..HEAD`, re-verify of c39ec1f → HEAD)_

How I tested: node probes imported the real pure modules (`recipeMerge`, `recipeImport`, `recipeExport`, `migrate`, `schema`, `baseLang`, `derive`, `listMerge`, `listFile`, `logic`). For `store.js` I used its test hook `setSaveChangeForTest` with an in-memory "disk". Scratch scripts ran outside the repo. Nothing touched Drive, Supabase, Anthropic or any repo file except this report. The repo-root `rezepte.json` is gone. The round trip used `rezepte.seed.json` (1 recipe) and `v2/data/rezepte.snapshot.json` (105 recipes).

## Delta since the last pass (c39ec1f → 40ed058)
- Only two files changed: `v2/tests/test-recipe-export.js` (#95, DG-17 test now passes a fixed `now` to `buildExportFile`) and `docs/process/SCHEDULED-TASKS.md`. Nothing under `v2/src/`, `SCHEMA.md` or `supabase/` changed (`git diff --name-only c39ec1f..HEAD -- v2/src SCHEMA.md supabase` is empty).
- The test fix is sound: `buildExportFile(recipes, now = new Date())` (`v2/src/data/recipeExport.js:8`) really takes the clock, so the assertion still compares content and only the 1 ms `updated` race is gone. It does not weaken the DG-17 guard (the symbol checks above it are unchanged).
- Unit suite re-run: 583/583 green. All findings below are carried over from the c39ec1f pass unchanged; the E1 probes were not re-run because the code they exercised is byte-identical.

## Field reports
None open in my lens. FR-01 is marked fixed (v2.15.2 / v2.15.3), and my probes confirm the fix (DG-04, DG-08 and DG-09 below).

## Status of previous findings
The last committed report is from v2.14 (DG-01…DG-14). A later run produced DG-15…DG-18 but was never committed. I took their meaning from issues #48, #49, #50 and #83 and kept those IDs.

| ID | Title | Status | Note |
|----|-------|--------|------|
| DG-01 | Recipe saves overwrite Drive blind | ✅ fixed | `v2/src/data/sync.js:122-136`: every save reads Drive and merges first (`syncRules.js:60-111`, three-way merge in `recipeMerge.js`). Test `test-sync-core.js:233`. |
| DG-02 | Editing in EN/DA/ES writes the translation to Drive | ✅ fixed | `detail.js:193` opens `getRecipeDe`. Test `test-canonical.js:63`, e2e `02-language.spec.js:38`. |
| DG-03 | A recipe without `id` partly wipes IndexedDB | ✅ fixed | `db.js:97-103`: `replaceAll` is all-or-nothing. `recipeMerge.js:38-46` gives a missing id a new one. E1: `Rezept „A“ ohne id → r1795…`, null dropped with a note. |
| DG-04 | An id-less list item copies itself on every sync | ✅ fixed | `listMerge.js:41-100` (stable id + collapse). E1: 4 syncs → 1 live Ingwer row. |
| DG-05 | `{}` / `null` / non-array `recipes` wipe the cookbook | ✅ fixed | `schema.js:49-54` `envelopeProblem` → `RemoteRejected`. E1: `{}`, `null`, `recipes:null` and v4 are all rejected. |
| DG-06 | Duplicate external id loses a recipe | ✅ fixed | `recipeMerge.js:44`. E1: `doppelte id r01 („C“) → r1795…`. |
| DG-07 | The in-file `updated` string is the only change signal | ✅ fixed | The sync core reads and merges by content on every sync, save and resume (`app.js:118`). `decideSync` is only used for the old no-base upgrade case (`syncRules.js:73-77`). |
| DG-08 | `mergeItems` revives a tombstone next to a live twin | ✅ fixed | `logic.js:122-127` `findSame` prefers the live row. E1: 1 live row. |
| DG-09 | Same item gets several keys; partner adds never merge | ✅ fixed | `logic.js:91-120` `sameKey` and `listMerge.js:103-124` `foldSameItems`. E1: two devices adding Ingwer offline → 1 live row. |
| DG-10 | Assistant recipes saved in the UI language | ✅ fixed (E2) | `prompts.js:77` and `:95`: German content rule. With custom instructions (#70), `:142` still appends the fixed contract and the German rule. Only a prompt-level guard; the model could still disobey. |
| DG-11 | SCHEMA.md promises more than the code does | ✅ fixed | SCHEMA now covers re-sync (`:194-232`), what happens to top-level keys (`:226-228`), the list contract and the `r01` warning (`:69`). |
| DG-12 | Friend replay after a crash | ✅ fixed | `friendMerge.js:32` and `:68`, `listSync.js:180`. Tests `test-friends.js:111`. |
| DG-13 | Tombstone pruning resurrects deleted items | ✅ fixed | `listMerge.js:146-149` `dropBeyondHorizon`. |
| DG-14 | List file in an unknown shape is overwritten | ✅ fixed | `listFile.js:76`. E1: `{version:2}`, `items:null` and `null` are all rejected. |
| DG-15 (#49) | An import id that exists only on Drive silently replaces a recipe | ✅ fixed | `recipeMerge.js:121` and `:151-162`: the local twin gets a new id (`forked`). E1 and test `test-sync-core.js:413`. Issue #49 is still open on GitHub and should close with the release. |
| DG-16 (#48) | Whole-cookbook import doubles the base recipes | ✅ fixed | `recipeImport.js:72-75`: `isSameRecipe` uses `sameContent`. E1 on the 105-recipe snapshot with personal fields set: 105 skipped, 0 added. Exceptions in DG-19. |
| DG-17 (#83) | Canonical guard lost on a `{...r}` copy | ✅ fixed | `baseLang.js:81-84`: an enumerable symbol. E1: `{...r}` and `Object.assign` are rejected. JSON and `structuredClone` copies pass, which is intended because the marker never reaches a file. |
| DG-19 | Re-import of own export duplicates recipes with unknown field / non-https image | ⏳ open | Re-verified by code read: `recipeImport.js:59-65` still cleans only the incoming copy before `isSameRecipe` (`:72-75`, `:87`). Body below. |
| DG-18 (#50) | Import accepts any version and untrimmed ids | ✅ fixed | `recipeImport.js:50-52` and `:61`. E1: v99, `"3"` and `3e999` are rejected; `" r01 "` becomes `r01`. The export file is documented in `SCHEMA.md:234-262`. |

## New findings
None in this delta. DG-19 (from the c39ec1f pass) is still open and kept here for reference.

### DG-19 [P2] Re-importing your own export duplicates recipes that have an unknown field or a non-https image · confidence: high · evidence: E1
- **Asset at risk:** The cookbook stays free of duplicates. This breaks the SCHEMA promise "so verdoppelt der eigene Vollexport nichts" (`SCHEMA.md:260`) for backup and restore.
- **Where:**
  - `v2/src/data/recipeImport.js:59-60`: unknown fields are dropped.
  - `recipeImport.js:62-65`: a non-https `image` is cleared.
  - `recipeImport.js:72-75` and `:87`: `isSameRecipe` compares that cleaned incoming copy with the **uncleaned** existing recipe.
  - `recipeMerge.js:76-81` `contentOnly`: counts every key except the personal fields and `origin`.
- **How it corrupts:**
  1. A recipe on Drive has an extra field (Drive sync keeps these, `SCHEMA.md:254`) or an `http:` image. The form accepts any URL (`form.js:104`, no scheme check).
  2. Export the whole cookbook. `recipeExport.js` keeps both the extra field and the image.
  3. Import that file on the same device, or on a device that already has those recipes.
  4. Result: each such recipe counts as "same id, different content" and is added again under a new id, marked `origin:"user"`. The added copy has no image and no extra field. Nothing is lost, but the cookbook gets duplicates that the result sheet reports as "renamed".
- **Proof (p4 probe):** own export of 5 recipes re-imported into the same set → `skipped [r1700000000000, r1749290003000]`, `renamed(dup) [r01 (has nutrition field), r1748713200000 (http image)]`. Today's snapshot has 0 unknown fields and 0 images, so the trigger needs Claude- or user-written data.
- **Guard:**
  - In `planImport`, run the existing recipe through the same cleaning as the incoming one before comparing: only the kept fields, and the image check applied. Equivalently, compare only `KEPT_FIELDS` and treat a cleared image as equal.
  - Test: an existing recipe with `nutrition` or an `http:` image → the re-imported own export is `skipped`, not `renamed`.
  - Effort S.

No new P0/P1.

## Checked and refuted
- **`origin` lost through Drive:** if Claude or another writer drops `origin` from a user recipe, the merge takes the Drive copy and `origin` disappears (E1: `Claude drops origin: origin after merge = undefined`). That makes the recipe count as a base recipe. This errs on the safe side (the future assistant-delete permission never widens), and SCHEMA rule 13 tells Claude to keep the field. v1 edits in place (`index.html:1420`), so it keeps `origin`. Not a finding.
- **Anything that wrongly stamps `"user"`:**
  - `addRecipe` always stamps `"user"` (`store.js:135`), and the fields passed in cannot override it (E1).
  - `updateRecipe` puts the earlier value back after the edit (`store.js:113-118`). E1: deleting it, setting `"user"` on a base recipe, and keeping `"shared"` all behave correctly. A non-string `origin` is dropped instead of blocking the edit.
  - Import stamps `"user"` on every recipe it adds (`recipeImport.js:92`, `:95`). Identical base recipes are skipped, so a full-cookbook restore into an existing cookbook marks nothing new. Into an **empty** device it marks all 105 as `"user"` (E1). That is documented import semantics (`SCHEMA.md:255`). Revisit this when "assistant may delete own recipes" ships.
- **Fork creates duplicates in the crash window:** if Drive was written but `setBase` never ran, the next content edit on either side forks the recipe (E1: n 6→7). Before the delta, the local side was silently overwritten in the same case. A duplicate is the safer outcome, and the window is a killed tab mid-sync. Accepted.
- **Fork window loses a local ♥/★:** same window with only a personal change → `sameContent` → Drive wins and `rating` goes back to 0 (E1). This behaviour predates the delta, needs a killed tab mid-sync, and loses at most one rating. Not raised.
- **Restore an older backup after signing in:** every recipe that changed on Drive since the backup comes back as a renamed copy. This is the documented "never overwrite" rule (`SCHEMA.md:261`). No data is lost.
- **`importRecipes` ordering (`store.js:157-187`):** it plans twice, against memory and then in the queue against IndexedDB, and swaps the shown ids when they differ. If the save fails, the shown recipes are removed. A collision that appears in between never overwrites a recipe.
- **Import of hostile files (E1):**
  - Empty, truncated, `[]`, `{}`, a string version, `3e999`, v99 and a non-array `recipes` are all rejected with a reason.
  - A mixed file keeps only the valid recipes:
    - `feedback`, `rating` and unknown fields are dropped;
    - `javascript:` images are cleared;
    - missing or blank id, bad category, `origin:5`, 201 ingredient lines and non-string lines are each reported by index.
  - HTML in a name is stored as plain text. Rendering escapes it (`importFile.js:17-21` uses `esc`).
- **Drive file with `version:"9"` (a string):** `envelopeProblem` only rejects numbers above 3, so the app accepts the file and rewrites it as `3` (E1). Import rejects the same file. This inconsistency is harmless: no recipe is lost. Not raised.
- **`addRecipe` lets a passed-in `id` win (`store.js:135`):** E1 with `id:"hack"`. Still unreachable: `coerceRecipe` (`ai/parse.js:59-97`) and the form fields (`form.js:95-110`) never carry an `id`.
- **"Liter" parse change (`derive.js:97`, `:144`):** E1: `1 Liter Milch` → `{unit:"l", item:"Milch"}`; `Literflaschen`, `Lauch` and `Limetten` are not mis-parsed. The only side effect: an open row "Liter Milch" created before the update won't fold with a new "Milch" row. One-time and cosmetic.

## Invariants verified clean
- **Round trip load → normalize → save → load:**
  - On the 105-recipe snapshot: 0 validation errors, 0 fields lost, 0 changed, fixed point holds, `updated` kept.
  - On the seed file: only the expected v1 defaults are added.
  - A self-merge through `inspectRemote` + `mergeRecipes` is unchanged with 0 forks.
  - `origin` is a plain additive string, `version` stays 3 (`schema.js:31-35`, `:80`), so the file stays flat-v3.
- **Export → import round trip:** 0 parse errors, 0 personal fields leak (`PERSONAL_FIELDS` is defined once, `schema.js:43`), 0 content diffs, 105/105 skipped into the same set.
- **Canonical German:**
  - Every outbound path gets canonical data: `menu.js:40-41` and `getRecipesDe` (`store.js:77`), the detail share `detail.js:180`, edits `detail.js:193`, and `importRecipes` (data parsed from the file, never `state.recipes`).
  - The persist paths `sync.saveChange` (`sync.js:124-125`) and `recipeSync.merge` (`syncRules.js:102`) only see IndexedDB and Drive data.
  - E1: 0 localized objects on disk or in `getRecipesDe()`.
- **syncRules delta (`syncRules.js:81`):** one log line only, no behaviour change.
- **Settings persistence:**
  - Assistant instructions (#70) live in kv `assistantInstructions` on this device only. Empty or default text means reset (`settings.js:38-55`).
  - Portions (#63) live in localStorage, keyed by recipe id. Broken JSON is treated as empty (`portions.js:12-26`).
  - Neither reaches `rezepte.json` or the sync.
- **`ingredientMatch.js` / `ingredients.js` / `units.js`:** pure. No caller in `v2/src` outside the data layer yet, so no persistence impact.
- **Ids:**
  - `planImport` blocks both local and incoming ids. E1: two in-file `r01` → two fresh ids, an incoming `r1999999999999` keeps its id and the new ids skip past it.
  - The fork ids come from `makeIdFactory` over base, local and remote together.

## Definition drift
- The agent file names `decideSync.js` as the recipe sync engine. In fact sync runs through `syncCore.js`, `syncRules.js` and `recipeMerge.js`, and `decideSync` only remains for the no-base upgrade case.
- The repo-root `rezepte.json` no longer exists. `rezepte.seed.json` and `v2/data/rezepte.snapshot.json` are the in-repo copies.
- The DG-15…DG-18 report was never committed.

## Cross-lens notes
- → test-warden: there is no test for `planImport` against an existing recipe that has an unknown field or an `http:` image (DG-19). The fork-window behaviour of `mergeRecipes` (base without the id, same content, only a personal field differs) is also untested.
- → release-captain: issues #48, #49, #50 and #83 are fixed on `next` but still open on GitHub.

## Summary
P0: 0 · P1: 0 · P2: 1 open (DG-19, carried) · P3: 0 · new in this delta: none. All 18 earlier findings are fixed.

The most valuable item is DG-19. Make `planImport` compare the existing recipe after the same cleaning as the import, so a full-cookbook restore never duplicates recipes. Effort S; it can follow in v2.18.x.

## Verdict
**Trustworthy for v2.18:** round trips are exact, `origin` is additive and safe, only canonical German leaves the device, and hostile import or Drive files are refused or cleaned. The only gap is duplicates (not loss) when re-importing in an edge case (DG-19).
