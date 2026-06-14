# UX-Curator — findings (2026-06-14T11:46:01Z)

Build `2026-06-13-v2.5` · suite 145/145 · read-only review from markup/CSS (no live browser).
Context: one-handed phone use in a kitchen, sometimes messy hands. Prioritised by user impact × effort.

Honest headline: the **error/offline/empty-state work is genuinely good** (v2.5's offline-vs-no-key split is honest and helpful — `assistant.js:25-33`, `capture.js:19-21,88-90`). The weak spots are all **navigation and the icon-only buttons** — wayfinding and a11y, not content. Touch targets are mostly fine. The thumb-zone story is the biggest real-world miss.

---

## Part A — Audit findings

### No one-tap "home"; all navigation hidden behind ☰  ·  impact: high  ·  effort: M
- **Where:** all views via `app-header` (`cookbook.js:159-169`, `match.js:67-78`, `lager.js:32-35`, `shopping.js:52-58`, `planner.js:124-130`, `assistant.js:36-39`, `settings.js:18-21`, `capture.js:27-30`); menu in `menu.js:10-45`.
- **Issue:** The 9 sections are reachable only by opening the hamburger sheet — two taps minimum to switch anywhere, and the sheet hides the destination list until tapped. The 🍳 logo (`cookbook.js:162`) is a plain non-interactive `<span>` and is absent from every other view, so there is no glanceable "where am I / take me home" affordance. In a kitchen you want Cookbook ↔ Match ↔ Shopping ↔ Cook-mode in one tap with greasy hands. (NN/g: hidden nav cuts task completion ~21%; a persistent bottom tab bar lifts feature discovery ~30%.)
- **Fix:** Add a persistent **bottom tab bar** for the 4–5 primary sections (Cookbook / Match / Shopping / Planner, + ☰ "More" for the long tail: Lager, Assistant, Capture, Settings, Export). Keep ☰ as overflow. Bottom placement also lands nav in the thumb zone. Interim cheap win: make the 🍳 logo a real button that routes to `cookbook` and render it in every header.
- **Needs live check?:** no (pattern decision); yes to confirm tab bar doesn't collide with the FAB / `ai-inputbar` (both sit bottom-fixed — see next item).

### Primary actions stranded at the top; thumb zone underused  ·  impact: high  ·  effort: M
- **Where:** filter chips + search live in the sticky top header (`cookbook.js:170-174`); match action buttons are mid-screen (`match.js:81-85`); the FAB is correctly bottom-right (`app.css:45-50`).
- **Issue:** On a tall phone, the most-used cookbook controls (search, category chips, clear-filters) all sit at the very top, out of thumb reach for a one-handed user. The "+" FAB is the only primary action in the thumb zone. Match's swipe buttons are reachable; cookbook's are not.
- **Fix:** Nothing needs to move drastically, but the bottom tab bar above would put navigation in reach. Consider a bottom-anchored "filter/search" affordance or accept that browsing-scroll is thumb-driven and only filtering needs a reach. Lower priority than nav itself.
- **Needs live check?:** yes — measure reach on a real device against the 640px max-width frame.

### Icon-only buttons missing `aria-label` (use `title` only)  ·  impact: med  ·  effort: S
- **Where:** every ☰ (`title=` only, e.g. `cookbook.js:168`), every ✕ close (`menu.js:28`, `detail.js:39`, `form.js:21`, `cooking.js:208`, `match.js:218`, `planner.js:266`, `assistant.js:224`), match swipe buttons (`match.js:82-84`), planner per-day controls 🔒🔓🔄📖 (`planner.js:115-117`), match-stack 🔥 (`match.js:74`).
- **Issue:** `title` is not reliably announced by mobile screen readers (TalkBack/VoiceOver) and never on touch. An icon-only button with no accessible name reads as "button" or announces the raw emoji. The ✕ close buttons literally announce nothing useful.
- **Fix:** Add `aria-label` (mirroring the existing `title` value) to every icon-only button. They already have translated strings in scope (`t("common.menu")`, `t("common.back")`, etc.) — wire those into `aria-label` too. Cheapest high-value a11y win in the app.
- **Needs live check?:** no (markup-level); a TalkBack pass would confirm.

### No visible focus ring on buttons / chips / cards  ·  impact: med  ·  effort: S
- **Where:** global — only inputs/textareas/selects define `:focus` (`base.css:24` has none for buttons; focus styles exist only at `app.css:114,220,276`). `-webkit-tap-highlight-color: transparent` is set globally (`base.css:3`).
- **Issue:** No `:focus-visible` style anywhere for `.chip`, `.icon-btn`, `.menu-item`, `.rcard`, `.sw-btn`, `.fab`, `.btn-primary/.btn-sec`. Keyboard and switch-control users get no indication of focus; the global tap-highlight removal also kills the default outline. The cards are `<div>`s with `onclick` (`cookbook.js:38`, `match.js` rows), so they aren't keyboard-focusable at all.
- **Fix:** Add a single global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` rule covering buttons and interactive chips. Convert clickable recipe cards to `<button>` (or add `role="button"` + `tabindex="0"` + Enter/Space handling) so they're operable without a pointer.
- **Needs live check?:** yes — keyboard tab-through is the real test; reason-only here.

### Sheets/menus not keyboard- or Esc-dismissable; no focus trap  ·  impact: med  ·  effort: M
- **Where:** `ui/sheet.js:8-31` (the shared bottom-sheet helper behind menu, detail, form, match-list, planner picker).
- **Issue:** A sheet closes only on backdrop click or the ✕ button (`sheet.js:26-28`). No `Escape` handler, no focus moved into the sheet on open, no focus trap, no focus restored to the trigger on close. Keyboard/AT users can tab "behind" the open sheet into the dimmed page. The 450ms ghost-click arming (`sheet.js:15-17`) is a smart touch fix and should stay.
- **Fix:** On open: move focus to the sheet (or its ✕), trap Tab within it, restore focus to the opener on close. Add a `keydown` Escape → close. `aria-modal="true"` + `role="dialog"` on `.sheet`.
- **Needs live check?:** yes.

### Two hardcoded German strings in error paths (i18n leak)  ·  impact: low  ·  effort: S
- **Where:** `assistant.js:187` ("Das Rezept war leider nicht schema-konform …") and `detail.js:118` ("Foto fehlgeschlagen: " + …). Also note the empty-state copy elsewhere is correctly routed through `t()`.
- **Issue:** A user running the app in English (language picker exists — `onboarding/language.js`) hits German text on the AI-schema-fail and photo-upload-fail paths. Inconsistent with the otherwise-clean i18n (the S1/S2 mixed-language concern). The shopping/catalog German (`logic.js`, `catalog.js`) is *data*, not UI copy — correctly out of scope.
- **Fix:** Route both through `t()` with new keys. Low frequency, so low priority — but trivial.
- **Needs live check?:** no.

### `alert()` / `confirm()` for errors and destructive actions  ·  impact: low  ·  effort: M
- **Where:** delete/fav/rating errors (`detail.js:89,97,118,133,144,178,184`), login error (`menu.js:41`), cook-mode reset confirm (`cooking.js:226`).
- **Issue:** Native `alert/confirm` are jarring on a PWA, break the warm visual identity, and can't be styled. Fine as a safety net, weak as primary UX — especially the destructive delete-recipe path going through a bare `confirm`.
- **Fix:** Replace destructive confirms and user-facing errors with in-sheet inline messaging / a small confirm sheet (the `openSheet` helper already exists). Keep `alert` only for truly exceptional failures. Lower priority than nav/a11y.
- **Needs live check?:** no.

### Touch targets — mostly compliant, two to verify  ·  impact: low  ·  effort: S
- **Where:** `.icon-btn` (`base.css:40-44`, ~30–34px tall: `16px` glyph + `7px` vertical padding), `.chip` (`app.css:11-13`, ~28px tall), `.sl-rm`/`.sl-dec`/`.sl-inc` (`app.css:238-240`, 30px), `.match-rm` (`app.css:215`).
- **Issue:** The ✕/☰ `.icon-btn` and the filter `.chip` fall **under the 44px** minimum tap target. In a messy-hands kitchen, the small ✕ close (the only way to dismiss a sheet without a precise backdrop tap) and the 30px shopping +/− steppers are the likeliest mis-taps. FAB (58px), swipe buttons (62px), cook-mode step rows (big) are all good.
- **Fix:** Bump `.icon-btn` and the small list controls to a 44px min hit area (padding or a transparent `::before` expander; visual size can stay). Chips are borderline-acceptable for a scrolling filter row but +4px vertical wouldn't hurt.
- **Needs live check?:** yes — confirm rendered px on device DPR; CSS values are close to the line.

### Cook-mode ergonomics — already strong  ·  impact: n/a (good)  ·  effort: —
- **Where:** `cooking.css` rules in `app.css:134-179`, `cooking.js`.
- **Note:** Pager step text at 22px (`app.css:168`), 44px step numbers, wake-lock (`cooking.js:16`), vibrate on timer fire (`cooking.js:41`), full-width pager timer (`app.css:169`), portion scaler. This is the best-tuned surface for arm's-length kitchen use. Leave it. Only nit: the reset-prog link (`cooking.js:212`) is a small underlined text target inside a busy header.

---

## Part B — Delight ideas
*(ideas, not a plan — each tied to an existing module so it's buildable)*

- **"Tonight" home card** — a hero card at the top of Cookbook pulling from Lager + Planner: "You have chickpeas, spinach, coconut milk → Süßkartoffel-Curry." Ties to `lager/logic.js` + `cookbook.js`. Doubles as a reason to make the logo route home.
- **"Cooked it!" celebration** — on the cook-mode finish button (`cooking.js:214`, `exit`), a quick confetti micro-animation that stamps `lastCooked` to the current month automatically. Closes the loop the field already displays (`cookbook.js:43`).
- **Hands-free step advance** — in pager mode (`cooking.js`), a big "Next" zone + optional voice ("weiter"/"next") via the Web Speech API, so greasy hands never touch the screen. Wake-lock already keeps the screen on.
- **Swipe micro-haptics** — the match deck already vibrates timers; add a light `navigator.vibrate(10)` on like/nope commit (`match.js`) for tactile confirmation.
- **Default food photo by category** — recipes without a photo show a tasteful category-tinted illustration instead of the flat `--line-soft` block (`app.css:38`, `.scard-img` emoji already hints at this). Makes the cookbook and swipe deck feel alive before any photo is added.
- **Share-a-recipe** — a share button on detail (`detail.js`) that exports one recipe via the Web Share API / the existing `export.js` copy logic, scoped to a single `id`.

---

## Top 3 to do next
1. **Add a persistent bottom tab bar (4–5 primary sections) + make 🍳 a real home button in every header.** Biggest real-world win: turns two-tap hidden nav into one-tap thumb-zone nav for the core kitchen loop. (high impact / M)
2. **Add `aria-label` to every icon-only button (☰, ✕, swipe, planner controls) and a global `:focus-visible` outline; make recipe cards keyboard-operable.** Cheapest high-value a11y fix; mostly mechanical. (med impact / S)
3. **Make sheets Escape-dismissable with focus trap + restore (`ui/sheet.js`), and bump `.icon-btn` / small list steppers to a 44px hit area.** Fixes keyboard dismissal and the likeliest messy-hands mis-taps. (med impact / M)
