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

**Bug-sweep findings still open (low priority, 2026-06-13):**
- **S1 · Untranslated display fields in non-DE UI** — `time` ("35 Min"), `lastCooked` ("Mai 2026"), and the cuisine/season filter values stay German (only name/ingredients/steps/tips are translated). Cosmetic; filtering still works (canonical). P3·S.
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

Marcel: "Share the shopping list with other members, and collaborate on a **shared list that
updates when you refresh the page**."

**Architecture reality (read before estimating):** the shopping list is **local-only today.**
Only `recipes` round-trips to Drive — the list lives in IndexedDB (`shopping.js`) and is never
synced (`store.js`/`sync.js` only know the recipe collection). So this epic is **not a UI tweak;
it's a new synced data object.** Two honest sub-features:

| # | Item | Detail & acceptance | Pri | Eff |
|---|------|---------------------|-----|-----|
| I1 | **Share the list (one-way)** | Quick win, no new sync engine: a "Teilen" action that emits the current list as plain text (Web Share API / copy-to-clipboard) so a housemate can receive it in any messenger. **Done:** one tap → shareable text list (aisle-grouped, respects checked state). | P2 | S |
| I2 | **Collaborative shared list (two-way, refresh-to-sync)** | Persist the list to its **own Drive file** (`einkaufsliste.json`), Last-Write-Wins on an `updated` stamp, **pulled on app load + a manual "🔄 Aktualisieren" button** (matches Marcel's "updates on refresh" model — not real-time). Two devices editing the same file converge after a refresh; offline edits queue + push like recipes. **Key design decision to make first:** with the privacy-friendly `drive.file` scope the app only sees files **it** created, so true cross-account sharing needs one of: (a) the other member opens the *same* shared Drive file through the app (shared-folder model), (b) a broader Drive scope, or (c) item-level merge instead of LWW so two people's edits don't clobber each other. **Prereq:** generalise `sync.js` from "the recipe collection" to a **collection-agnostic sync** (file id + meta per object) — see architecture findings in `qa/`. **Done:** list survives reload; a second signed-in device sees added items after refresh; conflicts resolve predictably; offline → queued → pushed. | P3 | L |

> Sequencing: ship **I1 now** (cheap, real value), treat **I2 as its own mini-plan** gated on the
> `sync.js` generalisation. Don't bolt a second ad-hoc Drive writer next to the recipe one —
> refactor to one sync core first, or the Drive-corruption surface doubles.

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
| ★ **K2** | **Extract a pure `decideSync()` + pin the offline-overwrite** | bug-hunter + test-warden + architect | Lift the Last-Write-Wins decision out of `sync.js`'s async I/O into a pure `decideSync({localUpdated, remoteUpdated, dirty, source}) → "push"\|"pull"\|"noop"\|"create"`. This (a) exposes and lets you **decide** the silent discard of an offline `dirty` edit when Drive is newer (`sync.js:101-119` — currently lost with no warning), (b) is the exact seam **Epic I2** (shared shopping list) needs to go collection-agnostic, (c) makes the conflict rule an executable spec before it's multiplied across a second synced object. **Done:** pure helper + unit-tested decision matrix; the offline-edit case is either preserved or explicitly, intentionally chosen. **Do this before I2.** | **P1** | M |
| ◑ **K3** | **Accessibility pass** *(partly shipped 2026-06-14)* | ux-curator | ✅ **Done:** 🍳 home + ☰ menu buttons now carry `aria-label` (centralised in `appHeader()`, so one fix covers all 10 headers); global `:focus-visible` outline added in `base.css` for `.icon-btn/.chip/.menu-item/.btn-*/.fab`; 🍳 already ≥44px. **Still open:** `aria-label` on the per-view ✕ close buttons (`menu.js`, `detail.js`, `form.js`, `cooking.js`, `match.js`, `planner.js`), match swipe + planner 🔒🔄📖 controls; keyboard-operable recipe cards (clickable `<div>`s → `<button>`/`role`); sheet Escape-to-close + focus trap/restore in `ui/sheet.js`; bump `.icon-btn` (~30px) and shopping `+/−` steppers to a 44px hit area. | P2 | S–M |
| K4 | **Two invariant guard-tests** | architect | ⚠️ **Not hypothetical:** on 2026-06-14 `data/baseLang.js` (imported by `store.js`) was found **missing** from the `sw.js` SHELL list — it would 404 on a fresh offline install. Fixed in the same commit; now `koch-release-captain` guards this class. ✅ (a) **SHELL-coverage test** — *shipped 2026-06-14* as `v2/tests/test-sw-shell.js` (globs `v2/src/**/*.js`, fails if any module is absent from the `sw.js` SHELL list; suite now 146). **Still open:** (b) **Persistence-canonicality test** — assert only `recipesDe` content can reach Drive (guards the German-canonical invariant against a future regression). Cheap insurance for already-correct architecture. | P3 | S |
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

**▶ Right now (post-fleet, 2026-06-14):** ✅ **K1 shipped** (A5 🍳→home via the shared `appHeader()` —
ask delivered + biggest duplication removed; also caught & fixed a real SW-shell gap, see K4). **Next is
K2** (extract `decideSync()` + pin the offline-overwrite — unblocks the shared shopping list safely).
Do K2 before starting **Epic I2**. Then K3 (a11y) and K4 (the two guard-tests) as cheap insurance.

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
