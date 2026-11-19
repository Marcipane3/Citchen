# 🍳 Koch — V3 Roadmap (v3.0 and after)

> **Scope of this file:** the **V3 line** — the v3.0 infrastructure release (domain, Play Store,
> clean-up, onboarding) and everything planned after it (v3.1, v3.2, v3.x, v3.5/v4, someday).
> **Not here:** features and foundation that ship on today's app → **[ROADMAP-V2.md](ROADMAP-V2.md)**.
> What to do next across both → **[ROADMAP.md](ROADMAP.md)**.
> **Why** each decision was made lives in the preparation package **[docs/v3/](docs/v3/README.md)**;
> this file is the plan view and wins if the two disagree on *when*.
>
> Owner: Marcel · Maintained by Claude Code · **Last updated: 2026-11-18** (replan round 4: launch pulled
> forward to **26 Feb 2027**, closed test from **12 Dec 2026**, format 4 + photos + hub → v3.1, accounts → v3.2,
> D10/D11 decided — §6)

---

## 1. What V3 is (one paragraph)

V3 is an **infrastructure release for friends and family with a public Play Store listing**. It
stays a PWA, moves to a custom domain with a landing page (app name **Citchen**, `citchen.de`, app at
`citchen.de/app`), gets an Android build (Trusted Web Activity), keeps recipes in each user's own
Google Drive and keeps BYOK AI. **Supabase is a proper production backend (D9)**; in v3.0 it holds
what Drive cannot do (friends link, feedback form). **Accounts and sharing recipes between many users
come right after launch (v3.2, D10)**; public publishing with ratings is the direction after that
(D11, decided after launch). **English is the main language**: interface now, stored recipe data in
v3.1 (D8). The code is cleaned up, not rebuilt.
**Dates (replanned 2026-11-18):** closed test starts **12 Dec 2026** · scope freeze **15 Dec 2026** ·
launch target **Fri 26 Feb 2027** · hard cutoff **31 Mar 2027** (unfinished slices move to v3.1; V3
ships anyway). Budget: **4–6 h/week of Marcel** = two releases a week with a ~1 h device checklist each.

### Why the dates moved (2026-11-18)

The dates of 2 Oct assumed Marcel codes alongside 2–3 h/week of testing. Since 27 Oct the agent
pipeline builds the issues: 23 PRs merged in October, 29 in the first 18 days of November, and the
v2.19 milestone (due 18 Dec) was empty by 18 Nov because its pieces shipped early inside v2.18. The
limit is now **Marcel's decisions and device checks**, not code. The 12 testers, the Play developer
account and the domain are in hand, so the 14-day closed test — the one fixed lead time Google
imposes — can start in December instead of February.

---

## 2. Where V3 stands (stage gates)

Process: `docs/v3/01-PROCESS.md`. A gate is passed only with its evidence.

| Phase | Gate | Status | What is missing |
|-------|------|--------|-----------------|
| 0 Intent | G0 | ✅ passed 2026-10-02 | — |
| 1 Discovery | G1 | 🟡 mostly done | Partner's view: partner joins the closed test (iPhone, web app); 15-min feedback chat in **Jan 2027** closes G1 |
| 2 Decisions | G2 | 🟢 all decided (D1–D11, 18 Nov) | ADRs D10/D11 + hosting/URL layout in `docs/v3/adr/` — **by 28 Nov** |
| 3 Spikes | G3 | ⏳ **by 2 Dec 2026** | TWA on `citchen.de/app` (C-1), Google sign-in production + domain verification (C-8), URL layout + github.io redirect (C-20). Photo pipeline (C-21) → v3.1 with slice 7 |
| 4 Plan | G4 | 🟡 this file (18 Nov) | Confirm after the spikes; re-date if a spike fails |
| 5 Build | G5 | ⏳ **Dec 2026 – early Feb 2027** | Slices below |
| 6 Beta | G6 | ⏳ **12 Dec 2026 – 19 Feb 2027** | Closed test (12 testers × 14 days, then until launch) |
| 7 Launch | G7 | ⏳ **26 Feb 2027** | Production listing live; rollback = revert the release on `main` (see §3 note) |

**Prerequisites from the V2 line (must be ✅ before slice 1):** ✅ P1 one sync core (v2.15) · ✅ P2 end-to-end
tests · ✅ data-safety fixes T1–T10 (Epic T) · **P3 two-account sharing proof + P4 live friend test —
Marcel, week of 18 Nov** · **P5 move helper (v2.21, 2 Dec)** — the domain switch moves everyone at once (below).

---

## 3. Version plan (replanned 2026-11-18)

Releases go out **twice a week** (release prep Wednesday + Saturday, Marcel merges and runs a ~1 h
checklist). From the domain switch on, every release goes to `citchen.de/app`, and the closed-test
Android build (a TWA) shows it at once: testers get each web release without a new Play upload.

| Version | Theme | Contains | Target | Status |
|---------|-------|----------|--------|--------|
| *pre-V3* | Long-lead items (Marcel) | ✅ Domain **`citchen.de`** (16 Nov) · ✅ 12 Android testers · Play developer account (personal) — **identity check pending, must finish before 9 Dec** · support e-mail on the domain (C-26) · DNS access for GitHub Pages | Nov 2026 | in progress |
| *pre-V3* | Spikes + decisions | C-1, C-8, C-20 spikes · ADRs D10, D11, hosting/URL layout · this plan confirmed | **by 2 Dec** | open |
| **v3.0-a1** | **Domain switch** (slice 1) | `citchen.de` landing + privacy policy (4 languages) + app at `/app` + CSP + OAuth origins + redirects from the old paths | **Sat 5 Dec** | planned |
| **v3.0-a3** | **Android build** (slice 3) | TWA on the internal track (9 Dec) → **closed test starts Sat 12 Dec** | **9–12 Dec** | planned |
| — | **Scope freeze** | v3.0 content fixed; new ideas → v3.1 / v3.x | **Tue 15 Dec 2026** | — |
| — | 14-day clock | 12 testers opted in for 14 days in a row → apply for production access (~28 Dec – 4 Jan; Google answers in ≈ 7 days) | 26 Dec → mid Jan | — |
| **v3.0-a5** | Capture: camera/gallery + share a photo into the app (slice 5) | | **Sat 9 Jan 2027** | planned |
| **v3.0-a1b** | Backend for v3.0 (slice 1b, reduced) | Feedback table + RPC, privacy policy + Play data-safety name the backend; **accounts schema is an ADR only**. `supabase/` is a protected path → built in an interactive session with Marcel | **Wed 13 Jan** | planned |
| **v3.0-a4** | Onboarding tour + home-screen rethink (slice 4) | | **Wed 20 Jan** | planned |
| **v3.0-a6** | Clean-up + feedback form (slice 6) | | **Sat 30 Jan** | planned |
| **v3.0-b1 …** | Closed-test fixes | Tester bugs, store listing (4 languages, screenshots, data-safety form) | Feb 2027 | planned |
| **v3.0-rc** | Release candidate | Release-captain GO, listing approved | **Sat 20 Feb** | planned |
| **v3.0** | **Launch** | Production rollout on Play; landing page links the store | **Fri 26 Feb 2027** | planned |
| — | **Hard cutoff** | Anything unfinished moves to v3.1 | **31 Mar 2027** | — |
| **v3.1** | Cut items + English data | **Format 4 / English stored data (D8)** · default photos + photo grid · "Gesund & Langlebig" hub · accessibility pass · iPhone as tested target | **Mar – Apr 2027** | planned |
| **v3.2** | **Accounts + send/invite sharing** (D10) | Google sign-in via Supabase · send a recipe to a person or household (linked copy, edits fork) · Supabase **Pro** from this release | **May – Jun 2027** | planned |
| **v3.x** | Public recipes + household | Public publishing + browsing + **ratings/likes** (D11, scheduled after launch feedback — review **May 2027**) · shared household cookbook + weekly plan · §5 | H2 2027 | backlog |
| **v3.5 / v4** | Money (only if wanted) | Payment screen or sponsored AI via a proxy. No subscription planned. | 2028+ | parked |
| *someday* | Envy list | Voice cooking mode · social-video import · iPhone App Store | — | parked |

**The domain switch is one day for everyone (5 Dec).** Setting a custom domain on GitHub Pages
redirects the whole `marcipane3.github.io/Citchen/…` site to `citchen.de/…`. Browser-only data
(stock, fridge, profile, settings, friends-link owner token, AI key) lives per address, so it can't be
read once the redirect is on. Recipes and the shopping list are safe in Drive. That's why the
**move helper (P5) ships on 2 Dec**: Marcel, partner and friends **export between 2 and 5 Dec** and
import on `citchen.de/app` right after the switch (Marcel's choice: switch in December, together with
the testers). Old links (`/v2/…`, friends' `add.html` links) get redirect pages to `/app/…`.

**The "30-day v2 fallback" is retired.** It assumed V3 lives on a new address while v2 stays on the
old one. Now there is one app on one address, and format 4 moves to v3.1, so the launch carries no
data migration. Rollback = revert the release on `main` (GitHub Pages redeploys in minutes) + the
local recipe backup (`kv recipesBackup`). The **legacy v1** app at the repo root is **archived at the switch**
(slice 1, Marcel 2026-11-19: nobody uses it): the landing page takes the root, the v1 files (`index.html`,
`sw.js`, `manifest.json` and icons at the root) leave the published site, and a git tag `v1-final` keeps
the last version. No `/v1/` path.

**Versioning rules:** internal slice builds `v3.0-aN`, closed-test fixes `v3.0-bN`, launch `v3.0`,
then `v3.N` per release and `v3.N.1` for hotfixes. Releases whose main content is a V2 epic keep their
`v2.N` name until the scope freeze (15 Dec); after it every release is `v3.0-…`. `BUILD` + SW `CACHE`
bump as in v2.

---

## 4. v3.0 — slices (each testable in one ~1 h session)

Source: `docs/v3/02-SCOPE.md` (slice order) and `00-INTENT-AND-USER-STORIES.md` (stories).

| # | Build | Slice | Stories | Size | Target | Depends on |
|---|-------|-------|---------|------|--------|------------|
| 1 | v3.0-a1 | Custom domain **`citchen.de`**: landing page (4 languages, privacy policy incl. Supabase), app served at **`/app`**, support e-mail, **Content-Security-Policy** (QA AR-05), Google OAuth origins + domain verification (C-8), redirect pages for `/v2/…` and `add.html` links · **v1 archived** (tag `v1-final`, root files removed; `CLAUDE.md` map updated) | US-02, US-28 | M | **Sat 5 Dec** | C-1/C-8/C-20 spikes · **P5 move helper live (2 Dec)** |
| 3 | v3.0-a3 | TWA build (Bubblewrap), `/.well-known/assetlinks.json`, internal track (9 Dec) → **closed test starts 12 Dec** (14-day clock). Testers use the app **without AI by default**; 2–3 bring their own key; onboarding says AI needs a key | US-01 | L | **9–12 Dec** | Slice 1 · **Play identity check done** · 12 testers |
| 5 | v3.0-a5 | Capture: camera/gallery chooser + share a photo into the app (Web Share Target, works in the TWA) | US-09, US-13 | M | **Sat 9 Jan** | C-22 |
| 1b | v3.0-a1b | **Production backend, v3.0 part (D9/D10):** feedback table + token-checked RPC, privacy policy + Play data-safety updated, advisors clean. **Accounts, owners and shared recipes: schema written down in an ADR only** (built in v3.2). Free plan + keep-alive stays until v3.2 | US-24 (form) | S–M | **Wed 13 Jan** | ADR D10 · `supabase/` = interactive session with Marcel |
| 4 | v3.0-a4 | Guided onboarding tour incl. key setup (skippable, reopenable); points to the editable assistant instructions · **home-screen rethink**: "what can I cook now" card, cookbook search + chips in thumb reach (QA UX-02) | US-03, US-11 | M–L | **Wed 20 Jan** | ✅ V2 Q4 |
| 6 | v3.0-a6 | Simplification pass + before/after report · cook match removed · **feedback form via the backend** (replaces the e-mail button) · generated SW `SHELL` list (QA AR-04) · QA input: SI-07, SI-08, SI-09, SI-03 | US-22, US-24 | M | **Sat 30 Jan** | Slice 1b · C-25 baseline |
| — | v3.0-b1 … | Tester bugs · store listing in 4 languages, screenshots, data-safety form · Lighthouse ≥ 80 | — | M | **Feb** | Slice 3 |
| ~~2~~ | — | ~~Data slice~~ **dissolved 2026-11-18:** move helper → V2 P5 (2 Dec, before slice 1); English stored data / format 4 → **v3.1** | — | — | — | — |
| ~~7~~ | — | ~~Default photos~~ → **v3.1** (Marcel, 18 Nov) | — | — | — | — |
| ~~8~~ | — | ~~Shared weekly plan~~ → v3.x (A10 = b, 2026-10-04) | — | — | — | — |
| ~~9~~ | — | ~~"Gesund & Langlebig" hub~~ → **v3.1** (Marcel, 18 Nov) | — | — | — | — |

**Scope list items, placed 2026-11-18:**

| Item | Source | Placement |
|------|--------|-----------|
| Home-screen rethink with a "what can I cook now" card + search/chips in thumb reach (QA UX-02) | 02-SCOPE W1 | ✅ **v3.0, slice 4** (Marcel: must be in) |
| Feedback form with a backend (was v3.x) | US-24 | ✅ **v3.0, slices 1b + 6** (Marcel: must be in) |
| Google sign-in out of Testing mode (C-8) | 02-SCOPE W4 | v3.0, slice 1 (domain + privacy policy) |
| Content-Security-Policy (QA AR-05) | QA fleet | v3.0, slice 1 |
| Generated SW precache list · Lighthouse ≥ 80 (QA AR-04) | 02-SCOPE W3 | v3.0, slice 6 / b-builds |
| Accessibility audit (WCAG 2.2 AA, C-15; UX-16, UX-03, UX-04, UX-08, UX-07) | 02-SCOPE W1 | **v3.1** (not a launch must) |
| iPhone PWA as a tested target (C-4) | 02-SCOPE W2 | **best-effort in v3.0** (partner tests on iPhone, bugs fixed when reported, no iPhone row per checklist) · tested target in **v3.1** |

**Carried over from v2.x (no new work in V3):** everything shipped on the V2 line by launch,
including the friends link (I3), calories (Epic L), nutrition goal (M1–M3), export/import (G2),
recipe finding (F4), assistant edits recipes (G3), the structured recipe editor (R4–R6), capture on
Sonnet 5.5 (Q1).

**Removed in V3:** cook match (and with it the dropped F3).

---

## 5. After v3.0 — backlog

### v3.1 — cut items + English data (Mar – Apr 2027)
- **English stored data = file format 4** (D8, P6 design in `docs/v3/adr/ADR-R1-ingredient-model.md` §7).
  Moved out of v3.0 on 2026-11-18: one app on one address means no old reader has to understand
  format 4, so V2 P6 is dropped. The migration keeps a backup file and asks once.
- Default photos (old slice 7: ~30 own + ~75 AI-generated, ≤ 80 KB each, C-21) + photo grid (F4 a).
- "Gesund & Langlebig" hub (old slice 9, N2), sources reviewed by Marcel.
- Accessibility pass (C-15 + the UX items above) · iPhone as a tested target (C-4).
- Anything not finished by the cutoff (31 Mar 2027).

### v3.2 — accounts + send/invite sharing (May – Jun 2027)

| # | Item | Notes |
|---|------|-------|
| US-L1 | **Accounts** (Google sign-in via Supabase) | D10 = (b). Recipes stay in Drive; accounts identify owners. Supabase **Pro** from here (data Drive can't rebuild) |
| US-08d | **Send/invite recipes** to a person or household | Receiver gets a linked copy, edits fork it (`forkedFrom`, R6) |

### v3.x — public recipes, household, deeper features

| # | Item | Source | Notes |
|---|------|--------|-------|
| US-08e | **Public recipes: publish, browse, copy, rate/like** *(new 2026-11-18, D11)* | Marcel | Direction set; **scheduled after launch feedback (review May 2027)**. Needs accounts (v3.2), report + takedown flow, photo/recipe copyright rule, vote-abuse protection, privacy policy + data-safety update. **Still not wanted:** comments, follows, feed |
| US-08b | **Shared household cookbook** | Marcel, round 2 | On the backend instead of Drive; decide in the v3.x plan |
| US-08 | **Shared weekly plan** | A10 = (b) | Together with the shared cookbook; reuses the sync core + backend |
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
| QW-6 | Planned day → "cooked" *(moved from V2, 18 Nov)* | V2 small wins | Updates `lastCooked` |
| E3 | Photo-based partial removal from the shopping list *(moved from V2, 18 Nov)* | V2 small wins | Same vision path as the fridge scan |
| QW-7 | Slimmer shopping header *(moved from V2, 18 Nov)* | QA UX-17 | Needs a live check first |

### v3.5 / v4 — money (only if wanted)
- US-L2 AI without your own key: payment screen or sponsored quota via a proxy (Cloudflare Worker), per-user caps.

### Someday
- US-L3 voice cooking mode (old quick win #10) · US-L4 social-video import (old quick win #8) ·
  US-L5 iPhone App Store build · N7 "Trends & news" feed *(proposed)*.

### Not wanted
- Social feed, comments, follows · real-time collaborative editing · grocery-delivery
  integrations · subscription. *(Public recipe links/browsing, US-L6, moved to v3.x as US-08e on
  2026-11-18.)*

---

## 6. Decisions and open questions

### Answered 2026-11-18 (round 4 — replan)

| ID | Question | Decision | Effect |
|----|----------|----------|--------|
| **T-1** | Marcel's time | **4–6 h/week** | Two releases a week (Wed + Sat), ~1 h checklist each |
| **T-2** | Launch date | **End of Feb 2027** (Fri 26 Feb); cutoff 31 Mar | §3 replanned |
| **T-3** | Play account | Personal, **identity check pending** | 12 testers × 14 days applies; check must finish before 9 Dec |
| **T-4** | Start the closed test early | **Yes, December** | Slice 3 moves to 9–12 Dec, right after the domain switch |
| **T-5** | What may move to v3.1 | **Gesund hub + default photos** (structured editor and calories stay before launch) | Slices 7 + 9 → v3.1 |
| **T-6** | Format 4 / English stored data | **v3.1** | V2 P6 dropped, slice 2 dissolved, no migration at launch |
| **T-7** | P3 / P4 phone tests | **Marcel, week of 18 Nov** | Last V2 gate items |
| **T-8** | Release rhythm | **Twice a week** | Release-prep task: Wed run becomes a full release (Marcel edits the task) |
| **D10** | Accounts + recipe sharing: when? | **First release after the cut items = v3.2 (May–Jun 2027)**; v3.0 only writes the schema down | Slice 1b reduced; Supabase Pro from v3.2 |
| **D11** | Sharing model | **Public browsing too**, **with ratings/likes**; timing **decided after launch** (review May 2027). Send/invite comes first (v3.2) | Overrides E4 / A6 "no public links"; US-08e added; comments/feed still not wanted |
| **H-1** | URL layout | **`citchen.de` = landing, app at `/app`** | One origin for TWA + sign-in; redirect pages for old paths |
| **H-2** | Supabase plan | **Free + keep-alive until accounts**, Pro from v3.2 | ADR D9 unchanged |
| **H-3** | Testers and the AI key | **AI optional for testers**; 2–3 bring their own key | BYOK unchanged; onboarding explains |
| **H-4** | Launch extras | **Home-screen rethink + feedback form** in v3.0; a11y pass + iPhone target → v3.1 | §4 placements |
| **H-5** | Scope freeze | **15 Dec 2026** | — |
| **H-6** | Small wins before the freeze | **M1–M3 nutrition goal + macro chips** (v2.22); QW-6, E3, QW-7 → v3.x | `ROADMAP-V2.md` |
| **H-7** | When Marcel's own data moves | **Right away in December** (with the switch on 5 Dec) | Export window 2–5 Dec |
| **H-8** | Partner + iPhone | Partner joins the closed test on iPhone; **iPhone best-effort** in v3.0; feedback chat in Jan closes G1 | — |
| **V1-R** *(19 Nov)* | Legacy v1 app | **Archive it at the switch** — nobody uses it | Slice 1; no `/v1/` path, git tag `v1-final` |

### Answered 2026-10-04 (round 3)

| ID | Decision | Effect |
|----|----------|--------|
| **L1 / D8** | **English is the main language**: interface default *and* stored recipe data (a + b). Your own recipes stay in the language you wrote them. | Slice 2: file format 4 + migration; V2 P6 firm; V2 P8 English default UI |
| **A10** | Shared weekly plan → **v3.x**, with the shared cookbook | Slice 8 removed from v3.0 |
| **C7** | Name **Citchen** everywhere. Domain: **`citchen.de`**, bought by Marcel 2026-11-16 | Slice 1 unblocked; the app moves there only after the move helper (P5) |
| **D9** | Supabase is **a proper backend in v3.0**, not an exception. Needs hosting/ops done right (see below) | New slice 1b, V2 P7, ADR, D10 |
| **A11** | **(b)** users edit the assistant's instructions themselves, with variables (profile, stock, …) flowing into the prompt | V2 Q4 (v2.20) |
| **E6** | Assistant may create + edit recipes, **delete only user-created ones, never the default base recipes**; every change asks for confirmation | V2 G3 (v2.20) |
| **G7** | All of (a)–(f) wanted: photo grid, recently/most cooked, favourites first (filter or sort), filter chips (vegetarian, time …), search always visible **incl. ingredient search**, to-try list | V2 F4 (v2.17) |
| **C-20** | **Same repository**, Claude's recommendation: move helper (V2 P5) ships first, then the domain switch | Slice 1 unblocked |
| A6, F8, G6 | Confirmed as assumed | — |

### D9 follow-up: backend and hosting — what "properly" means

- **Supabase** (Postgres + row-level security + auth + edge functions) is the right backend: it is
  already live (I3), EU region, and the app stays a static PWA. Free plan: 500 MB, 50k MAU, **pauses
  after 1 week of inactivity, no backups**. Pro: from **$25/month**, no pausing, 7-day backups.
  → A friends-and-family app with public listing should not run sharing on a project that can pause.
  The decision is a **keep-alive on free vs. Pro** call, recorded in the ADR (cost vs. the "cheap, no
  money" principle).
- **Vercel** (your friend's tip) hosts the *front end* and serverless functions. For a static PWA it
  adds little over GitHub Pages or Cloudflare Pages, and the **Hobby plan is restricted to
  non-commercial personal use** (Pro: $20/user/month). A free app without income is probably fine,
  but a public store listing with a developer name is a grey zone. Recommendation: **static hosting
  stays on GitHub Pages/Cloudflare behind the custom domain; backend logic in Supabase edge
  functions; Vercel only if a function appears that Supabase cannot host** (e.g. a later AI proxy,
  v3.5). Decide in spike C-30.
- Doing it properly means: separate dev and prod projects, schema as migration files in the repo,
  row-level security reviewed with Supabase's security advisor, secrets never in the client, privacy
  policy + Play data-safety form naming the backend, backups/restore tested.

### Still open

| ID | Question | Blocks | Recommendation |
|----|----------|--------|----------------|
| **D11-T** | When do public recipes (publish, browse, copy, rate/like) ship? | US-08e | Decide in **May 2027** with tester and launch feedback, after v3.2 accounts |
| **L1 (nutrition)** | Nutrition model: (a) bundled table (via the R2 ingredient master) + (b) AI fallback later | — | Treated as resolved by R2 (ADR R1, R1-Q5); confirm with the v2.19a calories release |

Full question list and Claude's technical checks: `docs/v3/03-QUESTIONS.md`.
Risks: `docs/v3/05-RISKS-MIGRATION.md` (top: R1 scope, R2/R13/R18 data, R3/R19 time). The replan
lowers R2/R18 (no migration at launch) and R19 (time), and adds two: the Play identity check is late
(blocks 12 Dec), and the one-day domain switch loses browser-only data for anyone who skips the export.

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
