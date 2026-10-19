# Architect — findings (2026-10-12T16:32:15Z)
_Build 2026-10-04-v2.14 · CACHE koch-v2.14-1 · tests 215/215 · HEAD 70e8b9d · mode FULL_

Read: `01_ARCHITECTURE.md`, `SCHEMA.md`, `ROADMAP*.md` (incl. Marcel's uncommitted edits), `docs/v3/*` (grep),
`store.js`, `data/{sync,decideSync,listSync,friendInbox,supabase,migrate,schema,drive,baseLang,catalog}.js`,
`features/shopping/{logic,listMerge,friendMerge,shopping}.js`, `cookbook/{detail,form}.js`, `planner.js`,
`app.js`, `sw.js`, `add.html`, `ai/{client,gate}.js`, `supabase/migrations/20261004182000_i3_friend_inbox.sql`.
Probes (node, outside the repo, `%TEMP%/koch-ar/p1–p5.mjs`) against the pure modules + `rezepte.json` + bundled snapshots.

**Verdict up front.** The architecture is still slim, and the I3 friends link is well designed. Two
things are worse than my June report said, and I was wrong about both: (1) **recipe writes are blind
overwrites**, so `rezepte.json`'s external-writer contract is not safe, and (2) **the canonical-German
overlay leaks** through the edit form. FR-01 is mainly a **shopping-item identity** problem: the same
ingredient gets three different keys, and sync matches by random id. The roadmap's **P1 "one sync core"**
is the right slot to fix all of this, but only if it changes the merge model. Wrapping two engines in a
shared shell would not fix it (AR-01).

---

## Field reports

### FR-01 — "Ingwer gets added randomly and multiple times without selecting it" — structural side

**Verdict:** the code shows no path that adds Ingwer without a user action somewhere (recipe, plan,
catalog, friend, partner). From Marcel's side it still *looks* random: he picks recipes or a plan, not
Ingwer, and Ingwer gets split into rows that never merge. The structural cause is that **shopping-item
identity is undefined.** Four different "same item?" rules are in use:
- `itemKey(name, unit)`: name with qualifiers, unit-sensitive (`logic.js:50-52`)
- `id`: random, used by the sync union (`listMerge.js:8-17`)
- name-only, used by the catalog badge (`shopping.js:422`, `:457`)
- word-end match, used by `add.html` (`friendMerge.js:77-84`)

Ranked hypotheses (all E1 unless noted):

| # | Hypothesis | Evidence | Likelihood |
|---|-----------|----------|-----------|
| 1 | **Recipe or plan adds pull Ingwer in, and repeat adds pile up.** Ingwer is 🛒-marked in 6 of 105 recipes (`p1`): 5× `"1 Stück Ingwer 🛒"`, 1× `"1 Stück Ingwer, gerieben 🛒"`. Any "Plan → Einkaufsliste" or "Zutaten auf die Liste" containing one of them adds it. A second add of the same recipe or plan **sums** (`mergeItems`, `logic.js:127-128`). Probe: re-adding one recipe gives `2 Stück Ingwer`. Adds are not idempotent: `sources` is set on create but never merged on hit (`logic.js:126-132`), so the app cannot tell "already added for this plan". | p1, p2 | **high** |
| 2 | **Same ingredient, different keys → separate rows.** Recipe gives `ingwer\|stück` and `ingwer, gerieben\|stück`. The catalog tile gives `ingwer\|` (`shopAdd`, `shopping.js:73`). A friend's "Ingwer" gives `ingwer\|` (`friendMerge.js:41`). Probe: recipe + recipe(gerieben) + friend gives **3 live rows** (`1 Stück Ingwer`, `1 Stück Ingwer, gerieben`, `Ingwer`). The catalog badge matches name-only (`shopping.js:422`), so it can show a recipe row's qty while a tap creates yet another row. | p1, p2 | **high** |
| 3 | **Two devices (phone + laptop, or partner) add the same plan → two rows.** `mergeList` unions by random `id`. Probe: 2 independent adds of the same recipe give 2 rows after merge. | p2 | medium (only if a 2nd device or partner is active) |
| 4 | **Tombstone-first revival creates a second live row.** `mergeItems` revives the *first* same-key match even if it is a tombstone and a live same-key row exists later (`logic.js:123-125`). Probe: `[tomb A, live B] + Ingwer` gives A and B both live. Needs a tombstone and a live row with the same key, which hypothesis 3 produces. | p2 | low–medium |
| 5 | **Resurrection by a stale device after tombstone GC, or clock-skewed LWW.** A device that hasn't synced for more than 30 days re-pushes an item the others deleted and pruned (probe `H3b`). A partner phone's clock running ahead wins LWW over a later local delete. | p2 (H3b), E3 (skew) | low |

Refuted as causes: friend-inbox re-apply (`seen` + deterministic `fr-<uuid>` ids make re-pulls idempotent,
`friendMerge.js:36-37,50`), and the AR-09 sync loop (it re-reads but never adds items).

**Device check that settles it (5 min, read-only).** Open `einkaufsliste.json` in Drive, or
IndexedDB `lists/current` via `chrome://inspect`. Look at every Ingwer row:
- `sources: [...]` → came from a recipe or plan (#1)
- `author:"local"` without `sources` → catalog or custom entry (#2)
- `id` starting `fr-` → friend
- several Ingwer rows with different `id`s and similar `updated` → #2 or #3

Also ask Marcel: one row with a growing amount (→ #1), or several rows (→ #2/#3)?

**Structural fix:** AR-08. **Data side →** data-guardian: Ingwer is probably a pantry staple and should
lose 🛒 in 5–6 recipes. Line `r1749400081000` packs two ingredients into one string (parses as
`"gemahlene nelken , 1 tl ingwerpulver"`).

---

## Status of previous findings (report 2026-06-14, IDs assigned now)

| ID | Title | Status | Note |
|----|-------|--------|------|
| AR-01 | Generalise `sync.js` into a collection-agnostic core before the 2nd writer | ⏳ still open (re-scoped below) | The 2nd writer shipped **without** the core (`listSync.js`, v2.10/v2.11, aa55193). `decideSync` was extracted (K2) but `listSync` doesn't use it. The predicted drift happened: CR-02 (timestamp loop) and now AR-09. Roadmap P1/v2.15 adopted my June shape ("pluggable merge rule, recipes LWW"). **I revise that recommendation** (evidence: AR-07). |
| AR-02 | `drive.file` can't share across accounts → Picker + item-level merge | ✅ fixed (design) | Shipped v2.11 (aa55193): `openPickerForFile`, `listMerge`. Residual: never proven with two accounts. `GOOGLE_API_KEY = ""` (`drive.js:14`), roadmap P3 pending. |
| AR-03 | Canonical-German overlay is holding | ⏳ **reopened — my June verdict was wrong** | The edit-form path has leaked since v2.3 (731ace6). E1 proof below. |
| AR-04 | No-bundler fine for v2.x; add SHELL-coverage test | ✅ fixed (test) | `tests/test-sw-shell.js` (K4). The V3 position is carried forward in AR-04 below. |
| AR-05 | BYOK posture honest; write down "no third-party scripts" as a security invariant | ⏳ partially | Documented in `.planning/codebase/CONCERNS.md:66-70`. Not enforced: no CSP. `apis.google.com/js/api.js` was added in v2.11 (`drive.js:230`) next to GIS (`drive.js:75`). |
| AR-06 | Schema validation strict enough; surface `report.errors` | ⏳ **escalated — "strict enough" was wrong** | Per-recipe validation is fine. There is **no collection-level guard**: a structurally broken remote is pulled and wipes local (E1 below). `report.errors` is still console-only (`sync.js:97`). |

---

## New findings (and re-scoped carried ones), highest severity first

### AR-07 ADR-candidate: Recipe writes are blind overwrites — the external-writer contract is unsafe · horizon: now · P0 (data loss) · confidence high · E2
- **Context:** `saveCollection` writes the whole local array to Drive **without reading Drive first**
  (`sync.js:149-161` → `drive.js:165-171`, PATCH without precondition). Recipes only pull at boot or
  auth change (`app.js:96-103`). There is no `visibilitychange`/resume hook anywhere (grep: none). An
  installed PWA on Android resumes from the background without rebooting. `SCHEMA.md:10-13` tells
  project-Claude to edit `rezepte.json` in place, and the feedback loop (`SCHEMA.md:119-130`) is a
  documented daily flow. `decideSync` "conflict" (`decideSync.js:27-32`, `sync.js:114-121`) keeps local
  dirty but resolves nothing. The next local edit goes through `saveCollection` and overwrites anyway.
- **Risk if ignored:** Marcel writes feedback in the app → asks project-Claude to apply it → Claude
  edits the file → Marcel returns to the still-open app and taps ♥, ★ or "heute gekocht"
  (`cookbook.js:70`, `detail.js:90-176`). Claude's changes are silently erased. The only recovery is
  Drive revision history. This is live until G3 (v2.20) retires the external writer, and v1 can still
  write the file.
- **Options:**
  - A. **Pre-write freshness check** (S). Store the remote `modifiedTime`/`headRevisionId` on every
    read. In `saveCollection`, do one metadata GET first. If it changed, pull, re-apply the pending
    mutation, then write. Drive v3 has no If-Match for files, so this check is the closest substitute.
  - B. **Per-recipe 3-way merge** against a stored base (see AR-01). Solves it properly. L.
  - C. Pull on `visibilitychange` (S). Narrows the window but doesn't close it.
- **Recommendation:** **A + C now** (one small release, before P2/P1). Then B as the content of v2.15.
  Trade-off: one extra Drive GET per save, which is negligible.
- **Effort / blast radius:** S · `sync.js`, `app.js`, `drive.js` (metadata fields), +2 tests around
  `decideSync`.

### AR-06 ADR-candidate: No collection-level guard on inbound `rezepte.json` — a bad external write wipes the local copy · horizon: now · P1 · confidence high · E1
- **Context:** Probe `p3`, `loadCollection` + `decideSync` on clean local data with `source:"drive"`:
  - `{version, updated, "Rezepte":[…]}` (wrong key) → 0 recipes, 1 error, action **pull**
  - `{…, recipes:[]}` → 0 recipes, 0 errors, action **pull**
  - `recipes:[null, …]` → throws (caught; status shows the misleading "Offline")
  - A pull does `db.replaceAll("recipes", [])` (`sync.js:124-126`). The next boot sees an empty IDB,
    reseeds 105 base recipes from the snapshot with `source:"snapshot"`, and pulls the empty file again
    (`sync.js:48-66`, `decideSync.js:37`). Marcel's own recipes are gone from every device.
- **Risk if ignored:** one malformed project-Claude edit (wrong top-level key, truncated save) and the
  app destroys the last good local copy instead of protecting it.
- **Options:**
  - A. **Refuse to pull** a remote that fails `validateCollection` at collection level (no `recipes`
    array, or drops more than N% / all recipes that exist locally). Keep local, show a visible banner
    "Drive-Datei fehlerhaft — lokale Daten behalten". S.
  - B. A + keep a rolling local backup of the last good collection (IDB kv, one copy). S.
  - C. Make per-record merge (AR-01 B) the guard: a missing record is only a delete if the base had it
    and local didn't change it. M (comes with P1).
- **Recommendation:** **A + B now**, and surface `report.errors` in the UI (the June ask, still open).
  C follows from AR-01 anyway.
- **Effort / blast radius:** S · `sync.js`, `migrate.js` (export a `isStructurallySound`), tests.

### AR-03 ADR-candidate: Canonical-German overlay leaks through the edit form (reopened) · horizon: now (guard) / before-v2.21-P6 (structural) · P1 · confidence high · E1
- **Context:** `detail.js:32` passes the **localized view** recipe → `detail.js:169 openForm(r)` →
  form prefill from the view (`form.js:55-68`) → `updateRecipe(ed.id, x => Object.assign(x, fields))`
  (`form.js:101`) → written into `recipesDe` (`store.js:76-83`) → `persist()` → Drive. `store.js:68-71`
  even documents this as "selten". Probe `p5` with the real EN snapshot:
  - canonical name after one edit in English UI = `"Sweet Potato Curry with Chickpeas"`, steps English
  - **the edit is invisible afterwards**: `localizeRecipes` re-overlays the old snapshot text
    (`view shows edit? false`)
  - `test-canonical.js` only guards the `store.js` wiring, not this path.
- **Risk if ignored:** one edit in EN/ES/DA turns a base recipe English in the file shared with v1
  and project-Claude. German catalog and staples matching then degrades for that recipe. The user sees
  their edit "not saved". With P8 (English default UI, v2.21), every new user hits this on their first
  edit.
- **Options:**
  - A. Edit always opens `getRecipeDe(id)` with a note "Du bearbeitest das Original (Deutsch)". S.
    Honest, slightly odd UX.
  - B. Block content edits of base recipes in non-de UI until R6 (`forkedFrom` copy-on-edit). S.
  - C. Overlay staleness: lang snapshots carry a `srcHash` of the German fields. When the canonical
    content hash differs, the overlay is dropped for that recipe. Fixes the masked-edit symptom and
    the stale-translation-after-project-Claude-edit case. S–M. 💡 beyond-roadmap
- **Recommendation:** **A now** (plus a canonical test that drives the form path), **C** with P6/format
  4, where R6 copy-on-edit becomes the real answer. Under D8 (English canonical) the same bug flips
  direction, so the guard must be language-agnostic: "edit the canonical object, never the view".
- **Effort / blast radius:** S · `detail.js`, `form.js`, `test-canonical.js`.

### AR-01 ADR-candidate (carried, re-scoped): "One sync core" = per-record 3-way merge against a per-replica base, pluggable transport — not two strategies in one shell · horizon: before-v2.15-P1 · P1 · confidence high (recipes) / medium (list) · E2
- **Context:** Today there are two engines:
  - `sync.js`: file-level LWW via `decideSync`, blind writes (AR-07)
  - `listSync.js`: item union + tombstones, with its own file discovery, inflight guard and timestamp
    rules
  - Roadmap P1 / `docs/v3/04-OPTIONS.md:81` plans "one engine, pluggable merge rule (recipes LWW,
    list item-merge)". That was my June ADR.
  - Slice 1b (`ROADMAP-V3.md` §4) moves the **shared list onto Supabase** in v3.0.

  Three pieces of evidence change my call: (a) file-level LWW is the root cause of AR-07 and of the
  `conflict` dead-end; (b) tombstones need a GC horizon that no replica can know (AR-09); (c) the
  list's transport changes in v3.0. A shell that wraps two merge rules would keep (a) and (b) and only
  re-plumb the transport.
- **Risk if ignored:** v2.15 spends an L-sized refactor on unifying the *plumbing* while keeping both
  data-loss classes. Slice 1b then rewrites the list path anyway.
- **Options:**
  - A. Roadmap P1 as written (shared shell, file-LWW for recipes, item-merge for the list). L. Low
    behavioural risk, low payoff.
  - B. **Keyed-collection core with 3-way merge.** 💡 beyond-roadmap
    - Every replica stores a **base**: per record `id → hash` of the content it last saw on the hub.
      For recipes that is about 105 short entries.
    - Per record: changed only remotely → take remote; changed only locally → push local; both →
      local wins and the remote version is kept as a conflict copy (or field-merge later).
    - Deletions fall out of the base comparison: in base, missing remotely, unchanged locally →
      delete. So **no tombstones and no GC problem**. This works because the topology is a star with
      a single hub (git-with-a-central-remote).
    - It works with external writers that never stamp per-record timestamps (project-Claude, v1).
    - Transport is an adapter: `DriveFileTransport` today, `SupabaseRowsTransport` for slice 1b.
    - Shape: `createReplica({ key, store, transport, idOf, hashOf, mergeConflict })` →
      `{ load, mutate(fn), sync, onChange }`.
  - C. Do nothing structural: patch AR-07/AR-09 in place and move the list straight to Supabase in
    1b. S now, two engines through V3.
- **Recommendation:** **B.** Conviction is high for recipes, because it is the only option that makes
  the SCHEMA.md external-writer contract safe. For the list it is medium: honour existing tombstones
  during a one-release transition (treat `deleted:true` as delete, stop creating new ones). Trade-off:
  this is a behaviour change, not "no behaviour change visible", so the P1 done-criterion must change.
  P2 e2e tests are even more of a hard prerequisite. `mutate(fn)` as the only write path also closes
  AR-10. Plugs into C-7, D10 (the base/hash model maps 1:1 onto a backend table with `content_hash`)
  and US-08 (the weekly plan is a third keyed collection).
- **Effort / blast radius:** L · new `data/replica.js`; `sync.js`, `listSync.js`, `store.js`,
  `shopping.js` become thin; `decideSync.js` is retired or kept for first-run only; tests double.

### AR-08 ADR-candidate: Shopping item identity = canonical ingredient key, deterministic id · horizon: before-v2.15-P1 (key) / R1 (ingredient id) · P1 · confidence high · E1
- **Context:** FR-01 table above. The identity rules disagree (`logic.js:50`, `listMerge.js:10`,
  `shopping.js:73,422`, `friendMerge.js:41,77`). `ingMatchCat` already finds the catalog entry but
  returns only `{cat, icon}` (`catalog.js:84-91`). It also over-matches: `"Ingwerpulver"` → Ingwer
  (probe `p4`), so it can't serve as an identity function as-is.
- **Risk if ignored:** duplicate rows grow with every new input channel (partner, friends, AI capture,
  R5) and with the language switch (D8: names stop being German).
- **Options:**
  - A. **Patch the matchers** (S): unit-agnostic match, strip `, qualifier` and parentheses, prefer
    live over tombstone in `mergeItems`. Fixes single-device duplicates only; hypothesis 3 remains.
  - B. **Canonical key + deterministic id** (M):
    - `canonKey(name)` = catalog item name when a catalog entry matches on a **word boundary**
      (Ingwerpulver ≠ Ingwer), else the normalized head noun.
    - Item `id = "k-" + canonKey`, so independent adds on any device converge under any id-based merge.
    - Amounts become per-unit parts (`{Stück:1, g:20}`), shown as "1 Stück + 20 g Ingwer".
    - Recipe adds record `sources` per plan/recipe, so re-adding the same plan is a no-op instead
      of a sum.
    - Cost: a concurrent increment on two devices may collapse to one. For a shopping list that is
      the right failure.
    - One-time migration collapses existing duplicate rows.
  - C. **Derive, don't copy.** 💡 beyond-roadmap, speculative. Recipe- and plan-derived items are
    computed live from the current plan minus "bought" marks. Only manual, catalog and friend items
    are stored. Double-add and "Ingwer from last week's plan" vanish by construction.
    Cheap experiment: show a read-only "Für den Plan" section under the list for one release and see
    whether Marcel still uses "Plan → Einkaufsliste".
- **Recommendation:** **B now, keyed on a language-neutral key**, and make **R1 define the shopping
  key as the R2 ingredient id** with `canonKey` as the fallback for unmatched lines. That also makes it
  D8-safe. Write the "Ingwerpulver ≠ Ingwer" and "1 Stück Ingwer ≡ Ingwer, gerieben ≡ catalog Ingwer"
  fixtures first. Treat C as an experiment, not a commitment.
- **Effort / blast radius:** M · `logic.js`, `friendMerge.js`, `shopping.js`, `catalog.js` (+`canonKey`),
  migration in `listSync.js`, tests.

### AR-09 ADR-candidate: Tombstone GC fights the local re-merge → perpetual Drive polling, and pruning can resurrect · horizon: now · P2 · confidence high (logic) / medium (active on Marcel's phone) · E1
- **Context:** `syncStep` prunes tombstones older than 30 days from `merged` (`listMerge.js:55-57`).
  Then `doSync` re-merges `latest` (local, which still holds the tombstone) into `final`
  (`listSync.js:102-103`). Result: `stillDirty = !sameItems(final, merged)` is **always true**, so
  `schedulePush()` runs every 1.2 s, forever, while signed in (`listSync.js:106,112,123-126`).
  - Probe `p2/H3`: rounds 1–4 all `stillDirty=true`, and local never sheds the tombstone.
  - Probe `p2/H3b`: a device offline for more than 30 days re-uploads a pruned item as live.
  - Trigger: any local tombstone with `updated` older than 30 days. Tombstones have existed since
    v2.10 (June), and the loop logic since v2.11 (2026-10-01), so it is probably already running.
- **Risk if ignored:** continuous Drive GETs (battery, mobile data, API quota) and a `syncing↔synced`
  status flicker in the shopping card. Deleted items can come back from a stale device. Not a cause of
  FR-01.
- **Options:**
  - A. Prune locally too (apply `pruneTombstones` to `final`) and compute `stillDirty` after pruning. S.
    Fixes the loop, not resurrection.
  - B. A + prune only tombstones older than the slowest replica's `lastSync` (store per-device
    `lastSync` in the file). S–M.
  - C. Remove tombstones altogether via AR-01 B (base comparison). L, comes with P1.
- **Recommendation:** **A now** (one-line class of fix + test "two syncs in a row with an old tombstone
  are stable"), C with v2.15. Device confirm: Network panel shows repeated `files/<id>?alt=media` every
  1–2 s, or IDB `kv/listMeta.dirty` stays `true`.
- **Effort / blast radius:** S · `listSync.js`, `listMerge.js`, `test-list-sync.js`.
- → bug-hunter: same root cause, please confirm on a device.

### AR-10 ADR-candidate: The list row has three uncoordinated writers · horizon: before-v2.15-P1 · P2 · confidence medium · E2
- **Context:** The `lists/current` IDB row is read-modify-written by:
  - `shopping.js`: module-global `ITEMS`, whole-row `save()`, `:23,39-42`
  - `listSync.doSync`: reads `latest` at `:102`, writes `final` at `:105`
  - `listSync.applyExternal` (friends): `:147-153`
  - `shopping.js:149-150` starts `syncListWithDrive()` and `syncFriends()` concurrently on every mount.

  A write landing between `listSync.js:102` and `:105` is overwritten. Example: a friend import whose
  `seen` and `fl_ack` already ran, so the suggestion is permanently lost, or a tap in the list.
  `onChange` then replaces `ITEMS` (`shopping.js:135`), dropping the tap from the UI too.
- **Risk if ignored:** rare, unreproducible lost updates. They get worse with every new channel (R5
  capture → list, assistant → list).
- **Options:**
  - A. A serialized `mutateList(fn)` (promise chain) in `listSync`. `shopping.js` keeps no
    authoritative copy. S–M.
  - B. Fold into the AR-01 replica's `mutate(fn)`.
- **Recommendation:** **B** if v2.15 happens this quarter, otherwise A. Either way: **one module owns
  the row**.
- **Effort / blast radius:** S–M · `listSync.js`, `shopping.js`, `friendInbox.js`.

### AR-11 ADR-candidate: `einkaufsliste.json` is an unvalidated, undocumented contract — and a partner-file HTML injection · horizon: now (escape) / before-v2.x-P3 (contract) · P2 · confidence high · E2
- **Context:** `remote.items` is merged with no shape check (`listSync.js:91-94`).
  - Items without `id` all collapse onto key `undefined` (`listMerge.js:10-14`).
  - A non-string `name` crashes alpha sort (`shopping.js:359`).
  - **`it.icon` is rendered unescaped** (`shopping.js:342`); every other field goes through `esc()`.
  - The partner file is writable by the partner and anyone they share it with. Script in the page
    can read the BYOK key and the Drive token from `localStorage`.
  - `SCHEMA.md` doesn't mention `einkaufsliste.json` at all.
  - The *untrusted* channel (Supabase friend input) is clean: names are escaped, icon and cat are
    derived locally, and `add.html` is `textContent`-only. The *semi-trusted* channel is the hole.
- **Risk if ignored:** XSS via a shared Drive file. Malformed items from an older or foreign writer
  break the list view.
- **Options:**
  - A. `esc(it.icon)` + a `sanitizeItem` on inbound items (types, lengths, id required, icon ≤ 8 chars).
    S.
  - B. A + document the list format in `SCHEMA.md` (or `SCHEMA-LIST.md`) as a versioned contract. S.
- **Recommendation:** **B**, before the two-account proof (P3) puts a real second writer on the file.
- **Effort / blast radius:** S · `shopping.js`, `listSync.js`, `SCHEMA.md` (Marcel's call), test.

### AR-12 ADR-candidate: Supabase inbox — good pattern, but `fl_create` is an open capacity sink · horizon: before-V3 (P7 / slice 1b) · P2 · confidence high · E2
- **Context — well-architected:**
  - Drive stays truth; Supabase holds only the open-item snapshot and un-pulled suggestions.
  - The owner token is hashed server-side (`migration:39-41`).
  - The invite travels in the URL fragment (`friendMerge.js:86-95`).
  - Pull → save → `seen` → ack is crash-safe, with deterministic `fr-` ids.
  - Per-list limits: 100 open, 20/min, 80 chars (`migration:138-153`).
  - Exit path is cheap: if Supabase vanishes, only un-pulled suggestions are lost.

  **The gap:** `fl_create` is callable by anyone holding the publishable key, which is in the public
  repo (`supabase.js:7`). The only limit is a **global** cap of 500 lists (`migration:53`). `last_seen`
  is maintained but nothing ever deletes stale lists. One loop of 500 calls disables "Freunde-Link
  einschalten" for everyone, permanently. Lists of uninstalled apps also accumulate toward the cap.
- **Risk if ignored:** irrelevant at 1–2 users. Real at a public Play listing (V3).
- **Options:**
  - A. GC lists with `last_seen < now() - 90 days` inside `fl_create` (opportunistic) or via `pg_cron`.
    S.
  - B. A + move `fl_create` behind an Edge Function with per-IP rate limiting / Turnstile. M.
  - C. Accounts (D10 b) gate creation. L, v3.x.
- **Recommendation:** **A in P7 (v2.15b)**, B in slice 1b. Record the free-tier-pause decision in the
  same ADR. Note: the owner token lives on one device only. P5 already exports it; keep that.
- **Effort / blast radius:** S/M · new migration, optionally one Edge Function.

### AR-05 ADR-candidate (carried): Enforce the "no third-party script" invariant with a CSP · horizon: before-V3 · P3 · confidence medium · E2
- **Context:** No CSP in `index.html`. Two runtime-injected Google scripts, `accounts.google.com/gsi/client`
  (`drive.js:75`) and `apis.google.com/js/api.js` (`drive.js:230`, since v2.11), share the origin with
  the BYOK key and the OAuth token in `localStorage`. Logging is clean: only error objects, no keys or
  payloads (grep of `console.*`).
- **Recommendation:** add a meta CSP (`script-src 'self' accounts.google.com apis.google.com;
  connect-src 'self' *.googleapis.com api.anthropic.com *.supabase.co; frame-src docs.google.com
  accounts.google.com`). That turns the documented invariant into an enforced one before V3 adds
  surface (TWA, landing page). Options considered: B, IDB instead of `localStorage` for the key. That
  is no real gain against same-origin script, so rejected.
- **Effort / blast radius:** S · `index.html`, `add.html`. Verify Picker/GIS in the e2e suite (P2).

### AR-04 ADR-candidate (carried): No-bundler through v3.0 — add a *generator*, not a bundler · horizon: before-V3 (slice 6) · P3 · confidence high · E1
- **Context:**
  - 50 modules (`find src -name '*.js'` = 50), all hand-listed in `SHELL`, guarded by
    `test-sw-shell.js`.
  - The `CACHE` bump is manual.
  - Every bump re-downloads the full shell plus **664 KB** of snapshots (`du`).
  - Lang snapshots are full recipe copies (≈1.65 KB/recipe, 15 keys each, probe `p5`), but only 4
    fields are used (`baseLang.js:16`).
- **Recommendation:** keep source-runs-as-is (hand-editability is still worth it). Add one committed
  `tools/gen-shell.mjs` that writes `SHELL` and a content-hash `CACHE` (roadmap slice 6 "generated SW
  precache list"). Shrink lang snapshots to overlay-only `{id, srcHash, name, ingredients, steps, tips}`
  (about −60%, and it enables AR-03 C). A real bundler only if the TWA spike (C-1) demands it. It
  won't for a static PWA.
- **Effort / blast radius:** S–M · `tools/`, `sw.js`, `tools/build-snapshots.mjs`, `baseLang.js`.

---

## Checked and refuted
- **Friend inbox double-applies suggestions** → no: `seen` is saved before `fl_ack`, ids are
  deterministic `fr-<uuid>`, and `applyFriendItems` skips seen ids (`friendMerge.js:36-37`,
  `friendInbox.js:93-100`).
- **AR-09 loop adds items** → no: the loop only re-reads and re-merges, `changeListeners` don't fire.
- **XSS from friend input** → no: `add.html` uses `textContent` throughout (`add.html:106-199`). In the
  app, name/author are `esc()`'d and icon/cat are derived from the local catalog.
- **AI client logs keys or payloads** → no: `client.js` has no `console.*`, only `x-api-key` to
  `api.anthropic.com`.
- **Catalog icons unescaped (`shopping.js:424,443`)** → static constants from `catalog.js`, not an
  injection path.
- **`ensureItemMeta` mints new ids repeatedly** → no: it persists once in `loadLocalList`
  (`listSync.js:46-47`).

## Verified clean
- `decideSync.js` pure and tested. `listMerge`/`friendMerge` pure.
- I3 token model: hash at rest, fragment invite, RLS with no policies, definer functions token-checked
  first, `_fl_owner` revoked from anon.
- `add.html` DOM construction.
- SW: never caches Google auth/Drive, Supabase or Anthropic (`sw.js` fetch handler: cross-origin
  passthrough).
- SHELL coverage test present.
- BYOK storage/transport unchanged since June.

## Forward map — if you only do three structural things before V3
1. **Make recipe sync safe before anything else (AR-07 + AR-06).** One small release: freshness check
   before every Drive write, pull on resume, refuse to pull a structurally broken file, keep one local
   backup. It is S effort and it closes the only P0 in the system. Do it *before* P2/P1, because the
   external-writer contract is live today.
2. **Redefine v2.15 "one sync core" as a keyed-collection replica with 3-way merge against a
   per-replica base and a pluggable transport (AR-01 B), with `mutate(fn)` as the only write path
   (AR-10).** It removes blind overwrites, tombstone GC (AR-09) and the `conflict` dead-end, and it
   maps 1:1 onto the slice-1b Supabase table. Change the P1 done-criterion from "no behaviour change"
   to "no data lost in the two-writer scenarios".
3. **Give items one identity (AR-08), and give it to R1.** Shopping key = R2 ingredient id, with
   word-boundary `canonKey` fallback, deterministic item ids, idempotent recipe/plan adds. The same
   language-neutral identity carries D8 (English canonical) and fixes FR-01 for good. Close the
   overlay leak (AR-03 A) in the same pass, because it is the same "edit the canonical object, never
   the view" rule.

## Cross-lens notes
- → bug-hunter: AR-09 perpetual `schedulePush` loop (`listSync.js:106-112`). Confirm on device.
- → data-guardian: Ingwer 🛒 in 6 recipes (staple?). `r1749400081000` has two ingredients in one line.
- → test-warden: no test drives the edit form under a non-de overlay (`test-canonical.js`). No
  "two syncs with an old tombstone are stable" test. No collection-level malformed-remote test for
  `sync.js`.
- → ux-curator: the catalog badge shows the qty of a different row than the one a tap increments
  (`shopping.js:422` vs `:73`). The edit-in-English "nothing saved" symptom (AR-03).

## Definition drift
`01_ARCHITECTURE.md` still describes a single-file app with `updatedAt` LWW: no list file, no Supabase,
no tab bar. Agent file: "~50 modules" ✓ (50). Otherwise none.

## Summary
- **ADR count:** 11. By horizon: **now 5** (AR-07, AR-06, AR-03, AR-09, AR-11) · **before-v2.15-P1 3**
  (AR-01, AR-08, AR-10) · **before-V3 3** (AR-12, AR-05, AR-04). AR-03 and AR-11 also have a later
  structural step; AR-08 has an optional S patch (option A) usable now.
- **By severity:** P0 1 (AR-07) · P1 4 (AR-06, AR-03, AR-01, AR-08) · P2 4 (AR-09, AR-10, AR-11, AR-12)
  · P3 2 (AR-05, AR-04).
- **Previous findings:** 2 ✅ (AR-02 design, AR-04 test), 4 ⏳ (AR-01 re-scoped, AR-03 and AR-06 reopened
  as wrong verdicts, AR-05 partial).
- **Most valuable single item:** AR-07. `saveCollection` overwrites Drive blind (`sync.js:149-161`), and
  there is no resume pull, so a project-Claude edit is erased by the next ♥ tap in a backgrounded app.
