# 04 · The seven decisions

Each decision has options, trade-offs and a recommendation. Recommendations assume **Path A**
(personal + friends & family) unless D1 says otherwise. When Marcel decides, Claude records an ADR
in `docs/v3/adr/NNN-title.md` (context · options · decision · consequences).

---

## D1 · Purpose and audience

| Option | What it means | Consequence |
|--------|---------------|-------------|
| **1a. Personal** | Marcel + partner | v2.x releases cover almost everything; V3 = quality + Play build at most |
| **1b. Friends & family (≤ 100)** | Others install it, each with their own Google account | Needs onboarding for strangers, OAuth app out of Testing mode, privacy policy, Play build |
| **1c. Public product** | Anyone, store listing, maybe payments | Accounts, support, legal, payments, AI cost management; an ongoing operation |

**Recommendation: 1b, with 1c as an option behind a validation gate** (e.g. 10+ weekly active
users who are not Marcel, for 4 consecutive weeks). 1c is a business, not a release.

---

## D2 · Distribution

| Option | Effort | Notes |
|--------|--------|-------|
| **2a. PWA only** (today) | none | Works on Android and iOS via "Add to Home Screen". Discovery only by link. |
| **2b. PWA + Android Play build (TWA)** | L | Google's supported route: Bubblewrap/PWABuilder wraps the PWA. Requires Digital Asset Links at the domain root, Lighthouse ≥ 80, offline start returning 200. Same code as the web app. |
| **2c. + iOS App Store (Capacitor)** | XL | Apple guideline 4.2 rejects "repackaged websites"; needs real native value (e.g. share-sheet import, widgets). Apple developer fee yearly. |

**Recommendation: 2b on a custom domain.** iOS users keep the PWA. Revisit 2c only on Path B.

---

## D3 · Stack and code base

| Option | Pros | Cons |
|--------|------|------|
| **3a. Vanilla ES modules, no build** (today) | Hand-editable by Marcel and project-Claude; zero dependencies (a security control); fast | Hand-kept SW precache list; no types; DOM-string templates get long |
| **3b. Vanilla + tiny build script** (generate SW list, hash assets) | Keeps 3a's benefits, removes the precache hazard | One Node script to maintain |
| **3c. Light framework** (Svelte/Preact + Vite) | Components, reactivity, ecosystem | Rewrite of 47 modules; dependency surface grows; build step mandatory |
| **3d. Native** (Kotlin/Swift) | Best platform feel | Two code bases; nothing reused |

**Recommendation: 3b.** The v2 architecture review rated the structure "slim and well-built";
a framework would answer a problem the app does not have. Revisit only if Path B needs complex
shared state (accounts, social).

---

## D4 · Data and sync

| Option | Pros | Cons |
|--------|------|------|
| **4a. Each user's own Google Drive** (today, `drive.file`) | No server, no data controller burden, strong privacy story, free | Google sign-in required for sync; sharing needs the Picker; OAuth verification for many users |
| **4b. Backend DB** (Supabase/Firebase) | Accounts, sharing, server logic | You become GDPR controller; cost; breaks project-Claude's direct file editing |
| **4c. Hybrid** | Drive for data, tiny backend only for what Drive cannot do (shared links, AI proxy) | Two systems |

**Recommendation: 4a, plus the sync-core refactor.** Today there are two separate Drive writers
(`data/sync.js` for recipes, `data/listSync.js` for the list). V3 should run both through one
engine with a pluggable merge (last-writer-wins for recipes, item-merge for the list).

---

## D5 · AI and money

| Option | Who pays | Notes |
|--------|----------|-------|
| **5a. BYOK** (today) | Each user, with their own Anthropic key | Zero cost and zero liability for Marcel; high friction for non-technical users |
| **5b. Sponsored quota** | Marcel, for friends & family | Needs a proxy (a shared key must never ship in client code); per-user caps |
| **5c. Paid tier** | Users, via subscription | Proxy + entitlement + Play Billing (or billing-choice link-out); store fees apply |

Estimated AI cost per active user (details in the report, chapter 07): **~$0.65/month typical,
~$2.35 heavy**, using Haiku 4.5 for chat and Sonnet 5.5 for photo/URL capture (estimates until
check C-10 measures real token usage).

Google Play fees from **30 June 2026** (US/EEA/UK): 10 % service fee on auto-renewing
subscriptions, plus a 5 % billing fee when using Play Billing; developers may also link out to
their own web checkout via the billing-choice programme.

**Recommendation: 5a now, design for 5b.** Keep all model calls behind `ai/client.js` so a proxy
can be swapped in later without touching features.

---

## D6 · Content

| Topic | Options | Recommendation |
|-------|---------|----------------|
| Default photos for 105 base recipes | AI-generated · licensed stock · own photos | AI-generated, one consistent style, WebP ≤ 80 KB each (~8 MB total), cached on demand, not in the precache |
| Nutrition (Epic L) | bundled table · AI · live API | Bundled USDA/Frida table + AI fallback (roadmap §16) |
| Longevity content (Epic N) | in V3 · later | Later, after nutrition exists |

---

## D7 · URL, domain and old versions

| Topic | Options | Recommendation |
|-------|---------|----------------|
| Domain | stay on `marcipane3.github.io/Citchen/` · custom domain | Custom domain (needed for TWA asset links; independent of the GitHub username) |
| v1 at the repo root | keep · redirect | Redirect to the current app once V3 launches |
| v2 after launch | delete · keep read-only | Keep reachable for 30 days as fallback, then redirect |
| Where V3 code lives | `/v3` folder · new repo | `/v3` folder in this repo (same pattern as v2) |

---

## Recommended package: "V3 Personal Pro"

D1 = 1b · D2 = 2b · D3 = 3b · D4 = 4a + sync core · D5 = 5a (proxy-ready) · D6 = AI photos +
nutrition · D7 = custom domain, retire v1.

Escalation to "V3 Product" (1c / 5c / maybe 4c) only after the validation gate in D1.
