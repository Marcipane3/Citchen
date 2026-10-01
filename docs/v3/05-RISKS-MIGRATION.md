# 05 · Risks, migration and release safety

## Risk register

Likelihood (L) and impact (I) on a 1–3 scale. Score = L × I. Review at every gate.

| # | Risk | L | I | Score | Mitigation | Owner |
|---|------|---|---|-------|------------|-------|
| R1 | Scope creep turns V3 into an endless rewrite | 3 | 3 | **9** | Intent + no-go list; G4 caps MVP at 8 weeks; parallel run | Marcel |
| R2 | Recipe data lost or corrupted during migration | 2 | 3 | **6** | Schema unchanged; rehearsal on a copy; export backup before first v3 sync; round-trip tests | Claude |
| R3 | Owner time runs out (contract end Dec 2026, job search) | 3 | 2 | **6** | Time budget in Intent; small slices; v2 stays usable at all times | Marcel |
| R4 | Play rejects the TWA (asset links, Lighthouse, offline) | 2 | 2 | 4 | Spike in Phase 3; custom domain; offline test in e2e | Claude |
| R5 | v1 / project-Claude contract broken by a schema change | 2 | 3 | **6** | Additive fields only; contract test against `SCHEMA.md`; data-guardian agent at G5 | Claude |
| R6 | Partner/friends cannot sign in (OAuth Testing-mode limits) | 2 | 2 | 4 | Add test users; plan verification before friends & family beta | Marcel |
| R7 | AI cost runaway (only if a shared key is introduced) | 1 | 3 | 3 | BYOK default; proxy with per-user caps; budget alert | Claude |
| R8 | Stale service-worker cache ships a broken mix of old/new files | 2 | 2 | 4 | Generated precache list; CACHE bump test; "update available" prompt | Claude |
| R9 | Model deprecation breaks capture | 2 | 2 | 4 | Model IDs in one config; capture eval on 10 samples per model change | Claude |
| R10 | Privacy regression via a third-party script | 1 | 3 | 3 | Zero-dependency rule written down as a security invariant; review in PRs | Claude |
| R11 | Apple rejects an iOS wrapper (guideline 4.2) | 3 | 1 | 3 | Do not build one on Path A; PWA on iOS | Marcel |
| R12 | Closed-testing requirement delays Play launch | 2 | 1 | 2 | Recruit testers early (Phase 5) | Marcel |

Top three to watch: **R1, R2/R5 (data), R3 (time).**

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
- [ ] OAuth consent screen: app name, logo, support email, authorised domain = the custom domain
- [ ] Content rating questionnaire; target API level current
- [ ] Image licences recorded; nutrition data attribution (Frida/DTU) shown in the app
- [ ] If monetised in the EU: DSA trader status + contact details
