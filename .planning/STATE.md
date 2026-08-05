---
gsd_state_version: 1.0
milestone: v2.10.1
milestone_name: milestone
status: complete
stopped_at: v2.10.1 hotfix shipped — boot-blocking SyntaxError fixed; next stories drafted for review
last_updated: "2026-08-05T00:00:00.000Z"
last_activity: 2026-08-05 -- P0 hotfix A6 (white screen / no login) + module-syntax guard + boot recovery card
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 100
---

# Project State

## Project Reference

See: ROADMAP.md (Koch v2 root) + CLAUDE.md for full project context.

**Core value:** Personal digital cookbook with offline-first PWA + Google Drive sync
**Current focus:** Phase 01 — shared-shopping-list — COMPLETE

## Current Position

Phase: 01 (shared-shopping-list) — COMPLETE · then v2.10.1 hotfix (unplanned P0)
Plan: 2 of 2 — COMPLETE
Status: Phase 01 delivered REQ-I2 + REQ-I3A. v2.10.1 fixed a boot-blocking defect.
Last activity: 2026-08-05 -- P0 hotfix A6: app did not start at all (white screen, no login)

Progress: [██████████] 100%

## Next up — awaiting Marcel's decision

Draft user stories for v2.11+ are in **`.planning/USER-STORIES-v2.11.md`** — not planned,
not built, waiting on a per-story vote. Three things are blocked on Marcel:
1. Votes on Story 1–5 and ideas N1–N5.
2. **Story 3 (bottom tab bar / J2)** — open since June, changes every screen, needs a yes/no.
3. Direction on generalisation: stays Marcel's personal app, or becomes shareable?

## Accumulated Context

### Decisions

- **I1 shipped (v2.8):** Share list as plain text via Web Share API — done.
- **Architecture decision (I3 path A):** "Friends" = people who also use the app + Google account. No backend. Extends I2 Model A (shared Drive file) to multi-party.
- **Drive scope stays `drive.file`:** Privacy-minimal. Cross-account access only after Google Picker grants it.
- **Item-level merge (not whole-file LWW):** `{id, name, qty, aisle, checked, updated, author, deleted}` — union + last-writer-per-item. Transport-agnostic, works for 2+ parties.
- **Plan 01 shipped (v2.10):** listMerge.js (pure mergeList), listSync.js (Drive sync), shopping.js wired (load/save/Refresh button, tombstone filter). einkaufsliste.json on Drive. 173 tests green.
- **Tombstone filter at render layer:** ITEMS retains deleted:true items; `visible = ITEMS.filter(x => !x.deleted)` computed in paintList. Mutation handlers use original ITEMS index.
- **Conflict resolution for lists:** listSync.js resolves conflicts via mergeList() (unlike recipes which preserve conflict) — item-level granularity makes merge safe.
- **Plan 02 shipped:** openPickerForFile() in drive.js (lazy gapi.load, TOKEN encapsulated, pickerLoaded singleton). .sl-link-partner button wired with filename spoofing validation. pickerPrompt i18n key in all 4 languages.
- **GOOGLE_API_KEY/GOOGLE_APP_ID left empty:** Picker works without developer key in most configurations; constants present with commented-out builder lines for fallback if needed.

- **v2.10.1 (2026-08-05, unplanned P0):** `src/version.js` used typographic quotes as string
  delimiters → SyntaxError → the whole ES-module graph failed → white screen, no login button.
  Two guards added: `tests/test-module-syntax.js` (every `src/**/*.js` must parse as a real ES
  module) and a dependency-free boot guard in `index.html` (recovery card + cache-clear button
  instead of a blank page). **Lesson: a green suite did not mean a bootable app** — the tests
  covered logic but never "does it load". A pre-deploy browser smoke test is still missing.

### Blockers/Concerns

- **No pre-deploy smoke test.** The v2.10.1 defect reached the deployed app because nothing
  ever loaded the app in a browser before release. Tracked as story A6.1.

## Session Continuity

Last session: 2026-06-17
Stopped at: Phase 01 Plan 02 complete — Phase 01 fully delivered
Resume file: None
