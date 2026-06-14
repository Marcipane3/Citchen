# Simplifier — findings (2026-06-14T11:46:14Z)

Build `2026-06-13-v2.5`, suite 145/145. App under `v2/`. Read-only sweep for reuse/removal.

---

### Shared `renderHeader()` helper  ·  payoff: high  ·  risk: low
- **Pattern:** Every feature view hand-rolls the same `<header class="app-header"><div class="brand"><div class="brand-l">…emoji + `<h1>` + `.sub`…</div> <button id="menuBtn">☰</button></div></header>` block, then re-wires `container.querySelector("#menuBtn").onclick = () => openMenu("<name>")`. Counted with Grep:
  - `class="app-header"` → **10 occurrences in 9 files**: `features/lager/lager.js:32`, `features/guide/guide.js:15`, `features/capture/capture.js:27`, `features/planner/planner.js:124`, `features/shopping/shopping.js:52`, `features/cookbook/cookbook.js:159`, `features/assistant/assistant.js:36` + `:63`, `features/match/match.js:67`, `features/settings/settings.js:18`.
  - `#menuBtn` button markup → **10×** (same files/lines +1).
  - `#menuBtn").onclick = () => openMenu(…)` wiring → **10×**: assistant `:51,:85`, capture `:78`, cookbook `:186`, guide `:46`, lager `:72`, planner `:144`, shopping `:75`, match `:91`, settings `:105`.
- **Variants** (so the helper must be parameterised, not fixed):
  - *Plain* (emoji + title + sub + menu): lager, capture, settings, assistant×2, cookbook, planner, shopping — 8 of 10.
  - *Back button* instead of leading emoji: `guide.js:18` (`#backBtn`).
  - *Extra header action* left of the menu: `match.js:74` (`#matchStack`).
- **Proposal:** Add one helper to the existing shared module `ui/helpers.js` (already home to `esc`, `metaBadges`, `makeListEditor`):
  ```js
  export function renderHeader({ emoji, title, sub = "", current, back = false, extra = "" }) {
    const lead = back
      ? `<button class="icon-btn" id="backBtn" title="${t("common.back")}">←</button>`
      : `<span style="font-size:24px">${emoji}</span>`;
    return `<header class="app-header"><div class="brand">
        <div class="brand-l">${lead}<div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div></div>
        <div class="hdr-actions">${extra}<button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button></div>
      </div></header>`;
  }
  ```
  Each view drops to `${renderHeader({ emoji: "📦", title: t("lager.title"), sub: t("lager.subtitle"), current: "lager" })}`. Keep the post-render `#menuBtn` wiring, or fold it into a sibling `wireHeader(container, current)` that also binds `#backBtn`→history/home so the wiring line collapses too. This is the natural seam for the **A5 🍳→home affordance**: the leading emoji becomes a clickable home button in one place instead of 10.
- **Saves:** ~6 HTML lines × 10 sites ≈ **50–55 lines removed** (net ~40 after the helper), across **9 files**; the 10 wiring lines also de-duplicate if `wireHeader` is added. **behaviour:** unchanged — markup is byte-identical for the 8 plain cases; guide/match preserved via `back`/`extra` params. Note the inline emoji `font-size:24px` and the per-view sibling rows (`search-wrap`, `plan-controls`, match's stack) stay outside the helper, so callers keep full control of what follows the header.
- **Effort:** M (mechanical, but 10 call-sites + 2 special-cased variants to verify against tests).

### `buildLine()` footer helper  ·  payoff: low  ·  risk: low
- **Pattern:** `` <div class="build-line">Build ${esc(BUILD)}</div> `` repeated **identically 8×**: `assistant.js:50`, `guide.js:43`, `shopping.js:73`, `match.js:89`, `planner.js:142`, `lager.js:70`, `capture.js:76`, `cookbook.js:180` (assistant `:83` is a deliberate empty spacer variant — leave it).
- **Proposal:** `export const buildLine = () => `<div class="build-line">Build ${esc(BUILD)}</div>`;` in `ui/helpers.js`; or just emit it from the same shared footer if A5 introduces one. Each call drops `import { BUILD }` where BUILD is otherwise unused.
- **Saves:** ~8 lines + removes 8 stray `BUILD` imports; **behaviour:** unchanged.
- **Effort:** S. Low priority — fold into the header/footer work rather than as a standalone PR.

---

## Summary (top 3 by payoff)
1. **`renderHeader()` in `ui/helpers.js`** — collapses 10 near-identical `app-header` blocks (×9 files) into one parameterised helper; ~40–55 net lines saved and the single home for the A5 🍳→home logo. Highest-yield, low risk, behaviour-preserving.
2. **`wireHeader()` companion** (optional sibling to #1) — de-duplicates the 10 `#menuBtn → openMenu()` wiring lines and centralises `#backBtn` handling.
3. **`buildLine()` footer helper** — 8 identical footer strings + 8 redundant `BUILD` imports. Small; bundle with #1.

## Verified single-source (already DRY — do not re-flag)
- **Shopping/Lager catalog (roadmap D2): single-source, confirmed.** `CATALOG`, `SECTION_ORDER`, `ingMatchCat`, `sectionIcon` are defined once in `features/shopping/catalog.js`. Consumers import from there: `lager/lager.js:13` (`CATALOG, ingMatchCat`), `shopping/shopping.js:8` (`CATALOG, SECTION_ORDER, sectionIcon`), `shopping/logic.js:7` (`ingMatchCat`). No second catalog or rival inline ingredient→icon map exists anywhere in `v2/src` (Grep for `name:…icon:` / produce emojis returns only `catalog.js` plus unrelated hits in `version.js` release-notes text and `i18n.js`). The longest-match icon logic lives only in `ingMatchCat`. D2 is satisfied.
- **`esc()` escaping helper: single-source** — defined once at `ui/helpers.js:6`, no rival inline escaper.
- **`openMenu()` navigation sheet: single-source** — one definition at `features/menu.js:22`; all 10 call-sites import it. The duplication is purely in the *markup around* the button, not the menu logic itself.
