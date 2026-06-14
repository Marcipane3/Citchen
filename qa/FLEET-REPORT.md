# 🛡️ Koch Fleet Report — 2026-06-14

_Build `2026-06-13-v2.5` · suite **145/145 green** · 5 agents, read-only._
_Per-agent detail: [bug-hunter](findings/bug-hunter.md) · [architect](findings/architect.md) · [simplifier](findings/simplifier.md) · [ux-curator](findings/ux-curator.md) · [test-warden](findings/test-warden.md)._

## Headline: the app is healthy
No P0/P1 defects. The canonical-German overlay does not leak (all three recipe mutators persist via
`recipesDe` — verified). BYOK/security posture is honest, schema round-trip is proven, the v2.5
offline-vs-no-key states are genuinely good. This is a clean codebase; the findings below are
sharpening, not firefighting.

## Where the fleet *converged* (trust these most — independent lenses, same conclusion)

### 1. `data/sync.js` is the one real fault-line — flagged by **3 of 5 agents**
- **Bug-hunter (P2, high confidence):** `sync.js:101-119` — an offline local edit (`dirty:true`) is
  **silently discarded** with the dirty flag cleared when Drive carries a newer `updated` stamp. The
  LWW branch does a wholesale `db.replaceAll` with no conflict surface. Needs two devices + an offline
  edit to hit, so it's rare — but it's silent data loss.
- **Test-warden (#1 gap):** the entire LWW/dirty/offline decision tree in `sync.js` has **zero tests**,
  while every recipe-content module is well covered.
- **Architect (ADR, gates Epic I2):** `sync.js` is hard-wired to one object; the shared shopping list
  (Epic I) needs a second. **Do not duplicate the engine** — extract a collection-agnostic core first.
- **Synthesis → one move that satisfies all three:** extract a **pure `decideSync({localUpdated,
  remoteUpdated, dirty, source}) → "push"|"pull"|"noop"|"create"`** helper out of the async I/O. It
  (a) makes the silent-overwrite rule an explicit, testable decision, (b) is the exact seam Epic I2
  needs to go collection-agnostic, (c) lets the conflict behaviour be pinned before it's multiplied
  across a second synced object. **This is the highest-leverage structural task in the app.**

### 2. The duplicated view header — flagged by **3 of 5 agents**, and it's where 🍳→home lives
- **Simplifier (top payoff):** `class="app-header"` + `#menuBtn` + `openMenu()` wiring repeats
  **10× across 9 files**; a parameterised `renderHeader()` in `ui/helpers.js` saves ~40–55 lines,
  behaviour-preserving. Two variants to absorb: `guide.js` (back button) and `match.js` (extra action).
- **UX-curator (#1):** the 🍳 logo is a non-interactive `<span>` present only on cookbook; there's no
  one-tap "home" anywhere else.
- **Synthesis → A5 (🍳→home, Marcel's ask) should be *implemented as* the shared-header extraction.**
  You fix the largest duplication in the app and ship the requested home affordance in the same change.
  Effort S–M. This is the best first task to pick up.

## Single-agent findings worth promoting

| Source | Finding | Pri | Eff |
|--------|---------|-----|-----|
| UX | **Nav is hamburger-only** → add a persistent bottom tab bar for the 5 primary sections (Roadmap **J2**). NN/g: hidden menus −21% task completion. | P2 | M |
| UX | **Icon-button a11y:** `aria-label` on ☰/✕/swipe/planner icons (they use `title` only), global `:focus-visible`, keyboard-operable recipe cards. | P2 | S |
| UX | **Sheet a11y** (`ui/sheet.js`): Escape-to-close + focus trap/restore; bump `.icon-btn` (~30px) and shopping steppers to 44px hit area. | P2 | M |
| Architect | **`drive.file` can't share across accounts** — decide the model for Epic I on paper first: shared-folder + Google Picker (keeps minimal scope) and **item-level merge** for the list, *not* whole-file LWW (correct for recipes, wrong for two people ticking items). | — | plan |
| Architect | **Two invariant-guard tests:** a `sw.js`-SHELL coverage test (fail on any uncached `src/**/*.js`) and a "only `recipesDe` reaches Drive" persistence test. Cheap insurance for the no-build tax. | P3 | S |
| UX / i18n | Two hardcoded German strings bypass i18n: `assistant.js:187`, `detail.js:118`. | P3 | S |
| Simplifier | `<div class="build-line">` footer repeats 8× — fold into the header work. | P3 | S |

## Verified clean (don't re-flag next run)
Catalog is single-source (D2 done: `CATALOG`/`ingMatchCat` only in `shopping/catalog.js`, 3 consumers).
`esc()`/`openMenu()` single-source. Canonical-German overlay does not leak. Cook-mode ergonomics are
the best-tuned surface — leave them. Recipe-content logic is well tested.

## Promotable to ROADMAP (shaped as rows — Marcel promotes, not the fleet)
1. **A5 as shared-header extraction** — 🍳→home + kill 10× header dup. *P1 · S–M*
2. **Pre-I2: extract pure `decideSync()` + tests** (incl. the offline-overwrite case) — unblocks the
   shared shopping list safely. *P1 · M*
3. **J2 bottom tab bar** — research-backed nav upgrade. *P2 · M*
4. **A11y pass** — aria-labels + focus-visible + 44px targets + sheet focus trap. *P2 · S–M*

---
_Next run: `qa/run-fleet.md`. The above "verified clean" list tells the next pass what's already checked._
