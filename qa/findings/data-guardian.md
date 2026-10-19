# Data-Guardian — findings (2026-10-12T16:33Z)
_Build 2026-10-04-v2.14 · CACHE koch-v2.14-1 · tests 215/215 · HEAD 70e8b9d · mode FULL_

Probes ran against the real modules. Pure modules were imported directly. For `sync.js`, `listSync.js` and `store.js`, I made verbatim copies in the OS temp dir and ran them against in-memory stubs of `db.js` and `drive.js`. Nothing touched Drive, Supabase or any repo file except this report. The repo-root `rezepte.json` is an untracked copy (`updated` 2026-06-08, 105 recipes). It is not the live Drive file.

## Field reports

### FR-01: "Ingwer gets added to the shopping list randomly and multiple times without selecting it"

**Verdict:** I reproduced it with E1 evidence. The most likely root cause is a legacy item with no `id` in the Drive `einkaufsliste.json`. That item copies itself into one more live row on every list sync. Three smaller key and merge effects make the duplicates worse.

| Rank | Hypothesis | Evidence | Matches "randomly / multiple / not selected"? |
|---|---|---|---|
| 1 | **An item with no id in the Drive list makes one extra row per sync (DG-04).** v2.10 pushed recipe items to Drive without `id` or `updated`. That covers git `e5c0eef` (`shopping.js` `save()` → `listSync.saveList(ITEMS)`, where the ITEMS came from `mergeItems`), released on main from 2026-06-17 to 2026-10-02. Since v2.11 each sync merges that id-less remote object next to its local copy, and the local copy gets a fresh id on every load. | E1. Real `listSync.js` with stubs: sync #1..#5 gave **1, 2, 3, 4, 5 live Ingwer rows** (Drive also 1→5). After the user deletes every Ingwer row: debounced sync → 2, next sync → 3, Drive → 7. | Yes, on all three counts. It grows without any user action. Syncs are triggered by opening the list tab, 🔄, the `online` event, and 1.2 s after **any** list tap (`schedulePush`). Deleting does not stick. It is one specific item because only the **first** id-less item survives the merge (probe: 3 id-less items → only the first kept). |
| 2 | One ingredient produces several merge keys (DG-09). | E1. 7 recipes mention Ingwer. Their keys are `ingwer\|stück` (5×), `ingwer, gerieben\|stück`, a mis-parsed `gemahlene nelken , 1 tl ingwerpulver\|tl`, and the catalog/friend key `ingwer\|`. Adding all 7 recipes → 3 Ingwer rows. | "Multiple" yes. "Without selecting" only partly: the user did tap "Zutaten auf die Liste" or "Plan → Liste", but for another dish. |
| 3 | `mergeItems` revives a deleted row even though a live twin exists (DG-08). | E1. Tombstone `li-a` plus live friend twin `fr-x`, then adding a recipe with Ingwer → **2 live rows**. | "Multiple" yes. Needs the friends link or a partner. |
| 4 | Two devices or a partner each add Ingwer. The merge unions by id, so both rows stay. | E1. `syncStep(devA, devB)` → 2 rows. | Yes on the *other* device: the row appears "by itself". |
| — | The friend inbox replays suggestions after `trimSeen` | **Refuted.** The server caps open suggestions at 100 (`supabase/migrations/20261004182000_i3_friend_inbox.sql:145`), and `seen` keeps 300. The trim can't drop an unacknowledged id. The only remaining replay is DG-12 (P3). | — |

**How to confirm on a device (any one of these):**
- (a) Download Drive `einkaufsliste.json` and look for an item object with **no `"id"` key**. Hypothesis 1 predicts it is Ingwer, with v2.10-style fields (`sources`, `amount`, `unit: "Stück"`, no `updated`).
- (b) DevTools → IndexedDB `koch-v2` → `lists` → `current`. Look for several Ingwer rows with the same `amount`/`unit`/`sources` but different `li-…` ids whose `updated` times equal sync times.
- (c) Tap 🔄 on the list three times. If the Ingwer count goes up by one per tap, it is confirmed.

The lasting fix needs a code guard (see DG-04). Deleting the rows in the UI cannot remove it.

## Status of previous findings
First run. There is no previous report.

## New findings

### DG-01 [P0] Recipe saves blindly overwrite Drive and destroy external writes (Claude, v1, the other device) · confidence: high · evidence: E1
- **Asset at risk:** Drive `rezepte.json`, specifically every write that did not come from this device (requirements #2 and #3).
- **Where:**
  - `v2/src/data/sync.js:149-173`: `saveCollection` PATCHes without reading Drive first (`:159-161`).
  - `v2/src/app.js:96-103`: recipe sync runs only on a sign-in event or the manual Settings button. There is no sync on resume, visibility or interval.
  - `v2/src/data/decideSync.js:27-33` + `sync.js:103-122`: a dirty local copy that is newer → `push`; a dirty local copy that is older → `conflict`, which keeps the local copy, never pulls, and the next save PATCHes over Drive.
- **How it corrupts:** The phone pulls at 08:00 and the PWA stays in memory. At 12:00 Claude adds a recipe on Drive. At 18:00 Marcel taps ♥ → `saveCollection(recipesDe)` writes the 08:00 set to Drive → Claude's recipe is gone and the status reads "Synchronisiert ✓". The same happens after an offline edit (push) and after a `conflict` (the next save). Laptop and phone also overwrite each other's edits.
- **Proof (real `sync.js`):**
  - `B blind save: Drive before=106 after=105, Claude recipe present=false`
  - `C dirty-newer push: Claude recipe present after=false`
  - `D conflict=true then next save: Claude recipe present=false`
- **Guard:**
  - Read before write: in `saveCollection`, fetch the remote `updated` (or Drive `headRevisionId`) and run `decideSync` before PATCHing. If remote ≠ last-pulled, refuse and keep the change dirty.
  - Sync on `visibilitychange` / resume.
  - Show the conflict to the user instead of only a status line.
  - Test: "remote changed since lastSync → saveCollection must not PATCH".
  - Effort M.

### DG-02 [P0] Editing a recipe in EN/DA/ES writes the translation into the canonical German Drive file · confidence: high · evidence: E1
- **Asset at risk:** The canonical-German rule (only German may ever reach Drive). All 105 recipes are affected: every Drive id has an entry in each of the en/da/es snapshots (probe: overlap 105/105/105).
- **Where:** `v2/src/features/cookbook/detail.js:32` (`r = getRecipe(id)`, the localized view) → `detail.js:169` `openForm(r)` → `v2/src/features/cookbook/form.js:54-68` fills the form from the localized fields → `form.js:80-95` → `form.js:101` `updateRecipe(ed.id, x => Object.assign(x, fields))` → `v2/src/store.js:73-83` writes those fields onto the German object → `persist()` → Drive. `store.js:69-71` admits this in a comment ("selten").
- **How it corrupts:** With the UI in English, open any recipe → ✎ → change only the time → Save. Drive `name`, `ingredients`, `steps` and `tips` become English. v1, project-Claude and the German UI now show English. Shopping-list matching for that recipe stops working, because the catalog and staples are German.
- **Proof (real `store.js` + real snapshot):**
  - `Drive name before: Schnelle Asia-Nudeln aus der Pfanne / after: Quick Asian Stir-Fry Noodles`
  - `ing[0] after: 300g Chinese noodles`
  - `German UI now shows: Quick Asian Stir-Fry Noodles`
  - `test-canonical.js` does not catch this. It only checks `saveCollection(recipesDe)` wiring and `toFileString`.
- **Guard:**
  - In edit mode, `openForm` must fill from `getRecipeDe(id)`. If it shows the overlay for comfort, it must write back only the fields the user actually changed.
  - Alternatively, `updateRecipe` refuses content fields for ids in `langMap`.
  - Test: overlay `en`, run the form-style `Object.assign` with the display values, then assert that the persisted `name` and `ingredients` are still German.
  - Effort S–M.

### DG-03 [P0] A recipe without `id` from an external writer partly wipes IndexedDB, and the next edit pushes the cut-down cookbook to Drive · confidence: med · evidence: E1 (sync path) + E2 (IndexedDB commit semantics)
- **Asset at risk:** The whole cookbook, both locally and on Drive.
- **Where:**
  - `v2/src/data/sync.js:96-97`: validation errors only go to `console.warn`.
  - `sync.js:124-126` → `v2/src/data/db.js:75-81`: `replaceAll` issues `s.clear()` and then `s.put(v)` for each recipe.
  - `put` on a keyPath store with a missing key throws `DataError` synchronously. That does **not** abort the transaction, so the clear and the earlier puts still commit.
  - `v2/src/data/migrate.js:23-24`: `withDefaults(null)` → `{}`, so a `null` entry hits the same path.
- **How it corrupts:**
  1. Claude prepends a recipe and forgets the `id` (v1 also prepends), or writes `null`.
  2. On sync, IndexedDB is cleared and keeps only the recipes before that entry. The status reads "Offline — lokale Daten", which is misleading.
  3. On the next app start, `loadLocal` reads the cut-down set. If it is empty, `loadLocal` reseeds the bundled snapshot.
  4. Every later sync fails the same way, and the first ♥/★ PATCHes the cut-down set to Drive.
- **Proof (real `sync.js`; the stub `replaceAll` models spec semantics):**
  - `F missing id at index 40: error=DataError IDB now=40 (was 105)`
  - `after restart + one edit: Drive recipes=40`
- **Guard:**
  - Before any `replaceAll`, reject (do not pull) a collection where `validateCollection` reports a missing id, a duplicate id or a non-object.
  - Make `replaceAll` validate keys first, or call `t.abort()` in a try/catch.
  - Show the validation error to the user.
  - **How to confirm in a browser:** in DevTools, run `replaceAll("recipes",[{id:"a"},{}])` on a scratch DB and check whether `a` was written.
  - Effort S.

### DG-04 [P1] An id-less item in `einkaufsliste.json` copies itself on every sync, deletes don't stick, and other id-less items are silently dropped (FR-01 root cause) · confidence: high · evidence: E1
- **Asset at risk:** The shared shopping list, on Drive, on the partner device and in the friends showcase.
- **Where:**
  - `v2/src/features/shopping/listMerge.js:10-14`: the `Map` is keyed by `item.id` with no guard for a missing id, so all id-less items fold into key `undefined`.
  - `v2/src/data/listSync.js:43-49`: `ensureItemMeta` gives the *local* copy a fresh id on every load.
  - `listSync.js:91-105`: `merged` keeps the id-less remote object, is written back to Drive (`:98`) and to IndexedDB (`:105`).
  - Source of the id-less data: v2.10 `shopping.js` `save()` (git `e5c0eef`, on main 2026-06-17 → 2026-10-02).
- **How it corrupts:**
  1. Drive holds `{name:"Ingwer", …}` without `id`.
  2. Sync N: the local copy gets id `li-n` and the union with the id-less remote item gives one more row.
  3. Repeat on every sync. Only the first id-less item survives the merge; any others are dropped for good on the first v2.11+ sync.
- **Proof:**
  - `sync #1..#5: live Ingwer rows locally=1,2,3,4,5; Drive=1..5`
  - `after user deletes every Ingwer: … after next sync: live=3 Drive=7`
  - `3 id-less remote items -> merged: ['Knoblauch']`
- **Guard:**
  - In `mergeList`/`syncStep`, give inbound items a **deterministic** id (e.g. a hash of name, unit and sources) or drop them with a warning. Never key on `undefined`.
  - One-time cleanup: dedupe rows with identical `nameDe`/`unit`/`sources` that came from a single id-less origin.
  - Test: "remote item without id + 3 syncs → exactly one live row".
  - Effort S.

### DG-05 [P1] A parseable but malformed `rezepte.json` (`{}`, `null`, `recipes` not an array) wipes every device's local cookbook and reports success · confidence: high · evidence: E1
- **Asset at risk:** The local IndexedDB mirrors, which are the only remaining backups once Drive is damaged.
- **Where:**
  - `v2/src/data/migrate.js:18` (`null` → an empty default with **no** error reported) and `migrate.js:23` (a non-array → `[]`).
  - `v2/src/data/sync.js:97` (errors are only warned).
  - `v2/src/data/decideSync.js:37` (clean + stamps differ → `pull`).
  - `sync.js:124-130` (`replaceAll([])`, status "Synchronisiert ✓").
- **How it corrupts:** An external writer leaves `{}` (or `{"recipes":null}`) on Drive. Each device opens, gets `pull`, and its local copy becomes 0 recipes. The first new recipe then writes `[1 recipe]` to Drive. An empty file or truncated JSON is handled safely: it throws `SyntaxError` and local data is kept.
- **Proof:**
  - `A {}: changed=true localIDB=0 status="Synchronisiert ✓"`; the same for `recipes:null` and `'null'`.
  - `empty file / truncated: error=SyntaxError localIDB=105`.
- **Guard:**
  - Refuse to `pull` when `report.errors` contains "recipes fehlt"/"Keine Daten", or when the input is not an object.
  - Refuse to pull when the remote recipe count drops sharply (e.g. to 0 or by more than 50%) without confirmation.
  - Show the error to the user.
  - Effort S.

### DG-06 [P1] A duplicate recipe id from an external writer loses one recipe on Drive after the next session's save · confidence: high · evidence: E1
- **Asset at risk:** Single recipes.
- **Where:** `v2/src/data/sync.js:97` (the `Doppelte ID` validation error is only warned) → `sync.js:126` → `v2/src/data/db.js:81` (`put` by keyPath keeps the last entry with that id) → `loadLocal` → `saveCollection`.
- **How it corrupts:** `SCHEMA.md:50` and `:202` use **`r01`** as the example id, and `r01` is the real "Süßkartoffel-Curry". If a writer copies the example id, the session still shows 106 in memory, but IndexedDB keeps 105. After a restart, any edit pushes 105 → Claude's recipe is gone.
- **Proof:** `E dup id: remote=106 in-memory=106 IDB=105; after next-session save: Drive=105`.
- **Guard:**
  - Never pull a collection with duplicate ids. Better: re-id the incoming duplicate with `makeIdFactory` and flag it.
  - Change the SCHEMA example id to a timestamp-style id.
  - Effort S.

### DG-07 [P2] The in-file `updated` string is the only change signal: edits without a stamp are never pulled, and stamps in other formats are misordered · confidence: high · evidence: E1
- **Asset at risk:** External edits.
- **Where:** `v2/src/data/decideSync.js:29` and `:37` (plain string comparison, `remote !== local`).
- **How it corrupts:**
  - Claude edits but forgets to bump `updated` → `noop` → no device ever pulls it, and DG-01 overwrites it on the next save.
  - `+02:00` / no-millis / date-only stamps are compared as text:
    - `"2026-10-12T12:30:00+02:00"` (10:30Z) vs a dirty local `12:00Z` → `conflict`.
    - Date-only `"2026-10-12"` vs a dirty local → `push`, which overwrites Claude.
  - With a device clock one day fast, a dirty local edit beats a really newer remote.
- **Proof:** `LWW Claude forgot to bump updated -> noop`, `date-only -> push`, `+1 day skew -> push`.
- **Guard:**
  - Detect changes with Drive metadata (`headRevisionId` / `md5Checksum` / `modifiedTime`) instead of the in-file stamp.
  - Compare `Date.parse` values, not strings.
  - Add these cases to `test-decide-sync.js`.
  - Effort M.

### DG-08 [P2] `mergeItems` revives the first tombstone with a matching key while a live twin exists → two live rows · confidence: high · evidence: E1
- **Asset at risk:** The shopping list (no duplicates).
- **Where:** `v2/src/features/shopping/logic.js:123-125`. `out.find` takes the first key match, even a deleted one. `shopAdd` (`v2/src/features/shopping/shopping.js:76`) already prefers live rows, but `mergeItems` does not. `friendMerge.js:42` skips deleted rows and creates a new `fr-` row, which is how the twin appears.
- **How it corrupts:** Delete Ingwer → a friend adds Ingwer (new row) → "Zutaten auf die Liste" for a recipe with Ingwer → the tombstone is revived next to the friend row.
- **Proof:** `tombstone-first + live twin, add recipe Ingwer -> live rows: 2`.
- **Guard:** Prefer a live match, as `shopAdd` does: `out.find(live && key) || out.find(key)`. Add a test. Effort S.

### DG-09 [P2] The same real-world item gets several list keys and partner/device adds union by id, so duplicates never merge · confidence: high · evidence: E1
- **Asset at risk:** The shopping list (no duplicates). This is the FR-01 contributor the orchestrator flagged.
- **Where:**
  - `v2/src/features/shopping/logic.js:50-52`: `itemKey` = name text + unit, with descriptors kept.
  - `logic.js:87`.
  - `v2/src/features/shopping/listMerge.js:8-16`: union by id.
- **How it corrupts:** Each of these becomes its own row that never merges:
  - `1 Stück Ingwer 🛒` → `ingwer|stück`
  - `1 Stück Ingwer, gerieben 🛒` → `ingwer, gerieben|stück`
  - the catalog tile or a friend → `ingwer|`
  - phone and laptop each adding "Ingwer" offline → 2 rows after sync
  
  Separately, a merged line `"½ TL gemahlene Nelken , 1 TL Ingwerpulver"` becomes one item.
- **Proof:** 7 recipes → 3 Ingwer rows from one action, plus the catalog key `ingwer|`; `phone + laptop … -> 2 rows`.
- **Guard:**
  - Key on a normalized base name: strip descriptors after a comma and map to the catalog entry via `ingMatchCat`. Merge across units by keeping the amounts per unit inside one row.
  - In `syncStep`, offer a dedupe of live rows that share the same base key.
  - Effort M.

### DG-10 [P2] Recipes generated by the assistant are saved in the UI language (non-German content reaches Drive) · confidence: med · evidence: E2
- **Asset at risk:** The rule that Drive content is German. These are new recipes, not translations of existing ones, so nothing is lost. But matching against the German catalog and staples, and v1/Claude, all assume German.
- **Where:** `v2/src/ai/prompts.js:77` ("Antworte IMMER auf ${langName}") covers the recipe JSON too → `v2/src/features/assistant/assistant.js:202` and `:230` `addRecipe(recipe)`. Capture is clean: `v2/src/features/capture/parse.js:72` and `:95` force German.
- **How it corrupts:** In the English UI, "Generate recipe" → Save → an English `name`/`ingredients` in `rezepte.json`. Its shopping items fall into "Aus Rezepten" and get keys that are not German ("ginger" ≠ "Ingwer").
- **How to confirm:** Generate a recipe in the English UI and inspect the `recipe` JSON.
- **Guard:** Have the model write the recipe JSON in German (only `intro`/`text` in the UI language), as capture already does. Effort S.

### DG-11 [P2] SCHEMA.md drift: the contract promises more safety than the code gives · confidence: high · evidence: E1/E2
- **Asset at risk:** Writer behavior of external writers (project-Claude, v1).
- **Where:** `SCHEMA.md` vs `v2/src/data/decideSync.js` and `v2/src/data/migrate.js`. Mismatches:
  - (a) `SCHEMA.md:181-182` says "Neuere `updated`-Marke gewinnt". In code, a clean device pulls whenever the stamps **differ**, including when the remote is older (`decideSync.js:37`).
  - (b) `SCHEMA.md:194` says "App neu öffnen → übernimmt". In code, sync runs only on a sign-in event (`v2/src/app.js:96`), so a resumed PWA does not pull.
  - (c) `SCHEMA.md:195-196` limits the overwrite risk to "nicht gepushte Änderungen mit neuerer Marke". In reality any app save, or the other device, overwrites (DG-01). The `conflict` state is not documented at all.
  - (d) `SCHEMA.md:170` says unknown fields pass through. True per recipe, but `serializeCollection` (`migrate.js:45-51`) drops **top-level** unknown keys and forces `version: 3` even on a v4 file. Probe: `future: version out 3 | top-level keys [version, updated, recipes]`.
  - (e) There is no contract for `einkaufsliste.json` (ids required, tombstones, `updated` per item), although any Drive-for-Desktop writer can reach it (see DG-04).
  - (f) The example id `r01` collides with a real recipe (DG-06).
- **Guard:** Update SCHEMA.md to match the code, or the code to match it. Refuse to save over `version > SCHEMA_VERSION`, and keep top-level keys (`{...collection, version, updated, recipes}`). Effort S.

### DG-12 [P3] Friend replay window: a crash between the list save and `patchInbox(seen)` double-counts a suggestion · confidence: high · evidence: E1
- **Where:** `v2/src/data/friendInbox.js:93-99` vs the comment at `:3` ("Abbruch dazwischen = harmlos").
- **How it corrupts:** The tab is killed after `applyExternal` saved but before `seen` was stored → the next pull applies the same suggestion again (qty +1).
- **Proof:** `re-pull before seen persisted: Ingwer qty 2`.
- **Guard:** Store `seen` before the list save (idempotent re-apply), or make the friend row id `fr-<uuid>` the dedupe key (skip if a row with that id exists). Effort S.

### DG-13 [P3] Deletion markers (tombstones) are pruned after 30 days, so a device offline longer brings deleted items back · confidence: high · evidence: E1
- **Where:** `v2/src/features/shopping/listMerge.js:38-41`.
- **Proof:** `device offline > 30 d syncs again -> resurrected: 1`.
- **Guard:** Keep tombstones until every known writer has synced past them (store `lastSync` per author), or don't let items older than the prune horizon revive. Effort M; low practical risk for two users.

### DG-14 [P3] A list file in an unexpected shape is silently overwritten with the local list · confidence: high · evidence: E1
- **Where:** `v2/src/data/listSync.js:92` (a non-array `items` → `[]`) and `:97-98`. There is no `version` check on `einkaufsliste.json`.
- **How it corrupts:** A future-format or hand-edited file (`{"version":2,"entries":[…]}`) → `writeRemote=true` → replaced by the local items.
- **Proof:** `items:null: writeRemote=true`.
- **Guard:** Write only if `remote.items` is an array and `remote.version <= 1`; otherwise show `error`. Effort S.

## Checked and refuted
- **Friend replay after `trimSeen`:** impossible today. The server caps open suggestions at 100 (`supabase/migrations/20261004182000_i3_friend_inbox.sql:145`) and `seen` keeps 300.
- **Script/HTML in a friend suggestion name:** `v2/add.html` renders with `textContent` (`:106`, `:193`), the app list escapes (`shopping.js:343` via `esc`), and the server caps names at 80 characters. Clean.
- **`addRecipe` id override:** `{id, ...fields}` would let a `fields.id` win, but every caller passes whitelisted objects (`ai/parse.js:59-97` `coerceRecipe`, `form.js:80-95`). There is no `id` key in any of them, so this is not reachable today.
- **`detail.js:90` / `:98` mutating `r.rating` / `r.favorite`:** these run after `updateRecipe` replaced the object, so they only touch an orphaned display object. Harmless.
- **Race between `syncWithDrive` and an edit during the network round trip:** it settles to the DG-01 outcome. There is no extra loss path.
- **Recipe-side "Ingwer" source:** recipes are never written into the list without an explicit "Zutaten auf die Liste" / plan action (`detail.js`, `planner.js` → `addItemsToList`). No background path adds recipe items.

## Invariants verified clean
- **Round trip on the real `rezepte.json`:** 105 recipes, 0 validation errors, 0 defaults added, 0 fields lost, 0 fields changed, `updated` kept, `toFileString` stable after load → save → load. Unknown **per-recipe** fields (e.g. `nutrition`) pass through.
- **Real `rezepte.json` ids:** no duplicates, none missing.
- **`makeIdFactory`:** 1000 calls in the same millisecond → 1000 unique ids, existing ids avoided.
- **List item ids:** `newItemId` (covered by an existing test) and `fr-<uuid>` friend ids don't collide.
- **Persistence wiring:** `store.persist()` is the only recipe persist path and passes `recipesDe` (`v2/src/store.js:62-65`). `listSync` never touches `rezepte.json`. `localizeRecipes` does not mutate. The language snapshots are only read for display.
- **Empty or truncated Drive file (recipes):** throws `SyntaxError` → local data kept, no write.
- **Capture flows:** recipe content is forced to German.
- **`decideSync` conflict rule:** it does not overwrite local data during sync. The loss happens later, at save time (DG-01).

## Definition drift
None in the agent file: every path it names exists. Fact correction for FR-01: Ingwer appears in **7** recipes (one as "Ingwerpulver" inside a merged line), not 6. The repo-root `rezepte.json` is untracked and from 2026-06-08, so it is a stale copy, not the live Drive state.

## Cross-lens notes
- → bug-hunter: `parseIngredient` turns `"½ TL gemahlene Nelken , 1 TL Ingwerpulver"` into one item (two ingredients on one line).
- → test-warden: these are untested:
  - the form edit path under a language overlay (DG-02);
  - `mergeList` with id-less items (DG-04);
  - `replaceAll` with an invalid key (DG-03);
  - `decideSync` with non-canonical stamps (DG-07);
  - `mergeItems` revival when a tombstone and a live twin exist (DG-08).
- → ux-curator: the conflict and validation states are only shown in a status line. "Offline — lokale Daten" is shown for a data error.

## Summary
P0: 3 · P1: 3 · P2: 5 · P3: 3 (14 findings).

The most valuable fixes are **DG-01** and **DG-02**. DG-01: a recipe save PATCHes Drive without reading it, so any recipe Claude adds is destroyed by the next ♥ on a device that hasn't re-pulled. DG-02: editing in English writes English into the German source. For FR-01, **DG-04** is the root cause, shown with E1 evidence. Fix it with deterministic ids for inbound items and a one-time dedupe.

## Verdict
**The data layer is not trustworthy today:** round-trips are clean, but external edits are blindly overwritten (DG-01), editing in a non-German UI persists translations (DG-02), and malformed inbound files can wipe or truncate the cookbook (DG-03, DG-05, DG-06). Fix DG-01 to DG-05 before relying on Claude-via-Drive or on more than one device.
