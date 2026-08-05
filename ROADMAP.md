# 🍳 Koch App — Roadmap (v2.x → v3)

> Master plan for the next 1–2 weeks of v2 work, plus the v3 rebuild horizon.
> Owner: Marcel · Maintained for Claude Code as the working backlog.
> Last structured: 2026-06-14 · Current build: v2.5 (`/v2`, flat-v3 schema, 145 tests).

This file replaces the loose backlog at the bottom of `04_BUILD_PLAN.md`. Marcel's raw
notes were regrouped into themed epics, de-duplicated, and prioritised. Claude's own
additions are clearly marked (§9) and never silently mixed into Marcel's asks.

---

## How to read this

**Priority**
- **P0** — blocks daily use or is visibly broken. Do first.
- **P1** — high-value, asked for explicitly, ships this cycle.
- **P2** — wanted, not urgent. Fills the cycle if P0/P1 land early.
- **P3** — nice-to-have / exploratory.

**Effort** — `S` (<½ day) · `M` (½–1 day) · `L` (multi-day / needs its own plan).

**Each item:** what it is · why · acceptance (when it's "done").

---

## 1. Where v2 stands today (the baseline)

Already shipped and tested in v2.1 — **do not re-plan these, they exist:**

- Offline-first PWA at `/v2`, IndexedDB + Google Drive sync (single `rezepte.json`).
- Cookbook: browse, search, category/cuisine/season/effort filters, favourites, ratings.
- Cooking mode: full-screen steps, portion scaler, per-step timers, wake-lock.
- Weekly meal planner (deterministic) + shopping list with pantry subtraction & store-aisle grouping.
- **Lager** (pantry on/off chips + fridge fresh items with AI photo scan).
- **Koch-Match** (Tinder-style swipe).
- Recipe capture: manual / photo-scan / URL-import (all BYOK, key-gated).
- i18n **DE / EN / ES** (UI only), in-app Guide, BYOK AI (Haiku default / Sonnet vision).

**Two structural facts that shape the roadmap:**
1. **Recipe *content* is not translated** — only the UI is. The bundled base recipes
   (`v2/data/rezepte.snapshot.json`) are German. This is why "languages" below is bigger
   than just adding Danish.
2. **The AI system prompt is hardcoded to Marcel's profile** (`src/ai/prompts.js`). Any
   "make the AI flexible" work means lifting that profile into editable settings.

---

## 2. Epic A — Bug fixes & polish *(P0 — do first)*

The "make the existing app not feel broken" pass. Small, high-impact.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| A1 | ✅ **Capture photo not cleared** *(shipped v2.2)* | On save/cancel the held `photoFile`, preview, URL field, busy + status now reset — re-entering capture is a clean slate. | P0 | S |
| A2 | ✅ **"AI is working" is invisible** *(shipped v2.2)* | Capture now shows a spinner + two-step "Reading the recipe…" → "Building the recipe…" busy banner during the vision call. | P0 | S |
| A3 | ✅ **AI prompt is Marcel-only** *(shipped v2.2)* | Cook profile (level/diet/servings/weekday/weekend/shopping/equipment/spices/notes) lifted into Settings → IndexedDB, fed into `buildSystemPrompt`; Marcel's values are the defaults. AI responses now also follow the selected UI language. | P1 | M |
| ✅ **A4** | **General bug sweep** *(done 2026-06-13)* | Read-only sweep after the B3 overlay refactor. Found + fixed 1 P1 regression (shopping list lost aisle/icons in non-DE UI — now aggregates from German via `getRecipeDe`, commit `7467e35`). Verified clean: no Drive-corruption path, cooking-mode cleanup correct, i18n key-parity guarded. Cosmetic backlog below. | P1 | — |
| ✅ **A5** | **🍳 logo → home (Marcel)** *(shipped 2026-06-14, via K1)* | Shipped as part of the shared-header extraction (**K1**). The brand symbol on every view is now a real `<button class="brand-home">` → `navigate("cookbook")`, with `aria-label="Startseite"` (i18n DE/EN/ES/DA), a ≥44px touch target and a `:focus-visible` ring. Verified in-browser from cookbook/lager/match/guide. `guide.js` keeps its ← back button (no home button) by design; `match.js`'s extra action coexists. | P1 | S |

| ✅ **A6** | **P0 — App startete gar nicht (weiße Seite, kein Login)** *(fixed 2026-08-05, v2.10.1)* | `src/version.js` used typographic quotes (`U+201C/U+201D`) as string delimiters on `BUILD`, `APP_VERSION` and the four newest CHANGELOG rows — almost certainly pasted from a rich-text editor. That is a **SyntaxError**: `version.js` never parsed, `app.js` imports `BUILD` from it, so the **entire ES-module graph failed to load**, `#app` stayed empty and the Google login button was never rendered. The 170-test suite stayed green throughout because **no test imported the app modules**, and `node --check file.js` parses `.js` as CommonJS and exits 0 on this error — the bug was invisible to every existing guard. **Fixed:** delimiters restored (inner German `„…“` typography preserved and normalised). **Guarded:** new `tests/test-module-syntax.js` parses every `src/**/*.js` as a true ES module (via a `.mjs` copy + `node --check` in a child process — no module code is executed). **Hardened:** a dependency-free boot guard in `index.html` now renders an explanatory recovery card with a "clear cache & reload" button instead of a white screen, and surfaces the underlying error. Verified in real Chromium: healthy boot renders 105 recipes + "Mit Google verbinden"; a deliberately broken module renders the recovery card. 171 tests green. | **P0** | S |

**Bug-sweep findings still open (low priority, 2026-06-13):**
- ✅ **S1 · Untranslated display fields in non-DE UI** *(shipped v2.9)* — `lastCooked` ("Mai 2026") now translates month names via `tLastCooked()` in cookbook cards and detail view. Cuisine/season filter chips now translate via `tCuisine()`/`tSeason()` (data attrs stay canonical German for filtering). `time` ("35 Min") left as-is — free-form string, not worth P3·S effort. `tCuisine`/`tSeason`/`tLastCooked` follow the same pattern as `tCat`; 3 new unit tests; 166 green. P3·S.
- **S2 · Mixed-language Markdown export** — `exportMarkdown` keeps German section headers + field labels but the recipe bodies are now localized. Works; slightly inconsistent. Decide: all-German export (use `recipesDe`) vs. fully-localized. P3·S.
- **S3 · Localized shopping item names** — shopping list items are currently German (so the German aisle-catalog matches). To show item names in the UI language *and* keep aisle/icon matching, pass both arrays (1:1 guaranteed) into `aggregateIngredients` and match on the German one. P2·M.

---

## 3. Epic B — Languages & recipe content *(P1)*

Marcel: "German, English, **Danish**, Spanish — and the base recipes should also be in the chosen language."

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| ✅ **B1** | **Add Danish UI** *(shipped v2.3)* | Added `da` to `LANGS` (flag 🇩🇰) + a full `DICT.da` block in `i18n.js`. Guarded by a new full-recursive key-parity test (every lang must match the DE key set exactly — no gaps, no extras). | P1 | M |
| ✅ **B2** | **Translate base recipes** *(shipped v2.3)* | Pre-translated bundled snapshots `rezepte.snapshot.{da,es,en}.json` (105 recipes each), generated via `tools/build-snapshots.mjs`, validated by `tools/check-snapshots.mjs` (0 schema errors, 0 marker/length warnings, 0 genuine fallbacks). User-added recipes stay in their input language. | P1 | L |
| ✅ **B3** | **Apply translation in-app** *(shipped v2.3)* | Display-time overlay: `state.recipes` is the localized view; private German canonical (`recipesDe`) feeds persistence so Drive stays German. Switching language re-fetches the bundled snapshot + re-renders; no DB write. Verified end-to-end (DE→DA→DE, category stays canonical, user-state preserved). | P1 | M |

**B2 decisions made & pipeline (shipped — generation + wiring still to run):**
- **Model:** pre-translated snapshots, generated once via the Anthropic API (`v2/tools/build-snapshots.mjs`), run by Marcel with his key in an env var. No reusable translation tooling beyond this one-time generator.
- **Two hard constraints baked into the design:**
  1. **`category` stays the canonical German enum** in all data (schema validation + cross-language filtering). Only its *display* is translated — already done via `tCat()` (committed `da47728`).
  2. **Drive `rezepte.json` is canonical German**, shared with v1 + in-project Claude. Translated content is therefore a **display-only overlay** from bundled `rezepte.snapshot.<lang>.json`; it is **never written to IndexedDB/Drive**. Pure logic in `v2/src/data/baseLang.js` (`overlayTranslation`/`localizeRecipes`/`checkTranslation`), unit-tested.
  3. Marker preservation: `🛒` shopping markers + tip-keywords (`Topping:/Swap:/Alltags-Upgrade:/Technik:`, parsed by `derive.js`) are preserved by the translator prompt + validated by `checkTranslation`.
- **Remaining steps:** (1) Marcel runs the generator → 3 snapshot files. (2) Wire the in-memory display-overlay: keep `state.recipes` German (persist source), add a localized *view* for read surfaces — `favorite`/`rating`/`cookedCount`/`feedback` mutations must keep hitting the German object so they never persist translated content. (3) Add the 3 files to `sw.js` SHELL + bump CACHE/BUILD. (4) Live-verify.

> **How Marcel runs the generator (PowerShell):**
> ```powershell
> $env:ANTHROPIC_API_KEY = "sk-ant-…"
> node v2/tools/build-snapshots.mjs           # all three: da, es, en
> ```
> Optional: `$env:MODEL = "claude-haiku-4-5"` (cheaper) · `node v2/tools/build-snapshots.mjs da` (one language). Key stays local; a cache (`tools/.translation-cache.json`) makes reruns cheap/resumable.

---

## 4. Epic C — Recipe intake *(P1)*

Make getting recipes *in* fast — single, bulk, photo, URL.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| C1 | ✅ **Bulk add / multi-recipe prompt** *(shipped v2.2)* | Capture page now has a "📋 Several at once" card: paste many recipes OR ask the AI for several ideas → batch review list (per-item checkbox + edit) → save selected. | P1 | M |
| C2 | **Capture polish** | Covered by A1/A2 — keep them together with intake when building. | P0 | S |
| C3 | **Flexible AI prompt** | Covered by A3 — the same profile that drives suggestions drives capture/generation tone. | P1 | M |

---

## 5. Epic D — Lager (pantry/fridge) *(P1)*

Marcel: "I want to add fridge/pantry items the same icon-driven way as the shopping list, not just free text."

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| D1 | ✅ **Icon-based add for Lager** *(shipped v2.2)* | Fridge section now has the `shopping/catalog.js` icon picker (collapsible aisles); tapping adds with its emoji. Free-text adds also auto-match an icon via `ingMatchCat`. Fridge rows now show icons. | P1 | M |
| D2 | **Shared item catalog** | Promote `CATALOG` to a shared module so shopping + Lager + (later) recipe ingredients all map names→icons→aisles from one source. **Done:** one catalog, three consumers, no duplication. | P2 | S |

---

## 6. Epic E — Shopping list *(P1–P2)*

Marcel: clear button, partial photo-based removal, more options, sort-by-supermarket button.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| E1 | ✅ **Clear-list button** *(shipped v2.2)* | "Alles löschen" empties the list; an undo bar restores it for ~6s. | P1 | S |
| E2 | ✅ **Sort options + sort-by-aisle toggle** *(shipped v2.2)* | Sort bar with "🛒 Aisle / 🔤 A–Z" (choice persisted), checked items sink to the bottom within each group. ("By recipe" deferred — items don't yet carry a source-recipe link.) | P1 | M |
| E3 | **Photo-based partial removal** | Snap a photo of what you already bought/own → AI removes just those items from the list. (Same vision path as fridge scan, inverse action.) **Done:** photo → matched items struck/removed, rest untouched. | P2 | M |

---

## 7. Epic F — Discovery & generation *(P2)*

Marcel: more dishes / taste-based generation, multi-filter AND/OR, Match "gold" re-swipe.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| F1 | **Generate many dishes to taste** | "Give me 10 dishes I'd like" → batch generation tuned by the cook profile (A3), reviewed and saved via the C1 batch flow. **Done:** one ask → many on-taste drafts → batch save. | P2 | M |
| ✅ **F2** | **Multi-filter (AND/OR)** *(shipped v2.4)* | Faceted filtering: chips are multi-select (OR *within* a facet — categories/specials/cuisine/season), facets combine via an explicit UND/ODER toggle (AND default = intersection, OR = union). Cuisine & season moved into a collapsible "Mehr Filter" panel as multi-select chips. Live `{n} Treffer` count + "Filter zurücksetzen". `filterRecipes` extended (back-compatible single-`chip` signature kept) + `activeFilterCount`/`isSpecialChip`; 7 new unit tests. Verified live: 7→4 (AND) / 48 (OR). | P2 | L |
| F3 | **Match "gold" / compare** | Re-surface "yes"-swiped recipes: re-swipe them, or see liked recipes side-by-side to choose between them. **Done:** a "liked" view with re-swipe + compare. | P2 | M |

---

## 8. Epic G — Claude controls the recipe file *(P2)*

Marcel: "When I write recipe adjustments/comments for Claude, Claude should be able to fully update the recipe file."

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| ✅ **G1** | **Full-file edit contract** *(shipped 2026-06-13)* | `SCHEMA.md` tightened: new **Re-Sync & Konfliktmodell (Last-Write-Wins)** section + a worked edit-existing-recipe example; rules 11–12 (write whole file, pass app-owned fields `photos`/`rating`/`favorite`/`cookedCount` through). Round-trip proven by 2 new `test-migrate.js` cases (edit existing + append) — edit preserved, photos/ratings untouched, validates clean, idempotent. App re-sync path confirmed in `sync.js` (clean local + differing remote `updated` → remote replaces local). **Done.** | P2 | M |

---

## 9. Epic H — Dev tooling: DREAM agents & skills *(P2)*

Marcel: build skills/agents that sweep the code with "DREAM" functionality — one for bug fixes, one for the obvious stuff, one super-creative — to generate bugs lists and fresh backlog items.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| ✅ **H1** | **Bug-hunter agent** *(built 2026-06-14)* | `.claude/agents/koch-bug-hunter.md` — read-only sweep for real defects (state leaks like A1, error handling, offline/sync edge cases, Drive-corruption paths, i18n key gaps) → findings to `qa/findings/bug-hunter.md`. | P2 | M |
| ✅ **H2** | **Simplifier agent** *(built 2026-06-14)* | `.claude/agents/koch-simplifier.md` — dead code, duplication, over-engineering, a11y/copy consistency → `qa/findings/simplifier.md`. | P2 | S |
| ✅ **H3** | **Creative / UX-curator agent** *(built 2026-06-14)* | `.claude/agents/koch-ux-curator.md` — "what would make this delightful" + UX/a11y/navigation/mobile-reachability → `qa/findings/ux-curator.md` (ideas, never auto-planned). | P3 | S |
| ✅ **H4** | **Fleet orchestration + overnight rerun** *(built 2026-06-14)* | `qa/run-fleet.md` runbook + `.claude/agents/koch-architect.md` and `koch-test-warden.md` round out a **5-agent fleet**. Re-runnable on demand or on a nightly schedule (see `qa/README.md` → "Running overnight"). Each run regenerates `qa/findings/*.md` + a synthesized `qa/FLEET-REPORT.md`. | P3 | S |

> Implementation note: the fleet is **read-only proposers**. Agents write to `qa/findings/`
> and never edit app code or this roadmap automatically — Marcel promotes findings into the
> backlog by hand. See **`qa/README.md`** for the full design, agent roster, and how to run
> the fleet manually or overnight.

---

## 10. Epic I — Sharing & collaboration on the shopping list *(P2–P3 · Marcel's ask)*

Marcel's **two end goals** (now explicit — they are different problems, not one feature):
1. **Couples / household** — a **persistent shared shopping list across two *different* accounts**
   (Marcel + partner), where both add/check items and a refresh shows the other's changes. Possibly
   later a shared *recipe* store too ("connected storage for couples").
2. **Friends contribute** — let **other people drop items onto my list** ("can you add oat milk?"),
   where the friend may **not** have the app or a Google account. This is the harder, open-audience case.

**Architecture reality (read before estimating).** The shopping list is **local-only today**: only
`recipes` round-trips to Drive; the list lives in IndexedDB (`shopping.js`) and is never synced
(`store.js`/`sync.js` only know the recipe collection). And the app deliberately uses the
**privacy-minimal `drive.file` scope** (`drive.js:9`) — it can only see files **it** created. So
real sharing is **a new synced data object plus a cross-account access model**, not a UI tweak.

### The storage-model decision (this gates everything below)

| Model | How a 2nd account gets in | Backend? | Friends w/o Google? | Verdict |
|-------|---------------------------|----------|---------------------|---------|
| **A. Shared Drive file + Picker** | A creates `einkaufsliste.json`, shares it to B's Google account; B opens it **once via the Google Picker** → `drive.file` then covers that file for B too. Both read/write the same file. | **None** ✅ | **No** ❌ | **Best fit for couples.** Stays in-scope, free, no server. Needs Picker integration + a one-time share handshake. *(Verified: `drive.file` reaches a file another user shared **only** after the Picker grants it — discovery without the Picker would need a broader scope.)* |
| **B. Broader Drive scope (`drive`)** | App lists all of Drive, finds the shared file by id/name — no Picker. | None | No | **Avoid.** Breaks the privacy-minimal promise, triggers Google's verification/consent friction, app can read the user's entire Drive. Not worth it. |
| **C. Minimal backend (Firebase/Supabase free tier)** | Each list gets an id + invite link; anyone with the link writes via a tiny web form — no Google, no app install. | **Yes** (free tier) | **Yes** ✅ | **The only model that satisfies "friends".** Real-time-ish, link-based, account-less. Cost: violates the current "no server / no SaaS" constraint; adds auth/hosting/maintenance. A **V3-scale decision**. |

**Cross-cutting data-model decision (do this once, reuse everywhere):** store the list as an
**item-level merge set** — each item `{id, name, qty, aisle, checked, updated, author, deleted}` —
and merge by **union + last-writer-per-item**, *not* whole-file Last-Write-Wins. Whole-file LWW
makes two simultaneous editors clobber each other (exactly the K2 conflict, now multiplied per item).
Item-merge makes "two people each add something" just *work* on the next refresh. This model is
transport-agnostic: it works over Drive (A) **and** over a backend (C), so designing it now means
the friends step doesn't force a rewrite.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| ✅ **I1** | **Share the list (one-way, ship now)** *(shipped 2026-06-17, v2.8)* | "📤 Teilen" button in the list's action bar emits the list as plain text via Web Share API (native share sheet) with clipboard fallback. Aisle-grouped, open items (•) before done items (✓), qty shown. `formatListAsText()` is pure + unit-tested (5 cases). i18n DE/EN/ES/DA. | P2 | S |
| 🔄 **I2** | **Couples: two-way shared list (Model A — shared Drive file, refresh-to-sync)** *(Plan 01 shipped v2.10 — core sync done; Picker handshake pending Plan 02)* | ✅ `listMerge.js` pure mergeList + 7 unit tests. ✅ `listSync.js` mirrors sync.js (syncListWithDrive, saveList, onStatus, getStatus). ✅ `drive.js` createFile accepts fileName param. ✅ `shopping.js` wired: Drive sync on load, save dirty-flag, Refresh button, tombstone filter. ✅ `einkaufsliste.json` created on Drive on first sync. ✅ 173 tests green, CACHE "koch-v2.10-1". **Pending (Plan 02):** Google Picker integration for partner linking (sl-link-partner button stub is in place); cross-account share handshake UX. | P3 | L |
| I3 | **Friends: open contribution (Model C — needs the backend decision)** | The real end goal: a shareable **link** that lets someone **without the app or a Google account** add an item to my list. This is **not reachable inside `drive.file`** (a non-Google friend can't touch a Drive file). Honest options: **(a)** constrain "friends" to "people who also run the app + Google" → then it's just I2 with a multi-party share (no new tech); **(b)** stand up a **minimal free-tier backend** (Firebase/Supabase) holding the list behind an invite link + a tiny add-item web form, with the same item-merge model. **This is a deliberate architecture decision, almost certainly V3** (it reverses the "no server" constraint). **Done:** decision recorded (a vs b); if (b), a spike proving link → friend adds item → owner sees it after refresh. | P3 | L |

> **Sequencing & honesty:**
> 1. **I1 now** — real value, trivial, also the pragmatic "friends" answer for today.
> 2. **I2 next as its own mini-plan** — couples is fully achievable **with no backend** (Model A +
>    item-merge), and K2 already laid the sync seam. Biggest new pieces: the Picker handshake and
>    `mergeList()`.
> 3. **I3 is a fork in the road, not a sprint task.** The friends-with-no-account end goal genuinely
>    collides with "no server / free / no SaaS". Be honest with yourself: either redefine "friends"
>    as app-users (cheap, Model A) or accept a minimal backend (Model C, V3). Don't half-build it on
>    Drive — `drive.file` structurally can't let a non-Google friend write.

---

## 11. Epic J — Navigation & wayfinding *(P1–P2)*

Spun out of the 🍳-logo ask (A5) because it points at a bigger, evidence-backed nav gap.

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| ✅ **J1** | **🍳 logo → home** *(= A5, Marcel — shipped 2026-06-14)* | Done with K1/A5: home affordance now on every view. First step of the nav model below. | P1 | S |
| J2 | **Bottom tab bar for primary sections** *(Claude addition — research-backed)* | Today navigation is **hamburger-only** (`menu.js`, ☰ on every header). Nielsen Norman Group: hidden menus cut task completion ~21%; teams that moved core destinations to a **visible bottom tab bar** saw feature discovery +30%. Best practice for ≤5 primary sections: a persistent bottom tab bar (Kochbuch · Match · Lager · Einkauf · Planer), thumb-reachable, with the ☰ retained for secondary items (Capture, Assistant, Settings, Export). The 🍳 home affordance (A5) folds into this. **Done:** primary sections reachable in one thumb-tap from anywhere; ☰ holds the long tail; a11y labels + active-state. *Idea only — not committed; Marcel decides.* | P2 | M |

> Why this is in the roadmap and not just done: it changes the app's shell on every screen and
> touches all 10 views. It deserves a deliberate decision, not a drive-by. The 🍳→home (A5) is the
> safe, immediate piece; the tab bar is the strategic follow-on.

---

## 12. Epic K — QA-fleet findings *(promoted 2026-06-14)*

The first run of the QA agent fleet (`.claude/agents/koch-*.md`) produced these. Full detail +
per-agent reports in **[`qa/FLEET-REPORT.md`](qa/FLEET-REPORT.md)**. **Headline: no P0/P1 defects —
the app is healthy.** What's below is sharpening. The two `★` items are where **3 of 5 agents
converged independently** — trust those most.

| # | Item | From | Detail & acceptance | Pri | Eff |
|---|------|------|---------------------|-----|-----|
| ✅ ★ **K1** | **Build A5 (🍳→home) *as* a shared `appHeader()`** *(shipped 2026-06-14)* | simplifier + ux + (bug-hunter) | Done. The 10× hand-rolled `app-header` block is now one parameterised `appHeader({icon,title,sub,subId,source,right,extra,left})` + `wireHeader()` in `ui/helpers.js`. All 9 view files + both assistant states route through it; the two variants are absorbed via the `left` slot (guide back button) and `right` slot (match action). The 🍳 (and each view icon) is a real home button → cookbook. Suite still 145/145; i18n parity green (new `common.home` key ×4). Net markup down ~80 lines. | **P1** | M |
| ✅ ★ **K2** | **Extract a pure `decideSync()` + pin the offline-overwrite** *(shipped 2026-06-14, v2.7)* | bug-hunter + test-warden + architect | Done. LWW decision lifted into pure `src/data/decideSync.js` (`decideSync({hasRemote, localUpdated, remoteUpdated, dirty, source}) → "create"\|"push"\|"pull"\|"conflict"\|"noop"`), no I/O, no imports. **Intentional resolution of the silent-discard bug:** an offline `dirty` edit + a same-or-newer Drive stamp now returns **`conflict`** — `sync.js` keeps the local data + `dirty` flag and surfaces "Konflikt — lokale Änderung behalten, Sync ausstehend" instead of overwriting (was `sync.js:101-119`, repro in `qa/findings/bug-hunter.md`). 9-case decision matrix in `test-decide-sync.js` (suite 155). Added to `sw.js` SHELL + CACHE/BUILD bumped to v2.7. This is the collection-agnostic seam **Epic I2** builds on. | **P1** | M |
| ✅ **K3** | **Accessibility pass** *(shipped 2026-06-14, v2.7)* | ux-curator | ✅ **Done:** 🍳 home + ☰ menu `aria-label` (centralised in `appHeader()`); global `:focus-visible` outline in `base.css`; **all 7 sheet ✕ close buttons** now carry `aria-label="${t('common.close')}"` (`menu/cooking/match/planner/assistant/detail/form`); **title-less remove buttons** labelled with `common.remove` (shopping `sl-rm`, Lager `fi-del` ×2, detail photo `rm`, `makeListEditor` rows); shopping `+/−` steppers get `aria-label` (new `shopping.less/more` ×4 langs); `.icon-btn` and shopping `+/−`/`✕` bumped from 30px → **44px hit target** (WCAG 2.5.5). (Match swipe + planner 🔒🔄📖 controls already carry `title` = accessible name; left as-is.) ✅ **Keyboard-operable cards** *(2026-06-14)*: cookbook `.rcard` + matches `.match-row` got `role="button"` + `tabindex="0"` + `aria-label` (recipe name) + Enter/Space handler (guarded so the nested heart/remove button keeps its own keys); `:focus-visible` ring extended to both; new `cookbook.toggleFav` ×4. ✅ **Sheet a11y** *(2026-06-14)*: `ui/sheet.js` now sets `role="dialog"`/`aria-modal`, moves focus into the sheet on open, **traps Tab** (wraps first↔last), closes on **Escape**, and **restores focus** to the trigger on close. Verified in-browser (fresh runtime): focusOnOpen=close, Tab-wrap, Esc-close, focus-restore all pass. **K3 done.** | P2 | S |
| ✅ **K4** | **Two invariant guard-tests** *(both shipped 2026-06-14)* | architect | ⚠️ **Not hypothetical:** on 2026-06-14 `data/baseLang.js` (imported by `store.js`) was found **missing** from the `sw.js` SHELL list — it would 404 on a fresh offline install. Fixed in the same commit; now `koch-release-captain` guards this class. ✅ (a) **SHELL-coverage test** — `v2/tests/test-sw-shell.js` (globs `v2/src/**/*.js`, fails if any module is absent from the `sw.js` SHELL list). ✅ (b) **Persistence-canonicality test** — `v2/tests/test-canonical.js` (3 cases): proves the localized overlay never mutates the German canonical, that `toFileString` of `recipesDe` is German with **no** translated strings, and a source-level wiring guard that `saveCollection(…)` is only ever called with `recipesDe` (never `state.recipes`). Suite now **158**. | P3 | S |
| ✅ **K5** | **i18n leak fix** *(shipped 2026-06-14)* | ux-curator | Done. The two hardcoded German strings now route through `t()`: new keys `assistant.schemaFail` (with `{errors}`) and `detail.photoFail` (with `{msg}`), added across DE/EN/ES/DA. Parity test green. | P3 | S |

> Also surfaced and already tracked: **J2** (bottom tab bar) and **Epic I** (shopping-list sharing).
> **Verified clean — don't re-investigate:** catalog is single-source (D2 done), the canonical-German
> overlay does not leak (all 3 recipe mutators persist via `recipesDe`), cook-mode ergonomics are the
> best-tuned surface, recipe-content logic is well covered.

---

## 13. V3 — The big rebuild *(separate horizon — needs its own plan)*

Not part of the 1–2 week cycle. V3 is a deliberate re-architecture; list here so the
v2.x work stays compatible with it.

- **Real app-store build** — package for the Google Play / app ecosystem. Likely means
  moving off "single-folder static PWA" toward a proper build (TWA/Capacitor or a framework).
  **Decide the stack first — this is a planning task, not a coding task.**
- **Payments** — if a private/shared API key isn't viable, design a paid tier (covering
  AI costs, "pay double" model). Options to evaluate: store IAP, Stripe, or stay BYOK-only.
- **All bug fixes carried in** — every v2.x fix (photos, capture, prompts) must be in V3 from day one.
- **Architecture review** — where data lives (Drive vs. local vs. backend), performance,
  bundle size, code language, and whether the design is still "slim and well-built" at scale.
- **Default food photos** — base recipes ship with appetising images, not just user uploads.

**Hard dependency:** V3 should not start until Epics A–B are done — a rebuild that carries
forward the photo bug and German-only content just relocates the problems.

---

## 14. Claude's additions — quick wins worth doing before V3

Marcel asked for extra ideas on top. These are cheap, fit the existing architecture, and
sharpen the app without waiting for the rebuild:

1. ✅ **"Cook from what I have"** *(shipped v2.5)* — assistant tool "🥕 Aus Vorrat kochen":
   pulls the Lager fridge (+ pantry, already in the system prompt) and asks for dishes needing
   mostly on-hand items, prioritising perishables. `fromStockUserPrompt` in `prompts.js`,
   4th tool button in `assistant.js`. *(P1, S)*
2. **Servings memory per recipe** — remember the last portion scale per recipe so the cooking
   mode opens at the size you actually cook. *(P2, S)*
3. ✅ **Offline AI honesty** *(shipped v2.5)* — shared `gate.aiUnavailableReason()` ("nokey" /
   "offline" / ""). Assistant shows a reason-specific view (offline → "Erneut versuchen", no-key →
   Settings); capture status note + gate and the Lager fridge-scan now distinguish offline from
   no-key inline instead of just failing. *(P1, S)*
4. **Duplicate guard on capture** — warn before saving a recipe whose name closely matches an
   existing one (URL imports especially). *(P2, S)*
5. **Shopping list "snapshot" to Lager** — when you check off bought items, optionally push the
   perishables into the fridge section of Lager in one tap. Closes the shop→stock→cook loop. *(P2, M)*
6. **Weekly plan → "cook history"** — when a planned day is marked cooked, auto-update
   `lastCooked`; the planner already avoids recent dishes, so this makes rotation real. *(P2, S)*
7. **One-tap recipe share/export** — export a single recipe as text/markdown to send a friend.
   The export module already exists for the full collection; scope it to one recipe. *(P3, S)*

**From a June 2026 market scan of recipe/meal-planning apps** (Paprika, AnyList, Mealime, Plan to
Eat, Samsung Food, Clove) — features that are now table-stakes and fit this architecture:

8. **Recipe import from a social link / video** — import from a YouTube/Instagram/TikTok URL, not
   just a generic web page. Extends the existing URL-import (vision/`web_fetch`) path. *(P3, M)*
9. **Pantry-aware "what can I cook now"** — already half-built via Lager + "Aus Vorrat kochen" (v2.5);
   surface it as a first-class home-screen card, not only an assistant tool. *(P2, S)*
10. **Cook-mode hands-free / voice step advance** — "next step" by voice while your hands are messy.
    Web Speech API, no backend, BYOK-free. A genuine delight differentiator. *(P3, M)*
11. **Nutrition / macro estimate per recipe** — optional AI-estimated calories & protein (relevant to
    Marcel's eggs-as-protein, fitness focus). BYOK, cached on the recipe. *(P3, M)*

---

## 15. Suggested sequencing (next 1–2 weeks)

A pragmatic order — fix what's visibly broken, then the high-value asks, then breadth.

**▶ Right now (post-fleet, 2026-06-14):** ✅ **K1 shipped** (A5 🍳→home via the shared `appHeader()`),
✅ **K5** (i18n leak), ✅ **K4a** (SW-shell guard test) and ✅ **K2** (pure `decideSync()` + the
offline-overwrite now resolves to an explicit `conflict` instead of silent data loss — the seam **I2**
needs). **Next:** the rest of **K3** (mechanical a11y sweep) and **K4b** (persistence-canonicality
guard test) as cheap insurance, then **Epic I** (I1 share-as-text is the cheap win; I2 builds on K2).

**Days 1–2 — stop the bleeding (P0):**
A1 photo-clear · A2 AI busy state · E1 clear-list button · #3 offline AI honesty.

**Days 3–5 — the headline asks (P1):**
A3 editable cook profile → C1 bulk add → D1 icon-based Lager → E2 sort options.

**Days 6–8 — languages (P1, plan B2 first):**
B1 Danish UI · then the B2/B3 content-translation track (decide model (b)+(a) before coding).

**Days 9–10 — breadth (P2) & tooling:**
F3 Match compare · E3 photo-removal · G1 file-edit contract · stand up H1 bug-hunter and
let it refill this backlog.

**Continuous:** run H1/H2 between epics; append findings here; keep `SCHEMA.md` the contract.

---

*Update this file as items ship. Mark done with the build number. When the backlog thins,
re-run the H4 regenerator. Keep V3 (§10) decoupled until A–B are complete.*
