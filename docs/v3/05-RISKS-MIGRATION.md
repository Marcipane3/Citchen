# 05 · Risks, migration and release safety

## Risk register

Likelihood (L) and impact (I) on a 1–3 scale. Score = L × I. Review at every gate.

| # | Risk | L | I | Score | Mitigation | Owner |
|---|------|---|---|-------|------------|-------|
| R1 | Scope creep turns V3 into an endless rewrite | 2 | 3 | **6** | **No-go list confirmed and dates confirmed (2026-10-02):** scope freeze 31 Dec 2026, hard cutoff 31 May 2027; triage rule: new ideas go to `ROADMAP-V3.md` as v3.x; longevity hub is the designated first cut; parallel run. Watch: round 2 already added items (tour, landing page, shared plan, language change) | Marcel |
| R2 | Recipe data lost or corrupted during migration | 2 | 3 | **6** | Schema unchanged; rehearsal on a copy; export backup before first v3 sync; round-trip tests | Claude |
| R3 | Owner time runs out. Budget is 2–3 h/week at most (contract end Dec 2026) | 3 | 2 | **6** | Slices sized to one test session; long-lead items started early; v2 stays usable at all times | Marcel |
| R4 | Play rejects the TWA (asset links, Lighthouse, offline) | 2 | 2 | 4 | Spike in Phase 3; custom domain; offline test in e2e | Claude |
| R5 | A schema change breaks the 30-day v2 fallback. (The v1 and project-Claude contracts are dropped: v1 retires, and only the in-app assistant edits recipes) | 2 | 3 | **6** | Additive fields by default; any format change (D8) ships with a v2.x reader first; contract test against `SCHEMA.md`; data-guardian agent at G5 | Claude |
| R6 | Partner, friends or strangers cannot sign in: OAuth Testing mode caps at 100 users and shows a warning screen | 2 | 2 | 4 | Add test users now; production verification before the public listing (C-8) | Marcel |
| R7 | AI cost runaway (only if a shared key is introduced) | 1 | 3 | 3 | BYOK default; proxy with per-user caps; budget alert | Claude |
| R8 | Stale service-worker cache ships a broken mix of old/new files | 2 | 2 | 4 | Generated precache list; CACHE bump test; "update available" prompt | Claude |
| R9 | Model deprecation breaks capture | 2 | 2 | 4 | Model IDs in one config; capture eval on 10 samples per model change | Claude |
| R10 | Privacy regression via a third-party script | 1 | 3 | 3 | Zero-dependency rule written down as a security invariant; review in PRs | Claude |
| R11 | Apple rejects an iOS wrapper (guideline 4.2) | 3 | 1 | 3 | Do not build one on Path A; PWA on iOS | Marcel |
| R12 | Closed-testing requirement delays the Play launch (12 Android testers, 14 days in a row) | 1 | 2 | 2 | Marcel confirms 12+ Android testers are available; write the list in November; start the closed test as soon as the TWA exists (slice 3) | Marcel |
| R13 | Custom-domain switch moves v1 and v2 to a new origin; browser-only data (stock, fridge, profile, AI key, unsynced edits) is left behind | 2 | 3 | **6** | Decide repository layout first (C-20); ship the move helper in v2 before the switch; sync check with warning | Claude |
| R14 | A stranger installs the app, has no AI key, and sees a half-empty product | 3 | 1 | 3 | App fully useful without a key (US-03); guided key setup (US-11); honest store description | Claude |
| R15 | A user's AI spend surprises them. The spend display moved to v3.x, so v3.0 has no in-app guard | 2 | 1 | 2 | Accepted by Marcel (amounts are small); per-call token caps; the key guide says where to see the real bill and how to set a limit in the Anthropic console | Claude |
| R16 | "Gesund & Langlebig" adds review work to a 2–3 h/week budget and delays launch | 2 | 1 | 2 | Reduced to the hub page (N2); scheduled last; moves to v3.1 at the cutoff without blocking launch | Marcel |
| R17 | Clean-up changes behaviour by accident | 2 | 2 | 4 | E2E tests land in v2.x first; simplification is its own slice with no feature changes | Claude |
| R18 | *(only if D8 = 8b)* Changing the stored language to English corrupts or duplicates existing recipes, or breaks the v2 fallback | 2 | 3 | **6** | Own ADR; file-format version 4 with a tested migration; v2.x release that reads version 4 **before** V3 writes it; rehearsal on a copy of Marcel's real file; fallback: interface-only English (8a) | Claude |
| R19 | The v2.x list (sync core, e2e, calories, export/import, recipe finding) outgrows Q4 at 2–3 h/week and delays the V3 start | 3 | 2 | **6** | Only sharing proof, sync core and e2e gate slice 1; everything else in v2.x runs in parallel to V3 or waits | Marcel |

Top to watch: **R1 (scope), R2/R13/R18 (data), R3 and R19 (time).**

R7 (AI cost runaway from a shared key) and R11 (Apple) are dormant: no shared key and no iOS
wrapper are planned for v3.0.

## Data migration plan (v2 → v3)

What exists today:

| Data | Where | Owner | Migration |
|------|-------|-------|-----------|
| Recipes | Google Drive `rezepte.json` (canonical German, flat-v3) | user | **No migration.** V3 reads the same file. Additive fields only. |
| Recipes (local copy) | IndexedDB `recipes` store on origin `marcipane3.github.io` | browser | Re-sync from Drive on first v3 start; fallback: read v2 store if same origin |
| Shopping list | Drive `einkaufsliste.json` + IndexedDB `lists` | user / shared | Same file; item-merge format unchanged |
| Pantry, fridge, profile, theme, language | IndexedDB kv + `localStorage` | browser | Copy on first v3 start (same origin) or re-enter (new domain!) |
| BYOK API key | `localStorage` | browser | Same origin: carry over. New domain: user pastes it again (document this) |
| Photos | Drive files referenced from recipes | user | No migration |

**Important:** moving to a custom domain changes the browser origin. IndexedDB and `localStorage`
do **not** follow. Everything in Drive is safe; local-only data (pantry, fridge, profile, key,
unsynced edits) must be exported/imported or re-entered. Plan a one-time "Move to the new app"
helper in v2 (export local settings as a file or a link) before the switch.

**Also important (new, check C-20):** a custom domain is set per repository. Turning it on for
this repository redirects everything under `marcipane3.github.io/Citchen/`, including v1 and v2,
to the new domain. Two workable layouts: *(a)* same repository, move helper released in v2 first,
then switch; *(b)* a separate repository for V3 on the new domain, so v2 keeps its address during
the parallel run and the 30-day fallback. To be settled in the spike phase.

### Rehearsal (Gate G5)

1. Export the real `rezepte.json` and `einkaufsliste.json` (copies).
2. Run v3 against the copies in a clean browser profile.
3. Diff: every recipe id, name, ingredient count, photo reference identical after a round trip.
4. Run the v2 test suite's fixtures through v3's loaders.
5. Only then point v3 at the real files.

## Rollback

- v2 stays deployed and reachable during beta and for 30 days after launch.
- Because the Drive files keep the same schema, v2 can read anything v3 wrote (additive fields
  are passed through untouched).
- Play: keep the previous release in the track; a bad release can be halted in the console.
- Kill switch: a `flags.js` flag per risky feature.

## Release checklist (each beta and launch build)

- [ ] All unit tests green; e2e suite green
- [ ] `BUILD` and SW `CACHE` bumped; precache list generated
- [ ] Changelog line in all affected languages
- [ ] Migration rehearsal still passes (data changes only)
- [ ] Lighthouse ≥ 80; offline start OK
- [ ] Dark + light, phone width, one real device
- [ ] Release-captain agent: GO

## Legal and store checklist

- [ ] Privacy policy URL (Play listing + OAuth consent screen)
- [ ] Play Data-safety form: data collected = none by the developer; Drive data stays with the user;
      AI requests go from the device to Anthropic with the user's own key (BYOK)
- [ ] OAuth consent screen: app name, logo, support email, authorised domain = the custom domain;
      publishing status "In production" before the public listing
- [ ] Public support e-mail (on the custom domain) and developer name on the Play listing —
      approved by Marcel
- [ ] Closed test: 12+ Android testers opted in for 14 consecutive days (re-check the rule at
      enrolment, C-2)
- [ ] Content rating questionnaire; target API level current
- [ ] Image licences recorded; nutrition data attribution (Frida/DTU) shown in the app
- [ ] If monetised in the EU: DSA trader status + contact details (not applicable for v3.0)
