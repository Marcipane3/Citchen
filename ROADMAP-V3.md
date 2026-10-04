# 🍳 Koch — V3 Roadmap (v3.0 and after)

> **Scope of this file:** the **V3 line** — the v3.0 infrastructure release (domain, Play Store,
> clean-up, onboarding) and everything planned after it (v3.1, v3.x, v3.5/v4, someday).
> **Not here:** features and foundation that ship on today's app → **[ROADMAP-V2.md](ROADMAP-V2.md)**.
> What to do next across both → **[ROADMAP.md](ROADMAP.md)**.
> **Why** each decision was made lives in the preparation package **[docs/v3/](docs/v3/README.md)**;
> this file is the plan view and wins if the two disagree on *when*.
>
> Owner: Marcel · Maintained by Claude Code · **Last updated: 2026-10-04**

---

## 1. What V3 is (one paragraph)

V3 is an **infrastructure release for friends and family with a public Play Store listing**. It
stays a PWA, moves to a custom domain with a landing page, gets an Android build (Trusted Web
Activity), keeps each user's data in their own Google Drive and keeps BYOK AI. The code is cleaned
up, not rebuilt. Features keep arriving through v2.x and carry over.
**Dates (confirmed):** scope freeze **31 Dec 2026** · launch target **30 Apr 2027** · hard cutoff
**31 May 2027** (unfinished slices move to v3.1; V3 ships anyway). Budget: 2–3 h/week of Marcel.

---

## 2. Where V3 stands (stage gates)

Process: `docs/v3/01-PROCESS.md`. A gate is passed only with its evidence.

| Phase | Gate | Status | What is missing |
|-------|------|--------|-----------------|
| 0 Intent | G0 | ✅ passed 2026-10-02 | — |
| 1 Discovery | G1 | 🟡 mostly done | Partner's view of the app |
| 2 Decisions | G2 | 🟡 7 of 8 decided | **D8** main language (L1) · ADRs not yet written · **new D9** (see §6) |
| 3 Spikes | G3 | ⏳ Dec 2026 | TWA on the domain (C-1), Google sign-in production (C-8), photo pipeline (C-21), repo layout (C-20) |
| 4 Plan | G4 | ⏳ Dec 2026 | V3 phase plan (written after G2 + G3) |
| 5 Build | G5 | ⏳ Jan–Mar 2027 | Slices 1–9 below |
| 6 Beta | G6 | ⏳ Mar–Apr 2027 | Closed test (12 testers × 14 days) |
| 7 Launch | G7 | ⏳ by 30 Apr 2027 | v2 fallback works for 30 days |

**Prerequisites from the V2 line (must be ✅ before slice 1):** P1 one sync core · P2 end-to-end
tests · P3 two-account sharing proof. Tracked in `ROADMAP-V2.md`, Epic P.

---

## 3. Version plan (draft)

| Version | Theme | Contains | Target | Status |
|---------|-------|----------|--------|--------|
| *pre-V3* | Long-lead items (Marcel) | Buy the domain (after C7), support e-mail on it, Play developer account ($25, identity check takes days), list 12+ Android testers | Nov 2026 | open |
| *pre-V3* | Spikes + decisions | C-1, C-8, C-20, C-21 spikes · ADRs D1–D9 in `docs/v3/adr/` · V3 phase plan | Dec 2026 | open |
| — | **Scope freeze** | v3.0 content fixed; new ideas → v3.x | **31 Dec 2026** | — |
| **v3.0-a1 … a9** | Internal slice builds | One build per slice (§4), tested in one session each | Jan–Mar 2027 | planned |
| **v3.0-b1 …** | Closed test (Play) | Starts with slice 3; testers + partner; bug triage; migration rehearsal (G5) | Feb–Apr 2027 | planned |
| **v3.0** | **Launch** | Public listing + custom domain live; v2 becomes a 30-day read-only fallback | **30 Apr 2027** | planned |
| — | **Hard cutoff** | Anything unfinished moves to v3.1 | **31 May 2027** | — |
| **v3.1** | Cut items + clean-up | First candidate: the "Gesund & Langlebig" hub; retire v1 + v2 | Jun 2027 | planned |
| **v3.x** | Sharing + data options | §5 | H2 2027 | backlog |
| **v3.5 / v4** | Money (only if wanted) | Payment screen or sponsored AI via a proxy. No subscription planned. | 2028+ | parked |
| *someday* | Envy list | Voice cooking mode · social-video import · iPhone App Store | — | parked |

**Versioning rules:** internal slice builds `v3.0-aN`, closed-test builds `v3.0-bN`, launch `v3.0`,
then `v3.N` per release and `v3.N.1` for hotfixes. `BUILD` + SW `CACHE` bump as in v2.

---

## 4. v3.0 — slices (each testable in one 2–3 h session)

Source: `docs/v3/02-SCOPE.md` (slice order) and `00-INTENT-AND-USER-STORIES.md` (stories).

| # | Build | Slice | Stories | Size | Target | Depends on |
|---|-------|-------|---------|------|--------|------------|
| 1 | v3.0-a1 | Custom domain, hosting, landing page (4 languages, privacy policy), support e-mail | US-02, US-28 | M | Jan 2027 | C7 name + domain bought · C-20 |
| 2 | v3.0-a2 | Data slice: move helper live in v2 (V2 P5); if D8 = English data → format 4 + migration | US-04, US-16, US-27 | M–L | Jan 2027 | D8 · V2 P5/P6 |
| 3 | v3.0-a3 | TWA build on the internal test track; **closed test starts** (14-day clock) | US-01 | L | Feb 2027 | Slice 1 · Play account · 12 testers |
| 4 | v3.0-a4 | Guided onboarding tour incl. key setup (skippable, reopenable) | US-03, US-11 | M–L | Feb 2027 | A11 answered |
| 5 | v3.0-a5 | Capture: camera/gallery chooser + share a photo into the app | US-09, US-13 | M | Feb 2027 | C-22 |
| 6 | v3.0-a6 | Simplification pass + before/after report · cook match removed · feedback button | US-22, US-24 | M | Mar 2027 | V2 P2 e2e tests · C-25 baseline |
| 7 | v3.0-a7 | Default photos (~30 own + ~75 AI-generated, ≤ 80 KB each) | US-19 | M–L | Mar 2027 | C-21 · Marcel's photos |
| 8 | v3.0-a8 | Shared weekly plan — **only if A10 = in v3.0** | US-08 | M–L | Mar 2027 | A10 · V2 P1 sync core |
| 9 | v3.0-a9 | "Gesund & Langlebig" hub (N2), sources reviewed by Marcel | US-20 | M | Apr 2027 | Marcel's source review · **first to cut** |

**In the v3.0 scope list but not yet in a slice** *(proposed placement — confirm in the V3 plan)*:

| Item | Source | Proposal |
|------|--------|----------|
| Home-screen rethink with a "what can I cook now" card (old quick win #9) | 02-SCOPE W1 | Fold into slice 4 (what a stranger sees first) or move to v3.1 |
| Accessibility audit (WCAG 2.2 AA spot check, C-15) | 02-SCOPE W1 | Part of slice 6 |
| Google sign-in out of Testing mode (C-8) | 02-SCOPE W4 | Part of slice 1 (needs domain + privacy policy) |
| Generated SW precache list · performance budget (Lighthouse ≥ 80) | 02-SCOPE W3 | Part of slice 6 / slice 3 |
| iPhone PWA as a tested target (C-4) | 02-SCOPE W2 | Part of the closed test |

**Carried over from v2.x (no new work in V3):** everything shipped on the V2 line by launch,
including the friends link (I3), calories (Epic L), export/import (G2), recipe finding (F4),
assistant edits recipes (G3), capture on Sonnet 5.5 (Q1).

**Removed in V3:** cook match (and with it the dropped F3).

---

## 5. After v3.0 — backlog

### v3.1 — what the cutoff pushes out
- Anything not finished by 31 May 2027 (the hub N2 is designated first cut).
- Retire v1 (redirect) and v2 (after the 30-day fallback).

### v3.x — sharing, data options, deeper features

| # | Item | Source | Notes |
|---|------|--------|-------|
| US-08b | **Shared household cookbook** | Marcel, round 2 | First on Google Drive, later on a backend |
| US-08 | Shared weekly plan | A10 | Here if A10 = (b) (recommended) |
| US-L1 | Optional backend database (Supabase) for user data | E2, D4 | I3 already runs on Supabase (see D9) — reuse the project, add accounts only then |
| US-12 | AI spend display with default limit, **warning only** | D5 | Data source: V2 Q3 token measurement |
| L4 | AI calorie estimate for unmatched recipes (marked ✨) | Epic L | Needs V2 L2 |
| L5 | Calories scale with portions; planner weekly totals *(proposed)* | Epic L | Touches the planner |
| M4 | Planner respects the nutrition goal + weekly macro summary *(proposed)* | Epic M | Needs V2 M1 |
| M5 | "Protein boost" tips per recipe *(proposed)* | Epic M | Rule-based first, AI optional |
| N1 | Ingredient cards ("Zutaten-Wissen"), ~30 to start | Epic N | Bundled JSON, translated like the snapshots |
| N3 | Curated reading & watching list | Epic N | Seed list below; Marcel approves |
| N4 | Recipe longevity badges + "Langlebig" filter | Epic N | Derived in memory, no schema change |
| N5 | Weekly longevity check in the planner *(proposed)* | Epic N | Needs L2 |
| N6 | "Ask the AI about an ingredient" (BYOK, must cite sources) *(proposed)* | Epic N | — |
| QW-5 | Bought perishables → Lager fridge in one tap *(proposed)* | old quick win #5 | Closes the shop → stock → cook loop |
| — | Feedback form with a backend (replaces the e-mail button) | US-24 | Could reuse the Supabase project |

### v3.5 / v4 — money (only if wanted)
- US-L2 AI without your own key: payment screen or sponsored quota via a proxy (Cloudflare Worker), per-user caps.

### Someday
- US-L3 voice cooking mode (old quick win #10) · US-L4 social-video import (old quick win #8) ·
  US-L5 iPhone App Store build · N7 "Trends & news" feed *(proposed)*.

### Not wanted
- US-L6 public recipe links · social feed, comments, ratings · real-time collaborative editing ·
  grocery-delivery integrations · subscription.

---

## 6. Open decisions and questions

| ID | Question | Blocks | Recommendation |
|----|----------|--------|----------------|
| **L1 / D8** | English as main language: interface only, or also stored recipe data? | Slice 2, V2 P6, V3 plan | (a) + (b), early in V3, before strangers have data |
| **A10** | Shared weekly plan in v3.0 or v3.x? | Slice 8 | v3.x with the shared cookbook |
| **C7** | App name + domain | Slice 1, long-lead items | **Citchen**, `citchen.app` |
| **D9** *(new 2026-10-04)* | The friends link (I3, v2.14) put a small **Supabase** backend into production. D4 and the no-go list say "no backend in v3.0". Carry I3 into v3.0 as a documented exception (no accounts, no recipe data, inbox + shop window only)? | ADRs (G2), privacy policy (C-17), Play data-safety form | **Yes, as an exception ADR.** The privacy policy and data-safety form must then mention it: a friend's item text and optional name are stored briefly in the EU. |
| A11 | Which "prompt" should change? | Slice 4 | — |
| E6 | May the assistant delete recipes; confirm every change? | V2 G3 | Confirm every change; no delete in the first cut |
| G7 | Which two recipe-finding helps? | V2 F4 | (b) sort + (e) visible search now; (a) photo grid with V3 photos |
| C-20 | Same repo with move helper first, or a separate V3 repo? | Slice 1, V2 P5 | Decide in the December spikes |

Full question list and Claude's technical checks: `docs/v3/03-QUESTIONS.md`.
Risks: `docs/v3/05-RISKS-MIGRATION.md` (top: R1 scope, R2/R13/R18 data, R3/R19 time).

---

## 7. Reference — "Gesund & Langlebig" research base (for N1–N6)

**Design principle — curate, don't preach.** Short, sourced, evidence-graded cards; every claim
carries a source and a confidence marker (🟢 strong / 🟡 mixed / 🔴 hype).

- Higher intake of **nuts, whole grains, fruit, vegetables, legumes and fish** is associated with
  lower all-cause mortality; **red/processed meat and sugary drinks** with higher (umbrella review,
  *Advances in Nutrition* 2025).
- **Legumes:** 32 studies / 1.1 M people: highest vs lowest intake ≈ 6 % lower premature mortality.
  Danish guideline (2021): **100 g cooked legumes per day**.
- **Ultra-processed food:** each +10 % of intake ≈ +9 % all-cause mortality (dose-response
  meta-analysis); covered by the Nordic Nutrition Recommendations 2023.
- **Protein with age:** PROT-AGE/ESPEN: 1.0–1.2 g/kg/day over 65, ~25–30 g per meal.

**N2 hub topics (draft):** Hülsenfrüchte · Ballaststoffe · Protein & Muskeln im Alter ·
Ultra-verarbeitete Lebensmittel · Mediterrane/Nordische Ernährung · Fermentiertes · Olivenöl &
Nüsse · Blue Zones (myth vs data). Each card: 3-line summary, "what this means in the kitchen", links.

**N3 seed list (Marcel to approve; mark known biases):** *Websites* Harvard T.H. Chan *The
Nutrition Source*; Fødevarestyrelsen *De officielle kostråd*; DGE; examine.com. *Books* Tim Spector
*Food for Life*; Peter Attia *Outlive*; Dan Buettner *The Blue Zones Kitchen*. *YouTube/podcasts*
*Nutrition Made Simple!* (Gil Carvalho); ZOE Science & Nutrition; Peter Attia *The Drive*.

**Sources:**
[Umbrella review, Advances in Nutrition 2025](https://advances.nutrition.org/article/S2161-8313(25)00029-8/pdf) ·
[UPF & mortality meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8747520/) ·
[UPF scoping review, NNR 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11077402/) ·
[Legume meta-analysis summary](https://newsletter.onehealthtweakaweek.com/p/the-bean-swap-linked-to-a-longer-c8c) ·
[Plant protein & life expectancy (ScienceDaily 2025)](https://www.sciencedaily.com/releases/2025/04/250415144002.htm) ·
[PROT-AGE position paper](https://www.sciencedirect.com/science/article/pii/S1525861013003265) ·
[Danish legume guideline (EU Knowledge4Policy)](https://knowledge4policy.ec.europa.eu/health-promotion-knowledge-gateway/dietary-recommendations-legumes-pulses-intake_en) ·
[USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide) ·
[Frida food database, DTU](https://frida.fooddata.dk/?lang=en)
