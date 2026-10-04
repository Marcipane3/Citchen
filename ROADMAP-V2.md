# 🍳 Koch — V2 Roadmap (v2.x)

> **Scope of this file:** every release on the **v2.x line**, from today until V3 launches and v2
> becomes the 30-day fallback. Features and the foundation V3 needs ship here.
> **Not here:** domain, Play Store, onboarding tour, default photos, clean-up, anything after
> v3.0 → see **[ROADMAP-V3.md](ROADMAP-V3.md)**. What to do next → **[ROADMAP.md](ROADMAP.md)**.
>
> Owner: Marcel · Maintained by Claude Code · **Last updated: 2026-10-04** · Current build: **v2.14**
> (`/v2`, 215 tests; live since PR #8 was merged on 2026-10-04).

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
| — (no release) | ★ Safety net | P2 end-to-end tests | mid Oct | next | — |
| **v2.15** | ★ One sync core | P1 | late Oct | planned | P2 (guards the refactor) |
| — (Marcel) | ★ Sharing proof | P3 two-account test, P4 live friend test | Oct | open since v2.11 | Picker key + partner as test user |
| **v2.16** | AI housekeeping | Q1 Sonnet 5.5 capture + model config · Q2 prompt caching · Q3 token measurement | early Nov | planned | — |
| **v2.17** | Find recipes faster | F4 | mid Nov | planned | Marcel answers **G7** |
| **v2.18** | Recipe export / import | G2 | late Nov | planned | — |
| **v2.19** | Calories | L1 → L2 → L3 | Dec | planned | Marcel signs off **L1** |
| — | **Scope freeze** | no new v2 features after this | **31 Dec 2026** | — | — |
| **v2.20** | Assistant edits recipes | G3 | Jan 2027 | planned | Marcel answers **E6** |
| **v2.21** | Move to the new app | P5 (+ P6 if D8 = English data) | Jan 2027, **before the domain switch** | planned | C-20 repo layout, D8 |
| **v2.22+** | Small wins *(proposed)* | M1–M3, E3, QW-2, QW-4, QW-6 | Q1 2027, only if time | backlog | L2 for M1–M3 |
| v2.x final | Fallback | fixes only, then read-only for 30 days after v3.0 | May 2027 | — | V3 launch |

**Versioning rules:** `v2.N` per release (`BUILD` = `YYYY-MM-DD-v2.N`, SW `CACHE` = `koch-v2.N-1`);
hotfix = `v2.N.1`; test-only or doc-only work gets **no** version bump. Every release: changelog
line in `v2/src/version.js`, both roadmap files updated (see `ROADMAP.md` → update rule).

---

## 3. Open items

### Epic P — Path to V3: foundation & proof *(gates V3 slice 1)*

From `docs/v3/02-SCOPE.md`: "Must land in v2.x before slice 1: partner-sharing proof, one sync
core, end-to-end tests."

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **P1** | **One sync core** (check C-7, US-22) | One engine behind recipes (file-level last-write-wins + `decideSync`) and the shopping list (item merge + tombstones). The friend inbox (I3) stays its own channel. **Done:** both instances pass the full existing suite plus new two-instance tests; no behaviour change visible to the user. | P1 | L | v2.15 |
| **P2** | **End-to-end browser tests** (check C-13) | Playwright, dev-only (nothing ships to users). Flows: first run, language switch, add/edit recipe, capture review, cooking mode, shopping list, partner sync, offline start, update from previous build; planner → shopping at lower priority. **Done:** suite runs locally with one command and is green on the current build. | P1 | L | mid Oct |
| **P3** | **Two-account sharing proof** (US-06) — *Marcel* | The I2 test with your partner, steps in `v2/docs/SHARING.md`. Needs first: Google Picker API key in `drive.js` + partner added as OAuth test user. **Done:** two real accounts, Android + iPhone, both edit offline, no item lost. | P1 | S | Oct |
| **P4** | **Friends link live test** (I3) — *Marcel* | ✅ PR #8 merged 2026-10-04. Open the live app, create a link, a real friend adds an item from their phone. **Done:** item arrives with "von …" after reopening. Watch: Supabase free projects pause after ~7 days without traffic. | P1 | S | Oct |
| **P5** | **"Move to the new app" helper** (US-04, risk R13) | Exports browser-only data (stock, fridge, profile, settings, **friends-link owner token**) before the domain switch; warns about unsynced edits; tells the user the AI key must be re-entered. **Done:** export on old address → import on new address restores everything except the key. | P1 | M | v2.21 |
| P6 | **v2 reads file format 4** (check C-27) — *only if D8 = English as stored language* | A v2.x release that can read the new format **before** V3 writes it, so the 30-day fallback keeps working. | P1 | M | v2.21 |

### Epic Q — AI housekeeping

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| Q1 | **Capture on Sonnet 5.5 + model IDs in one config** (C-9, risk R9) | Capture still runs on `claude-sonnet-4-6`. Move all model IDs to one config; switch capture to `claude-sonnet-5-5`; re-run a capture check on 10 real photos/URLs. | P1 | S | v2.16 |
| Q2 | **Prompt caching** (C-11) | Cache the assistant system prompt (profile + stock + recipe list) to cut cost per chat turn. | P2 | S | v2.16 |
| Q3 | **Measure real token usage** (C-10) | Log `response.usage` per action locally; replace the estimates in the V3 report. Also the data source for the v3.x spend display. | P2 | S | v2.16 |

### Epic F — Discovery *(Marcel's main pain: "finding recipes is the hardest part")*

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **F4** | **Easier recipe finding** (US-17, question G7) | Marcel picks the two that help most: (a) photo grid · (b) sort by recently cooked / most cooked / newest · (c) favourites first · (d) filter chips · (e) search always visible · (f) "to try" list. Note: the photo grid only pays off once V3 default photos exist; (b), (c), (e) work today. | P1 | M | v2.17 |
| F1 | **Generate many dishes to taste** *(proposed: close as done)* | Already covered by C1 bulk "✨ KI-Ideen" + C3 profile-aware generation (v2.13): one ask → many drafts → batch review → save. Close unless Marcel wants more. | — | — | — |

### Epic G — Recipe file & sharing recipes

| # | Item | Detail & acceptance | Pri | Eff | Target |
|---|------|---------------------|-----|-----|--------|
| **G2** | **Recipe export / import** (US-07, check C-23) | Share button asks: "for import into the app" (lossless file) or "readable for others" (Markdown). Recipient imports; recipe appears in their cookbook. Works without Drive on either side; import validated against `SCHEMA.md`; an id clash never overwrites. Also settles **S2** (mixed-language Markdown export) and old quick win #7 (one-recipe share). | P1 | M | v2.18 |
| **G3** | **Assistant creates and updates recipes** (US-26, question E6) | The in-app assistant can add and change recipes; every change is shown for confirmation before saving. Open: may it also delete (E6)? Replaces the old "project-Claude edits `rezepte.json`" contract. | P1 | S–M | v2.20 |

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
| L1 | **Decide the nutrition model** | (a)+(b) vs (b)-only; field shape; `SCHEMA.md` section. **Done:** decision recorded here. | P1 | S | v2.19 |
| L2 | **Offline calorie calculator** | Bundled `nutrients.json` + unit→gram table + pure `estimateNutrition(recipe)` with tests. "≈ 520 kcal / Portion" on cards + detail; "≈" when < 80 % of weight matched. | P1 | M | v2.19 |
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

### Dropped

| # | Item | Why |
|---|------|-----|
| F3 | Match "gold" / compare | Cook match is never used and is removed in V3 (`docs/v3`, decision F8). |

---

## 4. Ground rules for every v2.x release

- `rezepte.json` stays **flat-v3** per `SCHEMA.md`; additive fields only.
- **Canonical German** in stored data; `category` stays the German enum; translations are display
  overlays and never persist (guarded by `test-canonical.js`). Under review for V3 (decision D8).
- Shopping list = item-level merge set; **every edit calls `touch()`**, deletes are tombstones.
- Drive scope stays `drive.file`. The only server is the I3 Supabase inbox (token-checked RPCs,
  no table access, no recipe data).
- No third-party scripts (the BYOK key lives in `localStorage`).
- Every release bumps `BUILD` + SW `CACHE`, lists new modules in the SW `SHELL`, keeps i18n in
  DE/EN/ES/DA with curly inner quotes, and runs `node v2/tests/run.js` green.

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

**Architecture decisions worth remembering** (details in the linked files):
- Sharing models (Epic I): couples = shared Drive file + Google Picker, no backend; friends without
  Google = Supabase inbox + shop window, Drive stays the source of truth. `v2/docs/SHARING.md`.
- Translation: pre-translated bundled snapshots for the base recipes only; user recipes stay in
  their input language. Generator `v2/tools/build-snapshots.mjs`.
- QA fleet is read-only: agents write to `qa/findings/`, Marcel promotes findings into a roadmap.
