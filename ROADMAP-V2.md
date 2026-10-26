# 🍳 Koch — V2 Roadmap (v2.x)

> **Scope of this file:** every release on the **v2.x line**, from today until V3 launches and v2
> becomes the 30-day fallback. Features and the foundation V3 needs ship here.
> **Not here:** domain, Play Store, onboarding tour, default photos, clean-up, anything after
> v3.0 → see **[ROADMAP-V3.md](ROADMAP-V3.md)**. What to do next → **[ROADMAP.md](ROADMAP.md)**.
>
> Owner: Marcel · Maintained by Claude Code · **Last updated: 2026-10-26** (QA fleet findings of
> 2026-10-12 placed as Epic T; v2.15.2 merged, v2.15.3 built) · Current build: **v2.15.3** (`/v2`, 324 unit tests + 36
> end-to-end tests in `v2/e2e/`; v2.15.2 merged with PR #12 on 2026-10-26).

---

## 1. The boundary rule (V2 vs V3)

An item belongs to **V2** if it can ship on today's address and architecture **and** carries over
into V3 unchanged. It belongs to **V3** if it needs the new domain, the Play build, the clean-up,
or is explicitly scheduled after v3.0 by Marcel's answers (`docs/v3/03-QUESTIONS.md`).

After the **scope freeze (31 Dec 2026)** the V2 list does not grow with new features: new ideas go
to `ROADMAP-V3.md` tagged v3.x. Bug fixes always go to V2 as long as v2 is the live app.

**Markers used below**
- **Pri** P0 blocks daily use · P1 high value, asked for · P2 wanted · P3 nice-to-have
- **Eff** S < ½ day · M ½–2 days · L multi-day
- **(proposed)** placed by Claude during the 2026-10-04 split; Marcel never decided it explicitly.
  Confirm or move it, then remove the marker.

---

## 2. Version plan (draft)

One release ≈ one 2–3 h test session for Marcel. Dates are targets, not promises. The three
**gate** items (★) must land before V3 slice 1; everything after them can run in parallel to the
V3 slices in Q1 2027 if time is short (risk R19).

| Version | Theme | Items | Target | Status | Blocked by |
|---------|-------|-------|--------|--------|------------|
| **v2.14** | Friends link | I3 | 4 Oct 2026 | ✅ live (PR #8 merged 4 Oct) · live test open (P4) | — |
| — (no release) | ★ Safety net | P2 end-to-end tests | mid Oct | ✅ 12 Oct | — |
| **v2.14.1** | Hotfix (found by P2) | Settings listeners broke every later save | 12 Oct | ✅ live (PR #9, 19 Oct) | — |
| **v2.15** | ★ One sync core | P1 | late Oct | ✅ built 19 Oct · deploy = merge | — |
| **v2.15.1** | 🔴 Hotfix: safe recipe sync | T1 · T2 · T3 · T11 (+ T12 core, T8 recipe tests) | Oct | ✅ merged 19 Oct (PR #11) | — |
| **v2.15.2** | 🔴 Hotfix: shopping list data safety (FR-01 root cause) | T4 · T7 · T10 + their T8 tests | Oct | ✅ merged 26 Oct (PR #12) | — |
| **v2.15.3** | Shopping list: one identity rule + Lager beats 🛒 (FR-01 duplicates) | T5 · T6 + their T8 tests | Oct/Nov | ✅ built 26 Oct · deploy = merge | ✅ Marcel: T5 yes, T6 yes (26 Oct) |
| **v2.16b** | Shopping list clarity | T9 | Nov | proposed | v2.15.3 |
| **v2.15b** | Backend hardening | P7 (migrations in repo, advisor check, pause/backup plan) | Nov | planned | D10 for the final scope |
| — (Marcel) | ★ Sharing proof | P3 two-account test, P4 live friend test | Oct | open since v2.11 | Picker key + partner as test user |
| **v2.16** | AI housekeeping | Q1 Sonnet 5.5 capture + model config · Q2 prompt caching · Q3 token measurement | early Nov | planned | — |
| **v2.17** | Find recipes faster | F4 (all of a–f, incl. ingredient search) | mid Nov | planned | G7 ✅ answered |
| **v2.18** | Recipe export / import | G2 | late Nov | planned | — |
| — (no release) | ★ Data-model spike | R1 ingredient model + unit spec + format-4 design (shared with P6, P7, D10) | Nov, before format 4 is frozen | proposed | — |
| **v2.19** | Ingredient master + calories | R2 → R3 → L2 → L3 (L1 resolved by R2, proposed) | Dec | planned (grows to L; split if needed) | R1 |
| **v2.19b** | Structured recipe editor + capture | R4 · R5 · R6 | Jan 2027 | proposed | R2, R3 |
| — | **Scope freeze** | no new v2 features after this | **31 Dec 2026** | — | — |
| **v2.20** | Assistant: edits recipes + editable instructions | G3 · Q4 | Jan 2027 | planned | E6 ✅, A11 ✅ answered |
| **v2.21** | Move to the new app + English | P5 · P6 (format 4 incl. R1 fields) · P8 | Jan 2027, **before the domain switch** | planned | C-20 ✅ same repo, D8 ✅ English |
| **v2.22+** | Small wins *(proposed)* | M1–M3, E3, QW-2, QW-4, QW-6 | Q1 2027, only if time | backlog | L2 for M1–M3 |
| v2.x final | Fallback | fixes only, then read-only for 30 days after v3.0 | May 2027 | — | V3 launch |

**Versioning rules:** `v2.N` per release (`BUILD` = `YYYY-MM-DD-v2.N`, SW `CACHE` = `koch-v2.N-1`);
hotfix = `v2.N.1`; test-only or doc-only work gets **no** version bump. Every release: changelog
line in `v2/src/version.js`, both roadmap files updated (see `ROADMAP.md` → update rule).

---

## 3. Open items

### Epic T — Trust & data safety *(QA fleet run 2026-10-12 — fixes in the live app, comes first)*

Source: [`qa/FLEET-REPORT.md`](qa/FLEET-REPORT.md). IDs in brackets point to `qa/findings/*.md`
(BH bug-hunter · DG data-guardian · AR architect · TW test-warden · SI simplifier · UX ux-curator ·
RC release-captain). Field report **FR-01** = Marcel's "Ingwer appears by itself" (`qa/FIELD-REPORTS.md`).
Every item ships with the regression tests named in its finding; test-warden's cases are the
acceptance tests. **Why first:** recipe sync can erase in-project Claude's edits today, and that
breaks the original requirement #3 ("Claude updates the data").

**v2.15.1 — safe recipe sync** — ✅ built 2026-10-19 (deploy = merge). *Split decided 2026-10-19:* Epic T
ships as **three** small builds instead of two — v2.15.1 recipes, v2.15.2 list data safety (no
decisions needed), v2.15.3 list identity + Lager rules (needs Marcel's two confirmations). One build
= one test session (rule 5); the recipe and list fixes touch different code and need different
phone tests.

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **T1** | ✅ **Read before every recipe write + re-sync on resume** (DG-01 = AR-07) — *v2.15.1: every save is a queued change on the current IndexedDB state + a sync (read → validate → per-recipe three-way merge against a stored base → write); `visibilitychange`/`online` → sync. Tests: `test-sync-core.js`, `test-recipe-merge.js`, e2e 08.* | Saving uploads the whole collection to Drive without reading it — still true after v2.15: `pushCollection` in `v2/src/data/syncRules.js` ("lokalen Stand blind hochladen"), called from `sync.js` `saveCollection` — and nothing re-syncs when the app returns from the background. An edit by project-Claude, v1 or the other device is erased by the next ♥/rating/edit. Fix: make the save step read → `decideSync` → write inside the v2.15 engine queue (`syncCore.js`); `visibilitychange`/`online` → sync. **Done:** probe "Claude adds a recipe, app taps ♥" keeps both; tests for the save path. | **P0** | M | v2.15.1 |
| **T2** | ✅ **Refuse broken inbound files + keep one local backup** (DG-05 = AR-06, DG-03, DG-06) — *v2.15.1: `recipeMerge.inspectRemote` refuses non-objects / no `recipes` / version > 3 (status „Drive-Datei fehlerhaft — lokale Daten behalten“, no write-back); rescues null / missing / duplicate ids; asks before a merge drops > 3 and > 20 % of recipes; one backup (`kv recipesBackup`) before local data is replaced; `db.replaceAll` is all-or-nothing.* | `{}`, `null`, `recipes` not an array, a recipe without `id`, or a duplicate id from an external writer currently wipes or shrinks the local cookbook (probe: 105 → 40) and can push that back to Drive while showing "Synchronisiert ✓". Fix: validate the whole collection before replacing local data, rescue/flag bad recipes, never pull a file that would drop recipes without asking, keep the last good copy in IndexedDB. **Done:** each malformed shape from DG-05 has a test that keeps local data and surfaces an error. | **P0** | M | v2.15.1 |
| **T3** | ✅ **Edit form writes German, never the translation** (DG-02 = AR-03, DG-10) — *v2.15.1: ✎ opens `getRecipeDe(id)` with a note in non-German UI; assistant recipe JSON is always German. Tests: `test-canonical.js` (3 cases), e2e 02 edits in Spanish.* | Editing a recipe with the UI in EN/DA/ES copies the translated text into the German Drive file (`detail.js` → `openForm(r)` with the localized recipe → `form.js` assigns every field). Assistant-generated recipes are also saved in the UI language. Fix: open the form with `getRecipeDe(id)` (or write back only changed fields); tag AI recipes with their language. **Done:** `test-canonical.js` gets an edit-in-English case. *P0 if Marcel uses a non-German UI, otherwise P1.* | P1 | S | v2.15.1 |
| **T11** | ✅ **Contract + doc fixes** (DG-11, DG-06, DG-07, RC-01) — *v2.15.1: `SCHEMA.md` sync section rewritten (merge, refusal, repair, top-level keys not kept), placeholder example id, stamp format; `sw.js` comment on `add.html`; `01_ARCHITECTURE.md` §2 + §5 refreshed.* | `SCHEMA.md` promises more safety than the code gives (fix after T1/T2); example id `r01` is a real recipe id → use a clearly fake one; document the `updated` stamp format; one comment in `v2/sw.js` that `add.html` is deliberately outside the precache. Also refresh `01_ARCHITECTURE.md` (still describes the single-file app). | P2 | S | v2.15.1 |

**v2.15.2 — shopping list data safety (T4, T7, T10)** · **v2.15.3 — identity + Lager rules (T5, T6)** — FR-01
*(T8's tests ship with the item they guard; the T1/T2 e2e cases already shipped in v2.15.1.)*

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **T4** | ✅ **Id-less list items must not multiply** (DG-04 — main cause of FR-01) — *v2.15.2: items without `id` (in the Drive file or a stale local copy) get `li-x-<hash of name + unit>` with the oldest possible stamp; the copies the old bug made (same name/unit/amount/aisle/sources, other id) are collapsed once into that row (state of the last-changed copy, the rest become tombstones so the partner gets them too); repaired file written back once. Tests: `test-list-file.js` (5 syncs → 1 row, delete sticks, Marcel's "original + 4 copies" state, 3 id-less items all kept), `test-sync-core.js` (two devices), e2e 07.* | Builds before v2.11 wrote list items without `id` to `einkaufsliste.json`. Every list sync (`listSync.loadLocalList` → `ensureItemMeta`, merge in `syncRules.itemMerge`, unchanged by v2.15) gives that item a fresh local id while the id-less original stays on Drive → **one more live row per sync**, deletes don't stick, and other id-less items are silently dropped. Fix: remote items without `id` get a deterministic id (hash of name + unit) and the file is written back once. **Done:** probe "5 syncs" stays at 1 row; delete sticks. | **P1** | S | v2.15.2 |
| **T5** | ✅ **One "same item?" rule for the whole list** (BH-05 = DG-09 = SI-04 = SI-05 = AR-08, BH-06 = UX-11, BH-07 = DG-08, BH-08, BH-10, SI-06) — *v2.15.3 (Marcel: yes): `logic.sameKey` = name without prep note („, gerieben“) and brackets, unit-agnostic, singular = plural for catalog items; `findSame` (live before tombstone) used by `shopAdd`, `mergeItems`, `applyFriendItems` and the tile badge; other units ride in the same row (`more`: „200g + 2 EL Joghurt“); after every list sync, open rows of the same item from two devices fold into the smaller id (BH-08); friend replay can't duplicate a `fr-` row (DG-12); one `addRecipesToList` for detail + planner with an in-flight guard (SI-06, BH-10); AR-10: list writes are atomic merges in IndexedDB (`db.update`). Tests: `tests/test-shopping-identity.js`, e2e 06 + 07.* | Seven places decide differently whether two rows are the same item: "Ingwer, gerieben"/Stück, "Ingwer"/Stück and the catalog tile "Ingwer" become three rows; the tile badge reads a different row than the tap writes to; adding revives a deleted twin next to a live one; the same item added on two devices stays doubled; pressing "Zutaten auf die Liste" twice doubles everything. Fix: one shared predicate with a canonical key — name without prep note, unit-agnostic, live rows before tombstones — used by `shopAdd`, `mergeItems`, `applyFriendItems` and the badge (also settles the three uncoordinated row writers, AR-10); one shared "aggregate + add" helper for detail and planner with an in-flight guard. *(proposed: a tile tap merges into an existing same-name row — Marcel confirms)* **Done:** `tests/test-shopping-identity.js` (TW-09, TW-10, `FR01.*`) green. | **P1** | M | v2.15.2 |
| **T6** | ✅ **Lager applies to 🛒 lines too** (BH-04, BH-09) — *v2.15.3 (Marcel: yes): `needsBuying` checks the Lager (pantry on + fridge) first, on whole words (no „Ei“ in „Reis“, no „Ingwer“ in „Ingwerpulver“); the always-there basics (Öl, Salz …) still only apply to unmarked lines. Two-in-one lines are split at „, <amount>“ when the list is built (`splitLine`), which covers the Gewürzkuchen line and the 29 other comma lines in the base recipes without editing recipe data. Tests: `test-shopping-identity.js`, e2e 06.* | `needsBuying` returns "buy" for every 🛒 line before checking the Lager, so in 82 of 105 recipes items marked in stock are still added (Ingwer is 🛒 in 6 recipes; ~75 % of random weekly plans contain one). Fix: an in-stock Lager item skips the line even with 🛒. *(proposed — changes the 🛒 meaning from "always buy" to "buy unless in stock"; Marcel confirms)*. Also split the merged "Nelken … Ingwerpulver" line in the Gewürzkuchen recipe (`r1749400081000`) and scan the base recipes for other two-in-one lines. | **P1** | S | v2.15.2 |
| **T7** | ✅ **Tombstone clean-up must not fight the merge** (AR-09 = TW-12 = DG-13 = BH-11) — *v2.15.2: the re-merge after the round trip is pruned too (no more endless "dirty" → push every 1.2 s); the file carries `prunedBefore`, and a device that already synced this file drops local items missing from it and older than that line (first contact with a file, e.g. linking a partner list, keeps everything). Tests: `test-list-file.js`, `test-sync-core.js`.* | After a deleted item is 30+ days old the list stays "dirty" forever and re-reads Drive every ~1.2 s while the tab is open; a device offline 30+ days brings deleted rows back. Fix: prune only after the merge result is final, and treat a missing tombstone from a long-offline device as unknown, not alive. | P2 | S | v2.15.2 |
| **T8** | ◐ **Regression tests for list + friend I/O** (TW-06…TW-14, DG-12, DG-14) — *shipped with their items: recipe cases in v2.15.1; T4/T7/T10 cases in v2.15.2 (`test-list-file.js`, list block of `test-sync-core.js`, e2e 07); identity cases TW-09, TW-10, all `FR01.*`, friend replay DG-12 and the real-recipe smoke test TW-13 in v2.15.3 (`test-shopping-identity.js`, e2e 06/07). Left (low): TW-07 `toFileString` clock, TW-08 `extractJson` edge inputs, TW-14 `friendInbox` ack order — fold into the next release that touches those files.* | Pure tests for item identity, tombstone order, friend replay (duplicate `fr-` id), `parseIngredient` on real lines; extract the testable parts of `listSync`/`friendInbox` (TW-14) so their I/O decisions are covered; prove the list sync never touches the recipe file (TW-06); two small low-risk cases (TW-07 `toFileString` clock, TW-08 `extractJson` edge inputs). Add e2e specs in `v2/e2e/` for what unit tests can't reach (TW-05, TW-14): external Drive edit + app in background + ♥ (T1), malformed `rezepte.json` (T2), repeated list syncs with a legacy id-less item (T4). | P1 | S | v2.15.2 |
| **T10** | ✅ **Escape + validate the partner list file** (AR-11, DG-14) — *v2.15.2: `v2/src/data/listFile.js` refuses non-objects / broken JSON / no `items` array / `version` > 1 (new status „unbekanntes Format — lokale Liste behalten“, no write-back) and repairs item fields (types, lengths, HTML-length icons); `esc()` on icon, qty and catalog icon; A–Z sort survives non-text names; format documented in `SCHEMA.md` → „einkaufsliste.json“. Tests: `test-list-file.js`, `test-sync-core.js`, e2e 07.* | A partner's `einkaufsliste.json` is rendered without validation, which is an HTML-injection path, and a file in an unexpected shape is silently overwritten with the local list. Fix: validate items on read, `esc()` every field, document the list format next to `SCHEMA.md`. | P1 | S | v2.15.2 |

**Follow-up to v2.15 (one sync core)**

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **T12** | ◐ **Three-way merge rule for recipes** *(QA AR-01)* — *core shipped with T1 in v2.15.1: a safe "read before write" needs a base anyway, so the per-recipe three-way rule IS the T1 fix (both-sides-offline test green). Left: reuse for the Supabase transport (V3 slice 1b).* | P1 shipped as one engine with file-level last-write-wins. The architect's point still holds: LWW plus a blind save can't keep two writers' edits. Since rules are now pluggable (`syncRules.js`), add a per-recipe three-way rule (each device compares against what it last saw on Drive) and use it for `rezepte.json`; same rule later serves the Supabase transport (V3 slice 1b). T1 is the minimal fix; T12 is the durable one. **Done:** two-device tests in `test-sync-core.js` where both sides edit different recipes offline → both edits survive. | P2 | M–L | before V3 slice 1b |

**v2.16b — shopping list clarity** *(proposed)*

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **T9** | **Show why an item is on the list + safer taps** (UX-10, UX-12, UX-13, UX-14, UX-15) | Origin on every row ("aus 3 Rezepten", "von Anna", "Plan", "Partner"); friend/partner imports announced even when the tab is closed; "+1 → Ingwer ×3 · Rückgängig" snackbar instead of a silent badge; undo for single delete and "Erledigte löschen", ✕ moved away from +; replace the native `confirm()` after "add to list" with a summary sheet; stop the catalog grid from shifting under the finger (**live check on a phone first**, UX-12). | P2 | M | v2.16b |

### Epic P — Path to V3: foundation & proof *(gates V3 slice 1)*

From `docs/v3/02-SCOPE.md`: "Must land in v2.x before slice 1: partner-sharing proof, one sync
core, end-to-end tests."

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **P1** | ✅ **One sync core** (check C-7, US-22) — *2026-10-19, v2.15* | One engine behind recipes (file-level last-write-wins + `decideSync`) and the shopping list (item merge + tombstones). The friend inbox (I3) stays its own channel. **Done:** both instances pass the full existing suite plus new two-instance tests; no behaviour change visible to the user; e2e specs 07 + 08 green. Also fix the race P2 found: linking the partner list while a push is in flight silently loses the link. → `v2/src/data/syncCore.js` (engine: queue, single-flight, atomic meta patches, find/create/read/write, status) + `syncRules.js` (`lastWriteWins`, `itemMerge`); `sync.js` / `listSync.js` are now configuration. 20 two-device tests in `v2/tests/test-sync-core.js`. Link race fixed (known-bug test now a regression test); also: a save made during a running pull is no longer overwritten. A third file (shared weekly plan, C-28) = one more rule. | P1 | L | ✅ |
| **P2** | ✅ **End-to-end browser tests** (check C-13) — *2026-10-12* | Playwright, dev-only (nothing ships to users). Flows: first run, language switch, add/edit recipe, capture review, cooking mode, shopping list, partner sync, offline start, update from previous build; planner → shopping at lower priority. **Done:** suite runs locally with one command and is green on the current build. → `v2/e2e/` (`npm --prefix v2/e2e test`), 11 specs / 27 tests (one pins a known bug for P1), fake Google + Drive + Picker + Anthropic, no network. Found and fixed the v2.14.1 bug on its first run. | P1 | L | ✅ |
| **P3** | **Two-account sharing proof** (US-06) — *Marcel* | The I2 test with your partner, steps in `v2/docs/SHARING.md`. Needs first: Google Picker API key in `drive.js` + partner added as OAuth test user. **Done:** two real accounts, Android + iPhone, both edit offline, no item lost. | P1 | S | Oct |
| **P4** | **Friends link live test** (I3) — *Marcel* | ✅ PR #8 merged 2026-10-04. Open the live app, create a link, a real friend adds an item from their phone. **Done:** item arrives with "von …" after reopening. Watch: Supabase free projects pause after ~7 days without traffic. | P1 | S | Oct |
| **P5** | **"Move to the new app" helper** (US-04, risk R13) | Exports browser-only data (stock, fridge, profile, settings, **friends-link owner token**) before the domain switch; warns about unsynced edits; tells the user the AI key must be re-entered. **Done:** export on old address → import on new address restores everything except the key. | P1 | M | v2.21 |
| **P6** | **v2 reads file format 4** (check C-27) — *D8 = English stored data, decided 2026-10-04* | A v2.x release that can read the new format **before** V3 writes it, so the 30-day fallback keeps working. Language-neutral category keys; German/Danish/Spanish become display translations. | P1 | M | v2.21 |
| **P7** | **Backend hardening** (D9; check C-30) | I3 already runs on Supabase. Bring it to production standard on today's app: schema as migration files in the repo, dev/prod separation, row-level security + Supabase security advisor clean, secrets review, decision *free + keep-alive* vs *Pro $25/mo* (free pauses after 1 week, no backups), restore tested. From the QA fleet: `fl_create` is an open capacity sink — anyone can fill the 500-list cap (AR-12, add a rate limit / proof of origin); close the crash window between the local save and remembering `seen` (DG-12). **Done:** a fresh project can be rebuilt from the repo; ADR written. | P1 | M | v2.15b |
| **P8** | **English as the default interface** (D8a) | New users see English first; DE/DA/ES stay selectable; existing users keep their choice. Docs/Guide copy checked; remaining hardcoded German strings in UI paths moved into i18n (QA UX-06). **Done:** first-run e2e test in English. | P1 | S | v2.21 |

### Epic R — Ingredient model & recipe ownership *(Marcel's rethink, 2026-10-05; placed in v2.x by Marcel)*

**Idea:** a recipe is a list of references to a master ingredient list (name in 4 languages, base unit, unit conversions, nutrition per 100 g), not free text. Edit a shared recipe → your own copy (`forkedFrom`); personal state (favourite, rating, cooked count, last cooked, notes, photos) is **not** part of the recipe content and never causes a copy. No backend needed for this epic; it prepares the data model for accounts and recipe sharing later (D10/D11 in `ROADMAP-V3.md`).

**Unit rule (to be fixed in R1):** every ingredient has a base unit (g · ml · piece) and its own conversion table (1 EL oil ≈ 14 g, 1 EL honey ≈ 21 g, 1 onion ≈ 80 g). A recipe line is `{ingredient, amount, unit, prep, note}`. Grams/ml are the stored truth, the display unit is kept ("1 Dose (400 g)" = 400 g, unit "can"). Explicit rules for pinch, to taste, bunch. Anything unmatched stays a free-text line without nutrition.

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **R1** | **Data-model spike + unit spec** *(proposed)* | Written spec: ingredient record, unit table, recipe line, `origin` (base · user · shared), `forkedFrom`, personal state kept separate, how it fits file format 4 (P6) so there is **one** migration, not two. Checked against 10 real recipes incl. "double unit" cases. Verify how base recipes reach a new user's file today. **Done:** spec in `docs/v3/adr/`, Marcel signs off. | P1 | M | Nov |
| **R2** | **Ingredient master** (~300 to start) | `ingredients.json`: id, names DE/EN/ES/DA, base unit, conversions, per-100 g kcal/protein/carbs/fat, source (USDA/Frida, licence noted — C-18). AI-drafted, Marcel reviews. Replaces the L2 "nutrient table". | P1 | M–L | v2.19 |
| **R3** | **Structured ingredient items, additive** | New optional `items[]` beside the existing `ingredients` strings; a matcher fills it from the strings, unmatched stay free text. `SCHEMA.md` + round-trip + canonical tests. v2 and the fallback keep working. G2 export/import carries `items`. | P1 | M–L | v2.19 |
| **R4** | **Recipe editor with ingredient picker** | Type-ahead over the master, amount + unit, free-text fallback always available; recipe form stays usable without picking. Cooking mode scales by amounts. | P1 | L | v2.19b |
| **R5** | **Capture and AI map to the master** | Photo/URL/AI recipes arrive as structured items with a "not matched" list for review; capture check re-run on 10 real samples (like Q1). | P1 | M | v2.19b |
| **R6** | **Ownership fields + personal-state split** | `origin` (base · user · shared) and `forkedFrom`; editing a base recipe's content creates a user copy, favourites/notes never do. Gives G3 its delete guard. | P1 | S–M | v2.19b |

Risk: this is the biggest data change before V3. Cut order if time runs out: R5 → R4 (free-text editor stays) → R6. R1–R3 are protected because format 4 depends on them.

### Epic Q — AI housekeeping

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| Q1 | **Capture on Sonnet 5.5 + model IDs in one config** (C-9, risk R9) | Capture still runs on `claude-sonnet-4-6`. Move all model IDs to one config; switch capture to `claude-sonnet-5-5`; re-run a capture check on 10 real photos/URLs. | P1 | S | v2.16 |
| Q2 | **Prompt caching** (C-11) | Cache the assistant system prompt (profile + stock + recipe list) to cut cost per chat turn. | P2 | S | v2.16 |
| Q3 | **Measure real token usage** (C-10) | Log `response.usage` per action locally; replace the estimates in the V3 report. Also the data source for the v3.x spend display. | P2 | S | v2.16 |
| **Q4** | **Editable assistant instructions** (A11 = b) | Settings screen where the user edits the assistant's instructions; variables (e.g. `{profile}`, `{stock}`, `{recipes}`, `{language}`) are filled in at send time. "Reset to default" button; default text shipped with the app; guard against removing the variables silently. **Done:** edited instructions persist and change assistant behaviour; reset restores default. | P1 | M | v2.20 |

### Epic F — Discovery *(Marcel's main pain: "finding recipes is the hardest part")*

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **F4** | **Easier recipe finding** (US-17, G7 ✅ all wanted) | (a) photo grid · (b) sort by recently cooked / most cooked / newest · (c) favourites first (filter or pre-sort) · (d) filter chips: vegetarian, time, category · (e) search always visible at the top, **also over ingredients** · (f) "to try" list. Photo grid ships with a fallback tile for recipes without a photo; it gets better with V3 default photos (slice 7). If v2.17 is too big: (b)(c)(d)(e) first, (a)(f) as v2.17b. | P1 | M–L | v2.17 |
| F1 | **Generate many dishes to taste** *(proposed: close as done)* | Already covered by C1 bulk "✨ KI-Ideen" + C3 profile-aware generation (v2.13): one ask → many drafts → batch review → save. Close unless Marcel wants more. | — | — | — |

### Epic G — Recipe file & sharing recipes

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **G2** | **Recipe export / import** (US-07, check C-23) | Share button asks: "for import into the app" (lossless file) or "readable for others" (Markdown). Recipient imports; recipe appears in their cookbook. Works without Drive on either side; import validated against `SCHEMA.md`; an id clash never overwrites. Also settles **S2** (mixed-language Markdown export) and old quick win #7 (one-recipe share). | P1 | M | v2.18 |
| **G3** | **Assistant creates, updates and deletes recipes** (writes structured `items` once R3 exists) (US-26, E6 ✅) | The in-app assistant can add and change recipes; **every change is shown for confirmation**. It may delete **only recipes the user created**, never the default base recipes (guard on the recipe's origin; tested). Replaces the old "project-Claude edits `rezepte.json`" contract. | P1 | S–M | v2.20 |

### Epic L — Calories & nutrition *(v2.x first, per Marcel)*

**Design choice for L1.** Nothing in `rezepte.json` holds nutrition today.

| Source | How it works | Cost / offline | Accuracy | Verdict |
|--------|--------------|----------------|----------|---------|
| **(a) Bundled nutrient table** | ~300 common ingredients per 100 g from **USDA FoodData Central** (CC0) or Denmark's **Frida** (DTU, attribution). `parseIngredient()` gives amount + unit → grams → sum → per serving. | Free, offline, no key | Good for whole foods; weak on vague amounts | **Recommended core** |
| (b) AI estimate (BYOK) | Claude estimates kcal + macros per serving; cached on the recipe. | Key + network | Plausible, unverified | Fallback → **L4, v3.x** |
| (c) Live API | USDA FDC / Open Food Facts per ingredient. | Online, rate limits | Same as (a) | Skip |

**Schema impact:** optional, additive per-serving fields `kcal`, `protein`, `carbs`, `fat` +
`nutritionSource: "table" | "ai" | "manual"` (or one flat `nutrition` string). `SCHEMA.md` update.

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| L1 | **Decide the nutrition model** | **Resolved by R2 (proposed):** the ingredient master carries nutrition per 100 g, so (a) bundled data is the core; (b) AI estimate stays a v3.x fallback. Marcel confirms. | P1 | S | v2.19 |
| L2 | **Offline calorie calculator** | Built on R2/R3: master + unit→gram table + pure `estimateNutrition(recipe)` with tests. "≈ 520 kcal / Portion" on cards + detail; "≈" when < 80 % of weight matched. | P1 | M | v2.19 |
| L3 | **Plausibility check** | One-off Node tool runs L2 over all base recipes and lists outliers for manual review. | P1 | S | v2.19 |

*L4 (AI fallback) and L5 (scale with portions / planner totals) → `ROADMAP-V3.md`, v3.x.*

### Epic M — Fitness & diet preferences *(proposed for v2.x; needs L2 numbers)*

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| M1 | **Nutrition goal in the cook profile** *(proposed)* | Preset (Ausgewogen · High Protein · Low Carb · Low Fat · High Fat/Keto · Kalorienbewusst) + optional daily kcal/protein target. Local only. | P2 | S | v2.22+ |
| M2 | **Macro filter chips** *(proposed)* | "💪 ≥ 25 g Protein", "🪶 < 500 kcal", "🥑 Low Carb", derived in memory from L2, never written to Drive. | P2 | S | v2.22+ |
| M3 | **Goal-aware AI** *(proposed)* | The goal flows into the assistant system prompt (already reads the profile). | P2 | S | v2.22+ |

Guardrail: no medical claims, no weight-loss plans. *M4 (planner), M5 (protein-boost tips) → v3.x.*

### Small-wins backlog *(proposed — only if a release has room)*

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| E3 | **Photo-based partial removal** *(proposed)* | Photo of what you bought/own → AI strikes just those items from the shopping list. Same vision path as the fridge scan. | P2 | M |
| QW-2 | **Servings memory per recipe** *(proposed)* | Cooking mode opens at the portion size you last used for that recipe. | P2 | S |
| QW-4 | **Duplicate guard on capture** *(proposed)* | Warn before saving a recipe whose name closely matches an existing one. | P2 | S |
| QW-6 | **Planned day → "cooked"** *(proposed)* | Marking a planned day cooked updates `lastCooked`, so planner rotation becomes real. | P3 | S |
| QW-8 | **Step timers keep running in cooking mode** *(proposed, QA BH-03)* | Moving to the next/previous step or changing portions stops running timers (`cooking.js` → `paint()` → `clearTimers()`). Cooking is core tier → take it into the next release that has room. | P2 | M |
| QW-7 | **Slimmer shopping header** *(proposed, QA UX-17)* | The sticky shopping header (search + free-text add) eats a large part of a phone screen; collapse it on scroll or move free-text add into the list. Needs a live check first. | P3 | S |

### Dropped

| # | Item | Why |
|---|------|-----|
| F3 | Match "gold" / compare | Cook match is never used and is removed in V3 (`docs/v3`, decision F8). |
| QA BH-02 | Match "Nochmal" shows already-matched recipes | Same reason: cook match is removed in V3 (F8). Won't fix. |

---

## 4. Ground rules for every v2.x release

- `rezepte.json` stays **flat-v3** per `SCHEMA.md`; additive fields only.
- **Canonical German** in stored data; `category` stays the German enum; translations are display
  overlays and never persist (guarded by `test-canonical.js`). **Decided for V3 (D8, 2026-10-04): English becomes canonical** (format 4); until P6 ships, nothing changes here.
- Shopping list = item-level merge set; **every edit calls `touch()`**, deletes are tombstones.
- Drive scope stays `drive.file`. The only server is the Supabase project (D9: a proper backend from v3.0). Today: I3 inbox, token-checked RPCs, no table access, no recipe data. Hardening is P7; scope beyond sharing is D10.
- No third-party scripts (the BYOK key lives in `localStorage`).
- Every release bumps `BUILD` + SW `CACHE`, lists new modules in the SW `SHELL`, keeps i18n in
  DE/EN/ES/DA with curly inner quotes, and runs `node v2/tests/run.js` **and**
  `npm --prefix v2/e2e test` green.

---

## 5. Shipped log

Full detail lives in the git history, the in-app changelog (`v2/src/version.js`) and the linked docs.

| Version / date | Shipped |
|----------------|---------|
| v2.0 | Offline-first rebuild: cookbook, cooking mode, weekly plan, shopping list, BYOK assistant |
| v2.1 | DE/EN/ES, photo + URL capture, Lager with fridge scan, in-app Guide |
| v2.2 | A1 capture photo reset · A2 AI busy state · A3 editable cook profile · C1 bulk add · D1 icon-based Lager · E1 clear list + undo · E2 sort aisle/A–Z |
| v2.3 | B1 Danish UI · B2 translated base recipes · B3 display overlay |
| 2026-06-13 | A4 bug sweep (shopping aisles in non-DE UI fixed) · G1 full-file edit contract (`SCHEMA.md`) |
| v2.4 | F2 multi-filter AND/OR |
| v2.5 | QW-1 "🥕 Aus Vorrat kochen" · QW-3 honest offline/no-key AI states |
| 2026-06-14 | H1–H4 QA agent fleet (`qa/`, `.claude/agents/`) |
| v2.6–v2.7 (2026-06-14) | K1 shared header + 🍳 → home (= A5, J1) · K2 pure `decideSync` + offline-overwrite fix · K3 accessibility pass · K4 SHELL + canonical guard tests · K5 i18n leak |
| v2.8 | I1 share list as text |
| v2.9 | S1 translated cuisine/season/last-cooked |
| v2.10 / v2.10.1 | I2 shared list with partner (Drive + Picker) · blank-app hotfix + syntax guard test |
| v2.11 | I2 blockers fixed (tombstones, write-only-on-change, Picker loading) · S3 localized shopping names |
| v2.12 | J2 bottom tab bar |
| v2.13 | C2 capture polish · C3 profile-aware capture · D2 shared ingredient catalog |
| v2.14 (2026-10-04) | I3 friends link via Supabase inbox (`v2/docs/SHARING.md`) · PR #8 |
| 2026-10-12 | P2 end-to-end suite (`v2/e2e/`, Playwright): ten core flows + recipe sync across devices, all offline with fakes |
| v2.14.1 (2026-10-12) | Hotfix found by P2: after visiting Settings, every later recipe save failed with „Speichern fehlgeschlagen“ and never reached Drive (leaked listeners); „Jetzt synchronisieren“ stayed disabled |
| v2.15 (2026-10-19) | P1 one sync core (`syncCore.js` + `syncRules.js`) behind recipes and shopping list; fixes the partner-link race and the save-during-pull overwrite |
| 2026-10-12 | QA fleet rework: shared `qa/AGENT-CONVENTIONS.md` (finding IDs, evidence levels, status of old findings), `qa/FIELD-REPORTS.md` intake, all 7 agents re-run → Epic T |
| v2.15.1 (2026-10-19) | Epic T1 · T2 · T3 · T11: saves read Drive first + per-recipe three-way merge (T12 core), re-sync on resume, broken Drive files refused/repaired with backup + mass-delete question, edit form writes German, contract docs |
| v2.15.2 (2026-10-19) | Epic T4 · T7 · T10 (+ their T8 tests): id-less legacy list items get a stable id and their copies collapse to one row (FR-01 main cause), tombstone pruning no longer loops and a long-offline device can't revive pruned deletes, `einkaufsliste.json` validated + escaped + documented |
| v2.15.3 (2026-10-26) | Epic T5 · T6 (+ their T8 tests): one "same item?" rule (recipe, tile, free text, friends, partner sync → one row per item, other units in the same row), tile badge shows that row, Lager beats 🛒, two-in-one lines split, double-tap guard, atomic list writes (AR-10) — closes the FR-01 duplicates |

**Architecture decisions worth remembering** (details in the linked files):
- Sharing models (Epic I): couples = shared Drive file + Google Picker, no backend; friends without
  Google = Supabase inbox + shop window, Drive stays the source of truth. `v2/docs/SHARING.md`.
- Translation: pre-translated bundled snapshots for the base recipes only; user recipes stay in
  their input language. Generator `v2/tools/build-snapshots.mjs`.
- QA fleet is read-only: agents write to `qa/findings/`, Marcel promotes findings into a roadmap.
