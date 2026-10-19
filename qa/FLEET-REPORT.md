# 🛡️ Koch Fleet Report — 2026-10-12

_Build `2026-10-04-v2.14` · CACHE `koch-v2.14-1` · suite **215/215 green** · HEAD `70e8b9d` · 7 agents, FULL mode,
first run under the new [`AGENT-CONVENTIONS.md`](AGENT-CONVENTIONS.md) (finding IDs, evidence levels E1/E2/E3, status of old findings)._
_Detail: [bug-hunter](findings/bug-hunter.md) · [data-guardian](findings/data-guardian.md) · [architect](findings/architect.md) ·
[test-warden](findings/test-warden.md) · [simplifier](findings/simplifier.md) · [ux-curator](findings/ux-curator.md) ·
[release-captain](findings/release-captain.md)._

## Headline

The UI is in good shape, but **the data layer is not trustworthy for multiple writers today.** The June
reports called recipe sync "sound". Two of those calls were wrong. The fleet found **3 P0 data-loss
paths** in recipe sync. Two independent agents found each one, the orchestrator re-checked them, and
each is proven with a probe. Your **Ingwer report (FR-01)** is fully explained: one bug that adds rows
by itself, plus four smaller ones that create duplicates. **Release gate: GO**, meaning the deployed
v2.14 matches `main`. The problems below are in the shipped code, not in pending changes.

---

## Field reports

### FR-01 — "Ingwer" appears on the shopping list randomly and multiple times → 🎯 root-caused

**Primary cause: the list grows by itself.** `DG-04` (data-guardian). The orchestrator re-verified it with
an independent probe (E1).
- Builds before v2.11 wrote shopping items **without an `id`** into `einkaufsliste.json` on Drive.
- On every list sync, `ensureItemMeta` gives that item a **fresh id** locally. The id-less original stays
  on Drive, so the merge keeps both.
- Each sync therefore adds one more live "Ingwer" row. Probe: 5 syncs gave 1 → 2 → 3 → 4 → 5 rows.
- Deleting doesn't stick, because the id-less source on Drive regenerates the row.
- Only **one** item is affected because the merge map collapses all id-less items onto the key `undefined`.
  The other id-less items are **silently dropped**, which is a data-loss side effect.
- Syncs fire when you open the Einkauf tab, tap 🔄, come back online, and 1.2 s after any list tap. That
  timing matches "randomly, without selecting it".
- Code: `data/listSync.js` `loadLocalList`/`doSync` + `features/shopping/listMerge.js` `mergeList`/`ensureItemMeta`.

**Contributing causes, each producing extra Ingwer rows** (found by several agents independently, all E1):

| What | IDs | Effect |
|---|---|---|
| Lager is ignored for 🛒-marked recipes (82/105) | BH-04 | Ingwer is added from 6 recipes even when it's marked in stock; ~75 % of random weekly plans contain one |
| Same ingredient → different merge keys (`ingwer\|stück`, `ingwer, gerieben\|stück`, tile `ingwer\|`) | BH-05 = DG-09 = SI-05 = AR-08 = TW-09 | up to 3 rows that never merge |
| Tile badge reads a different row than the tap writes to | BH-06 = UX-11 | the tap looks like a no-op, so you tap again |
| `mergeItems` revives a deleted twin although a live row exists | BH-07 = DG-08 = TW-10 | two live rows |
| Partner/device merges by random id | BH-08 = DG-09 | the same item added on two devices stays doubled |
| "Nelken…Ingwerpulver" line = two ingredients in one string | BH-09 | an extra fake "Ingwer" row in Gemüse |

Refuted (so nobody chases them again): friend-inbox replay (`seen`/`fl_ack`/`trimSeen`), and stale `data-i`
indices after a background re-render. Grid shifting under the finger (UX-12) is still unproven and needs
a phone check.

**Confirm on the device (2 minutes):** open `einkaufsliste.json` in Drive and look for an item without
`"id"`. Or open Einkauf, tap 🔄 three times, and watch whether Ingwer goes up by one each time.

**Fix direction (one change set):**
1. In `listSync`, give id-less **remote** items a deterministic id (e.g. a hash of name+unit) and write the
   file back once. Never mint a random id for a remote item.
2. One shared "same item?" predicate with a canonical, unit-agnostic key that prefers live rows over
   tombstones (SI-04 / AR-08).
3. Let the Lager apply to 🛒 lines (BH-04).

Regression tests are specified in TW-09/TW-10/TW-11 and `FR01.*` in test-warden.

---

## Top issues across the fleet (deduped, ranked)

1. **P0 — Recipe saves overwrite Drive blind.** `DG-01 = AR-07`. Orchestrator re-checked the code (E2).
   - `data/sync.js:149-171` `saveCollection` writes the full local collection without reading Drive first.
   - There is no re-sync on app resume (no `visibilitychange` handler anywhere).
   - So any edit by in-project Claude, v1 or your other device since this device last pulled is
     **erased by the next ♥, rating or edit**.
   - This directly breaks requirement #3 ("Claude updates the data").
   - Fix: read and decide (`decideSync`) before every write, and re-sync on resume.
2. **P0 — Editing a recipe in an EN/DA/ES UI writes translated text into the German Drive file.**
   `DG-02 = AR-03 (reopened)`. Orchestrator re-checked the code (E2).
   - `detail.js:168` `openForm(r)` passes the **localized** recipe.
   - `form.js:101` then copies every field onto the canonical German copy.
   - Store.js calls this a "known minor limit", but the probe shows it affects all 105 base recipes.
   - Only matters if you use a non-German UI.
   - Fix: open the form with `getRecipeDe(id)`, or write back only fields the user changed.
3. **P0 — A recipe without `id` from an external writer partly wipes the local cookbook.** `DG-03`, medium
   confidence. The next edit then pushes the cut-down cookbook to Drive (probe: 105 → 40).
4. **P1 — A malformed but parseable `rezepte.json` (`{}`, `null`, `recipes` not an array) wipes every
   device's local cookbook and shows "Synchronisiert ✓".** `DG-05 = AR-06`.
5. **P1 — The FR-01 shopping-list cluster** above: `DG-04`, `BH-04`, `BH-05`.
6. **P1 — A duplicate recipe id from an external writer loses one recipe.** `DG-06`. Note that SCHEMA.md's
   example id `r01` is a real id.
7. **P2 — Tombstone pruning fights the local re-merge.** `AR-09 = TW-12 = DG-13 = BH-11`, re-checked by
   the orchestrator (E2).
   - Once a deleted item is more than 30 days old, the list stays "dirty" forever.
   - It then re-reads Drive every ~1.2 s while the tab is open (battery/quota cost, no new items).
   - A device that was offline for more than 30 days brings deleted rows back.
8. **P2 — `einkaufsliste.json` is an unvalidated contract**, with an HTML-injection path from a partner
   file (`AR-11`). Assistant-generated recipes are saved in the UI language (`DG-10`). SCHEMA.md promises
   more safety than the code gives (`DG-11`).

## Status of previous findings (June 2026 → now)

- ✅ **Fixed:**
  - offline-edit silent overwrite (`decideSync` with conflict rule, 9 tests)
  - shared header / 🍳→home
  - bottom tab bar
  - sheet focus trap / Esc
  - shared catalog
  - SW shell completeness test
  - Picker + item merge for partner lists
- ⏳ **Still open:**
  - "one sync core" (AR-01, re-scoped as a per-record three-way merge with a swappable transport)
  - CSP / no-third-party-script invariant (AR-05)
  - `buildLine` duplication (SI-03)
  - several UX items, partly fixed
- ❗ **Reopened** (the June "verified clean" verdicts were wrong): canonical-German leak through the
  edit form (AR-03) and the inbound-file guard (AR-06).

## By agent

- **Bug-hunter** — 0 P0 · 2 P1 · 3 P2 · 5 P3.
  - Explained FR-01's trigger as the plan / Lager bypass. That holds, but the self-multiplying sync bug
    was found by data-guardian, not by bug-hunter.
  - BH-01 (June) is confirmed fixed.
- **Data-guardian** (first run) — 3 P0 · 3 P1 · 5 P2 · 3 P3.
  - Verdict: "not trustworthy today".
  - Verified clean: round-trip on the real file (105 recipes, no field loss), the id generator, and
    escaping of friend input.
- **Architect** — 11 ADRs (P0 1 · P1 4 · P2 4 · P3 2).
  - Forward map: (1) a small "safe recipe sync" release now; (2) v2.15 "one sync core" as a three-way
    merge, not just shared plumbing; (3) a canonical shopping-item key.
  - Supabase friends inbox: good pattern; `fl_create` is an open capacity sink (AR-12).
- **Test-warden** — 215/215.
  - 2 high, 6 medium and 2 low gaps.
  - 4 June gaps fixed.
  - Proposes `tests/test-shopping-identity.js`; two of its cases fail today.
- **Simplifier** — 1 high payoff: one shared "same item?" predicate (7 places disagree today).
  - Also: copy-pasted aggregate-and-add flow (SI-06), 3 dead symbols, 7 unused imports, a permanently-on
    flag.
- **UX-curator** — 3 high: origin not shown per row (UX-10), wrong tile badge (UX-11), grid shifts under
  the finger (UX-12, needs a phone check).
  - Also: no undo for single delete, with ✕ placed 6 px from +.
- **Release-captain** — **GO**.
  - Nothing pending under `v2/`; all 50 modules are in the SW shell.
  - Warn: `add.html` being outside the shell is undocumented in `sw.js`.
  - Warn: the untracked root `rezepte.json` must not be committed (it's a stale June copy, not live data).

## Promotable to ROADMAP

> **Promoted 2026-10-19 on Marcel's request.** Bug fixes → `ROADMAP-V2.md` **Epic T** (T1–T11):
> v2.15.1 safe recipe sync, v2.15.2 "Ingwer" fix, v2.16b shopping clarity (renamed after the cloud
> session shipped v2.14.1 + v2.15 on 2026-10-19; v2.15 does not fix these). P1 shipped meanwhile, so
> AR-01 became follow-up T12 (proposed), T8 (e2e scenarios — P2 shipped), P7 (AR-12, DG-12), P8 (UX-06), small wins QW-7/QW-8,
> dropped BH-02. Clean-up/a11y/CSP → `ROADMAP-V3.md` slices 1, 4 and 6. Queue in `ROADMAP.md` re-ranked.
> The table below is kept as the original proposal.

| Item | Why | Pri | Eff | IDs |
|---|---|---|---|---|
| **v2.14.1 "Safe recipe sync"**: read-before-write, re-sync on resume, refuse malformed inbound files, keep one local backup | 3 P0/P1 data-loss paths; protects Claude-via-Drive | P0 | M | DG-01, DG-03, DG-05, DG-06, AR-06, AR-07 |
| **v2.14.1 "Ingwer fix"**: deterministic ids for id-less remote items, one shared item predicate + canonical key, Lager applies to 🛒 lines | FR-01 | P0/P1 | M | DG-04, BH-04, BH-05, SI-04, AR-08, BH-07 |
| Edit form uses the German canonical recipe | translated text into the German Drive file | P1 (P0 if you use a non-DE UI) | S | DG-02, AR-03 |
| Fix tombstone prune vs re-merge | endless Drive polling, resurrection | P2 | S | AR-09, TW-12 |
| `tests/test-shopping-identity.js` + recipe-sync guard tests | lock the fixes in | P1 | S | TW-09…14 |
| Shopping UX: true tile badge + snackbar undo, origin tag per row, stop grid shift | users can't tell why items are there | P2 | S–M | UX-10, UX-11, UX-12, UX-13 |
| Rework v2.15 "one sync core" as a three-way merge | the June design doesn't prevent DG-01 | P2 | L | AR-01 |
| Fix SCHEMA.md (`r01` example, safety promises) | contract lies to external writers | P2 | S | DG-11, DG-06 |

## Agent definition feedback

- Simplifier's definition named `catalog.js` without its folder → fixed to `data/catalog.js`.
- `01_ARCHITECTURE.md` is stale: it still describes a single-file app with no list file, no Supabase and
  no tab bar. This is a doc, not an agent problem; worth a refresh before V3.
- Fact correction: Ingwer is in **7** recipes, one as "Ingwerpulver" inside a merged line.
- Process lesson: bug-hunter, the agent built for exactly this, missed the self-multiplying sync bug that
  data-guardian found by working through the list file's possible inputs.
  - Candidate rule for bug-hunter: "for every external file the app reads, enumerate legacy / malformed
    shapes and replay them through the sync loop several times."
  - Decide after the next run whether to add it.
