# 02 · Scope of work

> Updated **2026-10-02**: Marcel chose **Path A with a public Play listing**. V3 is an
> **infrastructure release** (store, domain, clean-up, onboarding); features arrive through v2.x.
> Path B is parked: its parts are v3.x (backend) and v3.5/v4 (money) topics. Rows changed by the
> answers are marked ★ (round 1) or ② (round 2). User stories: `00-INTENT-AND-USER-STORIES.md`.
> **Dates confirmed:** scope freeze 31 Dec 2026 · launch target 30 Apr 2027 · hard cutoff 31 May 2027.

The scope of a V3 depends on decision **D1 (audience)**. Below, every workstream is listed with
what it contains and how it scales between the two paths:

- **Path A — "V3 Personal Pro"** ✔ chosen: Marcel, partner, friends and family (up to
  ~100 people), plus whoever finds the public listing. No backend, no payments.
- **Path B — "V3 Product"** (parked): accounts, possibly payments. Roughly 3–5× the work
  of Path A and an ongoing operating burden.

Sizes: **S** < ½ day · **M** ½–2 days · **L** 3–5 days · **XL** > 1 week (Claude Code implementing,
Marcel testing and deciding).

## Workstreams

### W1 · Product & UX

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Intent, success metric, no-go list | ✔ | ✔ | S |
| Usage review of v2 (which screens matter) | ✔ | ✔ | S |
| ② Guided onboarding tour: clicks through the features, includes the key setup and general AI instructions, ends with "understood"; skippable, reopenable; app usable without Google account or AI key (US-03, US-11) | ✔ | full | M–L |
| ② Photo capture in ≤ 2 taps, with one chooser: camera or gallery (US-09) | ✔ | ✔ | S |
| ② Cook match removed (not carried into V3); stock tab stays as is | ✔ | ✔ | S |
| ② Easier recipe finding: sort, filters, visible search, photo grid (US-17, question G7) | v2.x | ✔ | M |
| Home screen rethink ("what can I cook now" card, old quick win #9 — placement proposed in `ROADMAP-V3.md` §4) | ✔ | ✔ | M |
| Accessibility audit (WCAG 2.2 AA spot check) | ✔ | ✔ | M |

### W2 · Platform & distribution

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Custom domain (needed for Play's Digital Asset Links on a project-pages URL) | ✔ | ✔ | S |
| Android build as Trusted Web Activity (Bubblewrap), Play listing, closed test | ✔ | ✔ | L |
| ★ iOS: stays "Add to Home Screen" PWA, now a tested target (partner uses an iPhone) | ✔ | — | S |
| ② Landing page on the domain: what the app is, project story, short documentation, privacy policy, "Open app" and Play buttons, 4 languages (US-28) | ✔ | ✔ | M |
| ② Support e-mail address on the domain, forwarded (check C-26) | ✔ | ✔ | S |
| ★ "Move to the new app" helper shipped in v2 before the domain switch (US-04, check C-20) | ✔ | ✔ | M |
| iOS App Store build (Capacitor + native value to pass guideline 4.2) | — | optional | XL |
| Retire v1 at the repo root (redirect to v3) | ✔ | ✔ | S |

### W3 · Code base & quality

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| **Sync core**: one engine for recipes (LWW) and list (item merge), per the architect ADR | ✔ | ✔ | L |
| Generated service-worker precache list (kills the hand-kept `SHELL` array) | ✔ | ✔ | S |
| ★ Simplification pass with a before/after report: lines, modules, duplication, dead code (US-22) | ✔ | ✔ | M |
| End-to-end browser tests (Playwright) for the 10 core flows | ✔ | ✔ | L |
| Build step: none (Path A) vs. light bundler (Path B, if a framework is chosen) | none | M–L | — |
| Model IDs in one config; capture vision model `claude-sonnet-4-6` → `claude-sonnet-5-5` | ✔ | ✔ | S |
| Performance budget (Lighthouse ≥ 80 is a Play requirement for TWAs) | ✔ | ✔ | M |

### W4 · Data & sync

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Keep "your data in your Google Drive" (`drive.file`) | ✔ | option | — |
| Schema stays flat-v3; additive fields only (nutrition, photos) | ✔ | ✔ | S |
| Migration of v2 local data (IndexedDB, same origin) into v3 | ✔ | ✔ | M |
| ★ Google OAuth app out of "Testing" mode (verification; privacy policy) — required by the public listing | ✔ | ✔ | M |
| ② Recipe export/import through the share button, two formats (US-07) — moved to v2.x | v2.x | ✔ | M |
| ② English as stored language + language-neutral category keys, file-format version 4 (D8, **open**, question L1) | open | ✔ | L |
| ② Assistant inside the app creates and updates recipes, with confirmation (US-26, question E6) | ✔ | ✔ | S–M |
| Accounts + backend database (Supabase/Firebase) — ★ v3.x option | — | ✔ | XL |
| Recipe sharing between users (public links) — ★ not wanted | — | — | — |
| ② Shared weekly plan as a third file through the sync core (US-08, **to confirm**, question A10) | to confirm | ✔ | M–L |
| ② Shared cookbook for a household — v3.x, first on Drive | — | ✔ | L–XL |

### W5 · AI

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| BYOK stays the default | ✔ | ✔ | — |
| Cost guardrails (per-call token caps, prompt caching for the system prompt) | ✔ | ✔ | S |
| ② AI spend display with default limit and warning, no block (US-12) — moved to v3.x | — | ✔ | M |
| ② Guided key setup with key test button — part of the onboarding tour (US-11) | ✔ | ✔ | S |
| ② Share a photo from the gallery into the app via Android's share menu (US-13, check C-22) | ✔ | ✔ | M |
| Shared-key proxy (Cloudflare Worker) with quotas + abuse limits — ★ v3.5/v4 | — | ✔ | L |
| AI calorie fallback (Epic L4) — ② v3.x | — | ✔ | S |

### W6 · Monetisation (Path B only — ★ not in V3; no subscription wanted; revisit at v3.5/v4)

| Item | Size |
|------|------|
| Pricing model (free + Pro subscription covering AI) | S |
| Google Play Billing or web checkout via billing-choice link-out | L |
| Entitlement check in the proxy; refunds; receipts | L |

### W7 · Content

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| ② Default food photos for the 105 base recipes: ~30 of Marcel's own + ~75 AI-generated, one pipeline (US-19) | ✔ | ✔ | M–L |
| ★ Nutrition data (Epic L) — ships in v2.x first, carried over | v2.x | ✔ | L |
| ② "Gesund & Langlebig" hub page (Epic N2), sources reviewed by Marcel — last slice, first cut. N1/N3/N4 are v3.x | ✔ | ✔ | M |

### W8 · Legal, store & compliance

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Privacy policy page (required by Play and OAuth verification) | ✔ | ✔ | S |
| Play Data-safety form, content rating, target API level | ✔ | ✔ | S |
| Play developer account (one-time fee) + closed-testing requirement for new personal accounts | ✔ | ✔ | S |
| EU trader status (DSA) if monetised; imprint/contact | — | ✔ | S |
| Terms of use, AI disclosure, image licences | light | ✔ | M |

### W9 · Operations

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Backup/restore of `rezepte.json` (export + documented restore) | ✔ | ✔ | S |
| Privacy-friendly error reporting (opt-in, no third-party script) | optional | ✔ | M |
| ★ Support channel: public e-mail (required by the listing), FAQ in the Guide | ✔ | ✔ | S |
| ② Feedback button in the app: pre-filled e-mail to the support address (US-24, check C-29) | ✔ | ✔ | S |
| ② Learning track: challenge + note + retro per slice, AI working playbook (`06-LEARNING-TRACK.md`, US-23) | ✔ | — | S each |
| Monthly cost + quarterly QA-fleet routine (`qa/ROUTINE.md`) | ✔ | ✔ | S |

## Explicitly out of scope for v3.0 — confirmed by Marcel (2026-10-02, round 2)

- Rebuild as a native Android or iPhone app (Kotlin/Swift). *("Native" means the programming
  language, not German/English.)*
- iPhone App Store build.
- Accounts or a backend database (v3.x).
- Payments, subscription, sponsored AI, AI proxy (v3.5/v4).
- Public recipe links, social feed, comments, ratings.
- Real-time collaborative editing of recipes.
- Voice cooking mode, social-video import (someday list).
- Any new screen except "Gesund & Langlebig" (the onboarding tour and landing page are not app
  screens in this sense).
- New work on the weekly plan, stock or cook match. *Exception pending: shared weekly plan (A10).*
- AI spend display, AI calorie estimate, shared cookbook (all v3.x).
- Grocery delivery integrations.

**Triage rule after the scope freeze:** a new idea goes into `ROADMAP-V3.md` tagged v3.x. It enters
v3.0 only by replacing something of the same size.

## Slice order (each slice testable in one 2–3 h session)

| # | Slice | Stories | Why here |
|---|-------|---------|----------|
| 1 | Custom domain, hosting, landing page with privacy policy, support e-mail | US-02, US-28 | Everything else hangs on the address |
| 2 | Data slice: "Move to the new app" helper in v2; if D8 = yes, English stored language + format version 4 | US-04, US-16, US-27 | Data changes come before anyone switches and before strangers have data |
| 3 | TWA build on the internal test track; closed test starts | US-01 | Starts the 14-day tester clock early; it runs while slices 4–9 are built |
| 4 | Guided onboarding tour incl. key setup | US-03, US-11 | What a stranger sees first |
| 5 | Capture: camera/gallery chooser + share a photo into the app | US-09, US-13 | Marcel's most important AI path |
| 6 | Simplification pass + report; cook match removed; feedback button | US-22, US-24 | Safe once e2e tests from v2.x guard it |
| 7 | Default photos (~30 own + ~75 AI) | US-19 | Content, no risk to data; also the biggest help for finding recipes |
| 8 | Shared weekly plan *(only if A10 = in)* | US-08 | Reuses the sync core |
| 9 | "Gesund & Langlebig" hub | US-20 | Last; first to move to v3.1 at the cutoff |

Must land in **v2.x before slice 1**: partner-sharing proof with two accounts, one sync core,
end-to-end tests. Can land in v2.x **any time before launch**: calories (Epic L1–L3), capture on
Sonnet 5.5, recipe export/import, easier recipe finding, assistant edits recipes.

**Load warning:** round 2 moved work into v2.x (export/import, recipe finding). At 2–3 h/week the
v2.x list is now longer than the Q4 window. The three foundation items go first; the rest runs in
parallel to the V3 slices in Q1 2027 (risk R19).

## Calendar (dates confirmed 2026-10-02)

| When | What | Marcel's part (2–3 h/week) |
|------|------|-----------------------------|
| Oct–Nov 2026 | v2.x foundation releases | Test each release; two-account sharing test |
| Nov 2026 | Long-lead items: buy the domain, open the Play developer account, list 12+ Android testers | ~2 h of forms; ask friends |
| Dec 2026 | Spikes (TWA on the domain, sign-in verification, photo pipeline); remaining questions; ADRs. **Scope freeze 31 Dec** | Answer Part 1; review spike results |
| Jan–Mar 2027 | Slices 1–9, about one per 1–2 weeks | One test session per slice |
| Apr 2027 | Closed test completes, production review, **launch target 30 Apr** | Collect tester feedback |
| May 2027 | Buffer. **Hard cutoff 31 May**: unfinished slices move to v3.1 | Launch check on a real device |

## Rough totals

| Path | Build effort (Claude Code + Marcel testing) | Calendar time (part-time) | Running cost / year |
|------|---------------------------------------------|---------------------------|---------------------|
| A — Personal Pro ✔ | ~6–9 weeks of slices (~9 slices) | ~4–5 months at 2–3 h/week incl. closed test | ~€10–15 domain + $25 one-time Play fee; AI paid by each user (BYOK) |
| B — Product | ~4–6 months | ~6–9 months | + backend, proxy, AI subsidy, support time, store fees (10 % on subscriptions + 5 % billing fee via Play Billing in EEA/UK/US from 30 June 2026) |
