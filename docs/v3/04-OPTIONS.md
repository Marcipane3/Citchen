# 04 · The decisions (D1–D8)

> Updated **2026-10-02** with Marcel's answers (two rounds). Each decision carries a **status**.
> "Decided" means Marcel's answer is clear; the ADR in `docs/v3/adr/NNN-title.md` (context ·
> options · decision · consequences) is written once the open follow-ups in `03-QUESTIONS.md`
> are closed.

## Status at a glance

| # | Decision | Status | Outcome |
|---|----------|--------|---------|
| D1 | Audience | **Decided** | Friends and family, with a public Play listing. Not a business. |
| D2 | Distribution | **Decided** | PWA on a custom domain + Android Play build (TWA). iPhone stays PWA. |
| D3 | Stack and code base | **Decided** | Plain modules + small build script + clean-up. No rebuild. |
| D4 | Data and sync | **Decided for v3.0** | Each user's own Google Drive. Backend is a v3.x option. |
| D5 | AI and money | **Decided** | BYOK with guided key setup. No subscription. Spend display is v3.x; payment is v3.5/v4 at the earliest. |
| D6 | Content | **Decided** | Photos: ~30 own + ~75 AI. Calories in v2.x. Longevity hub page in V3. |
| D7 | Domain and old versions | **Decided** | Custom domain, landing page, retire v1. Name open (C7); repository layout open (check C-20). |
| D8 | Main language | **Open (L1)** | Marcel proposes English instead of German. Recommended: yes, staged, early in V3. |
| D9 | Friends-link backend (new 2026-10-04) | **Open** | v2.14 runs a small Supabase inbox (no accounts, no recipe data). Recommended: keep it in v3.0 as an exception ADR. See `ROADMAP-V3.md` §6. |

---

## D1 · Purpose and audience — decided

| Option | What it means | Consequence |
|--------|---------------|-------------|
| 1a. Personal | Marcel + partner | v2.x releases cover almost everything |
| **1b. Friends & family (≤ 100)** ✔ | Others install it, each with their own Google account | Onboarding for strangers, OAuth app out of Testing mode, privacy policy, Play build |
| 1c. Public product | Anyone, store listing, maybe payments | Accounts, support, legal, payments, AI cost management |

**Decision: 1b with a public listing ("1b+").** Marcel's success criterion "one random person
downloaded it" needs a public production listing, so three duties of 1c come along: a public
privacy policy, a visible developer name and support e-mail, and verified Google sign-in (A9).
What does **not** come along: accounts, payments, support promises, marketing.

Motivation recorded: learning (domain, hosting, store release), a showable project for the CV,
and an ad-free app friends trust and can shape. No claim of a unique feature.

The validation gate towards 1c stays as written (10+ weekly active users who are not Marcel, four
weeks in a row), but nothing in V3 depends on it.

---

## D2 · Distribution — decided

| Option | Effort | Notes |
|--------|--------|-------|
| 2a. PWA only (today) | none | Discovery only by link |
| **2b. PWA + Android Play build (TWA)** ✔ | L | Bubblewrap/PWABuilder wraps the PWA. Needs Digital Asset Links at the domain root, Lighthouse ≥ 80, offline start returning 200. Same code as the web app. |
| 2c. + iOS App Store (Capacitor) | XL | Apple guideline 4.2 rejects repackaged websites; yearly fee |

**Decision: 2b on a custom domain.** The partner uses an iPhone and stays on the home-screen PWA,
which Marcel accepts. The iOS PWA therefore becomes a tested target, not an afterthought (C-4).

Long-lead items that should start early because they take calendar time, not effort: the Play
developer account with identity verification, and the closed test (12 testers × 14 days, G4).

---

## D3 · Stack and code base — decided

| Option | Pros | Cons |
|--------|------|------|
| 3a. Vanilla ES modules, no build (today) | Hand-editable; zero dependencies (a security control); fast | Hand-kept SW precache list; no types; long DOM-string templates |
| **3b. Vanilla + tiny build script + clean-up** ✔ | Keeps 3a's benefits, removes the precache hazard, addresses "long but not smart" code directly | One Node script to maintain |
| 3c. Light framework (Svelte/Preact + Vite) | Components, reactivity, a known name on the CV | Rewrite of 47 modules; larger dependency surface; build step mandatory; roughly double the build |
| 3d. Native (Kotlin/Swift) | Best platform feel | Two code bases; nothing reused |

Marcel's concern: AI-written code tends to be long and detailed but not always smart, and a store
app may need to be "built a certain way". Two facts answer this:

1. **The Play Store sets no code-style requirement.** A TWA is checked for asset links,
   performance and offline start. Any stack passes or fails on those alone.
2. **"Cleaner" is achievable without a rewrite.** The architecture review found two structural
   debts (two sync engines, no browser tests) and otherwise a slim structure. A rewrite would
   move working code and risk carrying the same habits into the new stack.

What 3b adds to make "cleaner" concrete and measurable:

- One sync core with a pluggable merge rule (recipes: last writer wins; list: per-item merge).
- End-to-end browser tests for the core flows, so clean-up cannot silently break behaviour.
- A **simplification pass** (the `koch-simplifier` agent): measure lines, modules and duplication
  first (C-25), remove dead code and unused features (cook match, if F8 says so), report
  before/after.
- Optional: JSDoc type checking, which catches errors without a framework or a rewrite.

**Decision: 3b.** Marcel follows the recommendation: no rebuild. Cook match is removed during the
simplification pass. A framework stays a possible later step; the plain-module version is the
fallback either way.

---

## D4 · Data and sync — decided for v3.0

| Option | Pros | Cons |
|--------|------|------|
| **4a. Each user's own Google Drive** ✔ (v3.0) | No server, no data-controller burden, strong privacy story, free | Google sign-in required for sync; sharing needs the Picker; OAuth verification for many users |
| 4b. Backend DB (Supabase/Firebase) | Accounts, sharing, server logic | Marcel becomes GDPR controller; cost; breaks project-Claude's direct file editing |
| 4c. Hybrid | Drive for data, tiny backend only for what Drive cannot do | Two systems |

**Decision: 4a for v3.0, plus the sync-core refactor.** Marcel's requirement is "each user's data
is private to them", not "must be Drive". A database he hosts is acceptable later, so 4b/4c is a
**v3.x** topic with its own decision. Consequence for V3: keep all storage access behind the sync
core so the backend can be swapped later without touching the screens.

**Contract change (round 2):** only the assistant inside the app must be able to edit recipes
(US-26). The outside "project-Claude" no longer needs to edit `rezepte.json` directly, and v1 is
retired. The file format is therefore no longer frozen by outside parties; the remaining
constraint is the 30-day v2 fallback. This is what makes D8 possible.

### D4a · Sharing — decided in direction

| Option | Verdict |
|--------|---------|
| Shared shopping list via Drive (built in v2) | **In.** Must be proven with two real accounts, Android + iPhone. |
| Recipe export/import through the share button | **In, in v2.x.** Two formats behind one choice: lossless file "for import", Markdown "for reading". Needs no backend and no Drive. |
| Public recipe links | **Out.** Not wanted. |
| Shared cookbook for a household | **v3.x.** First on Google Drive, later on a backend. |
| Shared weekly plan | **Wanted in V3, to confirm (A10):** it contradicts the confirmed no-go on new weekly-plan work. Technically a third file through the sync core (C-28). |

---

## D5 · AI and money — decided

| Option | Who pays | Notes |
|--------|----------|-------|
| **5a. BYOK** ✔ | Each user, with their own Anthropic key | Zero cost and liability for Marcel; high friction for non-technical users |
| 5b. Sponsored quota | Marcel | Needs a proxy; per-user caps. Marcel's ceiling would be €10/month, and he prefers not to. |
| 5c. Paid tier | Users | Proxy + entitlement + billing. A subscription "does not feel right". |

**Decision: 5a.** People who bring a key are the people interested in AI, which fits the audience.
V3 earns no money. A payment screen or sponsored quota is a **v3.5/v4** topic.

Marcel's **spending guard** idea moved to **v3.x** and got softer: a best-guess display of the
month's spend with a default limit and a **warning, no block** (US-12, check C-24). He considers
the amounts small. For v3.0 this means BYOK spend is not guarded inside the app; the per-call
token caps stay as the safety net.

Consequences:

- The app must be fully useful **without** a key (US-03), because most strangers will not have one.
- Guided key setup (US-11) is the main lever against BYOK friction. It is part of the onboarding
  tour (US-03) and comes with general instructions for using the AI.
- All model calls stay behind `ai/client.js`, so a proxy can be added later without touching features.

Estimated AI cost per active user stays as in the report: ~$0.65/month typical, ~$2.35 heavy
(until check C-10 measures real usage).

---

## D6 · Content — decided

| Topic | Options | Outcome |
|-------|---------|---------|
| Default photos for 105 base recipes | AI-generated · licensed stock · own photos | **About 30 of Marcel's own (dishes he has cooked), about 75 AI-generated.** No style wish, so one neutral consistent style. WebP ≤ ~80 KB each (~8 MB total), loaded on demand, not in the precache. Pipeline check C-21. |
| Nutrition (Epic L) | bundled table · AI · live API | **v2.x first** (bundled USDA/Frida table + AI fallback), carried into V3 |
| Longevity content (Epic N) | in V3 · later | **In V3: the hub page (N2).** Badges (N4), reading list (N3) and ingredient cards (N1) are v3.x. Scheduled last; first to be cut at the cutoff date. |

Note the tension: V3 is defined as an infrastructure release, and Epic N is the one new feature
area in it. Because the nutrition data ships in v2.x beforehand, the dependency is fine.

---

## D7 · URL, domain and old versions — decided

| Topic | Options | Outcome |
|-------|---------|---------|
| Domain | stay on `marcipane3.github.io/Citchen/` · custom domain | **Custom domain.** It is the stable anchor for the Play app; hosting can change behind it. Proposed name: **Citchen** (C7). The support e-mail lives on the domain too (C-26). |
| v1 at the repo root | keep · redirect | **Retire** with a redirect |
| v2 after launch | delete · keep read-only | Keep reachable for 30 days as fallback, then redirect (recommended, no objection) |
| Where V3 code lives | `/v3` folder in this repo · new repo | **Open, check C-20.** A custom domain on this repository moves v1 and v2 to the new origin as well. A separate repository keeps v2's address stable during the parallel run. |
| Website | app only · landing page + app | **Landing page + app** (US-28): explanation, project story, short documentation, privacy policy, "Open app" and Play buttons. |

---

## D8 · Main language — open (question L1)

Raised by Marcel in round 2: make English the main language for V3 instead of German.

Today: the interface exists in German, English, Danish and Spanish. The 105 base recipes are
**stored** in German; the other languages are display overlays from bundled translation files.
Category names are stored as German text. Recipes a user adds stay in the language they typed.
The reason for "German is canonical" was the shared file contract with v1 and project-Claude,
and both of those are now gone (see D4).

| Option | What changes | Effort | Risk |
|--------|--------------|--------|------|
| 8a. Keep German as stored language; English as **default interface and store language** for new users | Default locale, store listing, landing page | S | none |
| **8b. 8a + English as the stored language of the base recipes; language-neutral category keys** (recommended) | New file-format version (4); German becomes one translation among four; one-time migration of existing files; a v2.x release that can read version 4 | L | Migration of Marcel's own Drive file; v2 fallback must understand the new format |
| 8c. Also rename German field names and file names (`rezepte.json`, `einkaufsliste.json`) | Everything in 8b + renamed files in every user's Drive | XL | High, for no user-visible gain |

**Recommendation: 8b, as the first data slice of V3.** A public app with strangers is the moment
English-first pays off, and changing the stored language after strangers have data is much more
expensive than before. Do not do 8c: file and field names are invisible to users. Conditions:
its own ADR, migration rehearsed on a copy of Marcel's real file (gate G5), and v2 taught to read
the new format before V3 writes it (check C-27). If the cutoff gets tight, 8a alone is the
fallback and 8b moves to v3.1.

---

## Package after Marcel's answers: "V3 Personal Pro, public listing"

D1 = 1b+ · D2 = 2b · D3 = 3b · D4 = 4a + sync core (export/import in v2.x) · D5 = 5a + guided key
setup · D6 = ~30 own + ~75 AI photos, longevity hub · D7 = custom domain + landing page, retire
v1 · D8 = open (recommended 8b).

Deferred, each with its own later decision: shared cookbook and backend database (v3.x), AI spend
display and AI calorie estimate (v3.x), payment or sponsored AI (v3.5/v4), iPhone App Store, voice
cooking mode, social-video import.
