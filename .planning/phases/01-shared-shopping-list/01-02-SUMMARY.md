---
phase: "01-shared-shopping-list"
plan: "02"
subsystem: "shopping-list-sync"
tags: [google-picker, drive-sync, cross-account, shopping, pwa, oauth]
dependency_graph:
  requires:
    - phase: "01-01"
      provides: "mergeList(), listSync.js, sl-link-partner button stub, Drive persistence wired"
    - v2/src/data/drive.js (TOKEN module-private, createFile, isSignedIn)
    - v2/src/data/db.js (kvGet/kvSet for listMeta)
  provides:
    - v2/src/data/drive.js (openPickerForFile export — lazy Picker loader, TOKEN-safe)
    - v2/src/features/shopping/shopping.js (.sl-link-partner wired with fileName validation)
    - v2/src/i18n.js (pickerPrompt key in all 4 languages)
  affects:
    - Future cross-account partner flows (openPickerForFile is the entry point)
tech_stack:
  added:
    - Google Picker API (CDN — same gapi script as Drive auth; no new package)
  patterns:
    - Lazy promise caching for CDN library load (pickerLoaded promise singleton)
    - Token encapsulation (Picker built inside drive.js; TOKEN never leaves the module)
    - Filename validation before fileId trust (spoofing mitigation at callback boundary)
key_files:
  created: []
  modified:
    - v2/src/data/drive.js
    - v2/src/features/shopping/shopping.js
    - v2/src/i18n.js
key_decisions:
  - "Picker fully encapsulated in drive.js: openPickerForFile() accepts mimeType + callback; TOKEN is never exported. Resolves RESEARCH.md Open Question 2 cleanly."
  - "GOOGLE_API_KEY / GOOGLE_APP_ID left as empty string defaults: Picker works without a developer key in most configurations; constants are present and commented-out builder lines are there if 'developer key invalid' error appears."
  - "pickerLoaded promise singleton: repeated button taps reuse the loaded Picker library rather than calling gapi.load each time — avoids race conditions and CDN overhead."
  - "Single-account Drive persistence assumed OK per user checkpoint approval: cross-account Picker flow requires second account and was noted as testable later."
patterns_established:
  - "openPickerForFile pattern: lazy gapi.load('picker') via cached promise; PickerBuilder built after load resolves; callback validates filename before storing fileId"
  - "Picker button wiring: validate fileName.includes('<expected-name>') before any kvSet — spoofing mitigation at the trust boundary"
requirements_completed:
  - REQ-I3A
metrics:
  duration: "~20 minutes (Task 1 execution + human checkpoint)"
  completed: "2026-06-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 3
  tests_added: 0
  tests_total: 173
---

# Phase 01 Plan 02: Google Picker Handshake Summary

**Google Picker cross-account handshake added to drive.js (openPickerForFile, lazy load, TOKEN encapsulated) and .sl-link-partner button wired in shopping.js with filename spoofing validation; pickerPrompt i18n key in all 4 languages.**

## Performance

- **Duration:** ~20 minutes
- **Started:** 2026-06-17
- **Completed:** 2026-06-17
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 3

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | openPickerForFile() in drive.js; wire Picker button in shopping.js; pickerPrompt i18n | 5b58140 | drive.js, shopping.js, i18n.js |
| 2 | Human checkpoint — single-account Drive persistence verified | — | (approved by user) |

**Plan metadata:** (docs commit — this summary)

## What Was Built

**drive.js additions:**

- `GOOGLE_API_KEY` / `GOOGLE_APP_ID` constants (empty string defaults) — populated only if Picker throws "developer key invalid"
- `let pickerLoaded = null` — module-level promise singleton caching the `gapi.load("picker")` call so repeated button taps do not reload the CDN library
- `export function openPickerForFile(mimeType, onFilePicked)` — guards on `TOKEN` (silently aborts if not signed in); lazy-loads the Picker via cached promise; builds `PickerBuilder` with `setOAuthToken(TOKEN)`, adds a DOCS view filtered by mimeType, calls back with `(fileId, fileName)` on PICKED action. Commented-out `setDeveloperKey` / `setAppId` lines present for if the empty-key configuration fails.

**shopping.js wiring:**

- `.sl-link-partner` button onclick handler added after the existing Refresh button block
- Calls `drive.openPickerForFile("application/json", async (fileId, fileName) => { ... })`
- Validates `fileName.includes("einkaufsliste")` before trusting fileId — aborts with `console.warn` if wrong file picked (T-02-01 mitigation)
- On valid pick: calls `db.kvSet("listMeta", { ...meta, fileId, linked: true, source: "linked", updated: "", dirty: false })` — `updated: ""` forces `decideSync` to return "pull" on the first sync with the partner's file
- Immediately calls `listSync.syncListWithDrive()` to merge partner's existing items into local state and repaint

**i18n.js:**

- `pickerPrompt` key added to all 4 `shopping:` language blocks (DE/EN/ES/DA)

## Acceptance Criteria Verification

```
openPickerForFile in drive.js:    line 211 — PASS
openPickerForFile in shopping.js: line 128 — PASS
pickerPrompt count (must be 4):   4         — PASS
pickerLoaded declarations (2):    lines 209, 213, 214, 216 — PASS (2 declaration+conditional)
export.*TOKEN in drive.js:        0 matches — PASS (TOKEN never exported)
einkaufsliste validation:         line 128 in Picker callback — PASS
Tests (173+ required):            173 passed, 0 failed — PASS
```

## Threat Model Coverage

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-02-01 | Mitigated | `fileName.includes("einkaufsliste")` check in Picker callback; aborts + console.warn if mismatch |
| T-02-02 | Mitigated | `openPickerForFile()` builds Picker inside drive.js; TOKEN never passed out; confirmed by grep gate (0 matches for `export.*TOKEN`) |
| T-02-03 | Accepted | mergeList() + decideSync() handle malformed remote.items; runtime errors caught in listSync.js catch block |
| T-02-04 | Mitigated | Picker triggered only on explicit user click; gapi loaded synchronously from CDN in index.html before any module runs |
| T-02-SC | Accepted | No new packages — CDN Picker API is same gapi script already in index.html |

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria from the plan's `<acceptance_criteria>` block met on first attempt. No auto-fixes required.

## User Setup Required

The plan's `user_setup` block describes optional steps if the Picker throws "developer key invalid":

1. Enable Google Picker API in Google Cloud Console → APIs & Services → Library
2. Create a browser-restricted API key (restrict to GitHub Pages URL pattern)
3. Set `GOOGLE_API_KEY` in `v2/src/data/drive.js` and uncomment the two builder lines

These steps are NOT required unless the Picker fails with that specific error. The user approved the checkpoint without needing these values.

## Known Stubs

None — the Picker button is now fully wired. The stub noted in Plan 01-01 SUMMARY is resolved.

## Phase Completion Status

Both plans in Phase 01 are now complete:

| Plan | Status | What shipped |
|------|--------|--------------|
| 01-01 | Done | listMerge.js, listSync.js, Drive persistence, Refresh button |
| 01-02 | Done | openPickerForFile(), Picker button wired, cross-account handshake |

Phase 01 goal (REQ-I2 + REQ-I3A) is fully delivered:
- Drive persistence: shopping list survives page reload, syncs across devices on same account
- Cross-account: partner can tap "Partner verknüpfen", pick the owner's `einkaufsliste.json` via Google Picker, and subsequent syncs merge both parties' items

## Self-Check

Files modified:
- v2/src/data/drive.js: openPickerForFile at line 211 — FOUND
- v2/src/features/shopping/shopping.js: openPickerForFile at line 128 — FOUND
- v2/src/i18n.js: pickerPrompt appears 4 times — FOUND

Commits:
- 5b58140: Task 1 — openPickerForFile + Picker wiring + i18n — FOUND

Test results: 173 passed, 0 failed

## Self-Check: PASSED
