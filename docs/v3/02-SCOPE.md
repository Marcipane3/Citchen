# 02 · Scope of work

The scope of a V3 depends on decision **D1 (audience)**. Below, every workstream is listed with
what it contains and how it scales between the two realistic paths:

- **Path A — "V3 Personal Pro"** (recommended default): Marcel, partner, friends and family (up to
  ~100 people). No backend, no payments.
- **Path B — "V3 Product"**: open to the public, accounts, possibly payments. Roughly 3–5× the work
  of Path A and an ongoing operating burden.

Sizes: **S** < ½ day · **M** ½–2 days · **L** 3–5 days · **XL** > 1 week (Claude Code implementing,
Marcel testing and deciding).

## Workstreams

### W1 · Product & UX

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Intent, success metric, no-go list | ✔ | ✔ | S |
| Usage review of v2 (which screens matter) | ✔ | ✔ | S |
| Onboarding for a *new* user (not Marcel): first-run tour, empty cookbook vs. base recipes | light | full | M / L |
| Home screen rethink ("what can I cook now" card, roadmap §14 #9) | ✔ | ✔ | M |
| Accessibility audit (WCAG 2.2 AA spot check) | ✔ | ✔ | M |

### W2 · Platform & distribution

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Custom domain (needed for Play's Digital Asset Links on a project-pages URL) | ✔ | ✔ | S |
| Android build as Trusted Web Activity (Bubblewrap), Play listing, closed test | ✔ | ✔ | L |
| iOS: stays "Add to Home Screen" PWA | ✔ | — | — |
| iOS App Store build (Capacitor + native value to pass guideline 4.2) | — | optional | XL |
| Retire v1 at the repo root (redirect to v3) | ✔ | ✔ | S |

### W3 · Code base & quality

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| **Sync core**: one engine for recipes (LWW) and list (item merge), per the architect ADR | ✔ | ✔ | L |
| Generated service-worker precache list (kills the hand-kept `SHELL` array) | ✔ | ✔ | S |
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
| Google OAuth app out of "Testing" mode (verification; privacy policy) | ✔ if > a few users | ✔ | M |
| Accounts + backend database (Supabase/Firebase) | — | ✔ | XL |
| Recipe sharing between users (public links) | — | ✔ | L |

### W5 · AI

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| BYOK stays the default | ✔ | ✔ | — |
| Cost guardrails (per-call token caps, prompt caching for the system prompt) | ✔ | ✔ | S |
| Shared-key proxy (Cloudflare Worker) with quotas + abuse limits | — | ✔ | L |
| AI calorie fallback (Epic L4) | ✔ | ✔ | S |

### W6 · Monetisation (Path B only)

| Item | Size |
|------|------|
| Pricing model (free + Pro subscription covering AI) | S |
| Google Play Billing or web checkout via billing-choice link-out | L |
| Entitlement check in the proxy; refunds; receipts | L |

### W7 · Content

| Item | Path A | Path B | Size |
|------|--------|--------|------|
| Default food photos for the 105 base recipes (roadmap V3 list) | ✔ | ✔ | M–L |
| Nutrition data (Epic L) | ✔ | ✔ | L |
| "Gesund & Langlebig" content (Epic N), sources reviewed by Marcel | optional | ✔ | M |

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
| Support channel (email), FAQ in the Guide | light | ✔ | S |
| Monthly cost + quarterly QA-fleet routine (`qa/ROUTINE.md`) | ✔ | ✔ | S |

## Explicitly out of scope for V3 (unless D1 changes)

- Native rewrite (Kotlin/Swift).
- Real-time collaborative editing of recipes.
- Social feed, comments, ratings by strangers.
- Running our own server for data storage on Path A.
- Grocery delivery integrations.

## Rough totals

| Path | Build effort (Claude Code + Marcel testing) | Calendar time (part-time) | Running cost / year |
|------|---------------------------------------------|---------------------------|---------------------|
| A — Personal Pro | ~6–9 weeks of slices | ~3–4 months incl. beta | ~€10–15 domain + €25 one-time Play fee; AI paid by each user (BYOK) |
| B — Product | ~4–6 months | ~6–9 months | + backend, proxy, AI subsidy, support time, store fees (10 % on subscriptions + 5 % billing fee via Play Billing in EEA/UK/US from 30 June 2026) |
