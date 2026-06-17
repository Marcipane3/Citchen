---
phase: "01-shared-shopping-list"
plan: "01"
subsystem: "shopping-list-sync"
tags: [drive-sync, mergeList, listSync, shopping, pwa, tdd]
dependency_graph:
  requires:
    - v2/src/data/drive.js (createFile fileName param)
    - v2/src/data/decideSync.js (decideSync pure function from K2)
    - v2/src/data/db.js (kvGet/kvSet/put/get)
  provides:
    - v2/src/features/shopping/listMerge.js (mergeList pure function)
    - v2/src/data/listSync.js (syncListWithDrive, saveList, onStatus, getStatus)
    - v2/tests/test-list-merge.js (7 unit tests)
  affects:
    - v2/src/features/shopping/shopping.js (wired for Drive sync + tombstone filter)
    - v2/sw.js (CACHE bumped, SHELL extended)
    - v2/src/version.js (BUILD + APP_VERSION = 2.10)
    - v2/src/i18n.js (6 new keys in all 4 languages)
tech_stack:
  added: []
  patterns:
    - pure function merge (union + last-writer-wins by updated ISO string)
    - dirty-flag offline queue (mirrors sync.js saveCollection pattern)
    - tombstone propagation (deleted:true items included in merge, filtered at render)
    - TDD RED/GREEN cycle (test-list-merge.js before listMerge.js)
key_files:
  created:
    - v2/src/features/shopping/listMerge.js
    - v2/src/data/listSync.js
    - v2/tests/test-list-merge.js
  modified:
    - v2/src/data/drive.js
    - v2/src/features/shopping/shopping.js
    - v2/sw.js
    - v2/src/version.js
    - v2/src/i18n.js
    - v2/tests/run.js
decisions:
  - "Tombstone filter at render layer only (not in ITEMS array): ITEMS retains full state
    including deleted:true; visible = ITEMS.filter(x => !x.deleted) computed in paintList;
    mutation handlers still reference ITEMS by original index for correctness"
  - "listSync.js conflict branch resolves via mergeList() (unlike sync.js which preserves
    conflict): lists have item-level granularity — safe to merge; recipes are whole-document"
  - "Rule 3 auto-fixes: listMerge.js and listSync.js added to sw.js SHELL immediately on
    creation (before Task 3) to satisfy pre-existing sw-shell guard test"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-17"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 6
  tests_added: 7
  tests_total: 173
  tests_baseline: 166
---

# Phase 01 Plan 01: List Sync (Drive Persistence) Summary

**One-liner:** Item-level Drive persistence for shopping list via pure mergeList() + listSync.js module mirroring sync.js, wired into shopping.js with Refresh button and tombstone filter; APP_VERSION 2.10.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create listMerge.js (pure) and test-list-merge.js (TDD) | 37a27d2 | listMerge.js, test-list-merge.js, run.js, sw.js (Rule 3) |
| 2 | Extend drive.js + create listSync.js | a425842 | drive.js, listSync.js, sw.js (Rule 3) |
| 3 | Wire shopping.js + update sw.js/version.js/i18n.js | e5c0eef | shopping.js, sw.js, version.js, i18n.js |

## What Was Built

**listMerge.js** — Pure ESM function: `mergeList(local = [], remote = [])`. Builds a Map keyed by item.id; iterates local first, then remote; remote entry wins if `item.updated > existing.updated` (ISO string comparison). Returns all items including `deleted:true` tombstones so deletion propagates to partners. No imports, no I/O.

**listSync.js** — Service module mirroring sync.js exactly for the shopping list. Exports:
- `syncListWithDrive()` — guard → decideSync → push/pull/merge/noop; conflict branch calls mergeList() and pushes merged result back to Drive
- `saveList(items)` — writes IndexedDB immediately, attempts Drive push, sets dirty:true on failure
- `onStatus(fn)` / `getStatus()` — status listener pattern

**drive.js change** — `createFile(contentString, fileName = FILE_NAME)`: optional second param allows listSync.js to create `einkaufsliste.json` without touching the `rezepte.json` default.

**shopping.js wiring:**
- Import `listSync` added
- New items in `shopAdd()` include `id: "li-" + Date.now()`, `updated`, `author: "local"`, `deleted: false`
- Duplicate item branch stamps `updated` on increment
- `save()` calls `listSync.saveList(ITEMS)` for Drive dirty-flag push
- `load().then()` triggers background `syncListWithDrive()`; repaints if `result.changed === true`
- Refresh button (`.sl-refresh`) wired with disabled state during in-flight request
- `paintList` uses `visible = ITEMS.filter(x => !x.deleted)` for all counts and render; tombstones never reach the DOM; mutation handlers retain original ITEMS index

**sw.js** — CACHE bumped to `koch-v2.10-1`; SHELL extended with `listMerge.js` and `listSync.js`.

**version.js** — BUILD/APP_VERSION = "2.10"; CHANGELOG entry added.

**i18n.js** — 6 keys added to `shopping:` block in all 4 languages (DE/EN/ES/DA): `refreshBtn`, `refresh`, `linkPartner`, `unlinkPartner`, `syncStatus`, `syncPending`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added listMerge.js to sw.js SHELL during Task 1**
- **Found during:** Task 1 (after creating listMerge.js)
- **Issue:** `test-sw-shell.js` guard immediately detected the new `src/` module missing from SHELL, causing 1 test failure
- **Fix:** Added `"./src/features/shopping/listMerge.js"` to sw.js SHELL before Task 1 commit
- **Files modified:** v2/sw.js
- **Commit:** 37a27d2

**2. [Rule 3 - Blocking] Added listSync.js to sw.js SHELL during Task 2**
- **Found during:** Task 2 (after creating listSync.js)
- **Issue:** Same sw-shell guard fired for the new listSync.js module
- **Fix:** Added `"./src/data/listSync.js"` to sw.js SHELL before Task 2 commit
- **Files modified:** v2/sw.js
- **Commit:** a425842

Both SHELL entries ended up in the correct final positions specified by Task 3 (after `shopping.js`), so Task 3's sw.js work was limited to the CACHE bump only.

## Threat Model Coverage

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-01-01 | Mitigated | Merged remote items flow through existing `rowHTML(it, i)` which calls `esc(itemLabel(it))` — no separate render branch |
| T-01-02 | Mitigated | `mergeList()` + `decideSync()` — conflict branch merges then pushes result |
| T-01-03 | Mitigated | `listSync.js` catch block checks `e.status === 401` and surfaces "Anmeldung abgelaufen" |
| T-01-04 | Mitigated | `createFile()` called with `LIST_FILE_NAME` constant; grep gate: 0 matches for "rezepte.json" in listSync.js |
| T-01-05 | Mitigated | `syncListWithDrive()` only updates ITEMS and repaints if `changed === true` |

## Known Stubs

**sl-link-partner button** — The "Partner verknüpfen" button is rendered (HTML + i18n keys present) but not wired to a handler. The `openPickerForFile` function from PATTERNS.md was not implemented in drive.js (it would require the Google Picker API). The button appears in the UI but clicking it does nothing.

This is intentional scope for Plan 02 (or a future plan): the Picker-based partner linking is the multi-party access flow (REQ-I3A extension). The core shared-list infrastructure (einkaufsliste.json on Drive, syncListWithDrive, mergeList) is complete and sufficient for the "same Google account on two devices" use case (REQ-I2).

## TDD Gate Compliance

- RED gate: `test-list-merge.js` written before `listMerge.js` existed; node run.js failed with `ERR_MODULE_NOT_FOUND` — confirmed RED
- GREEN gate: `listMerge.js` created; all 7 new test cases + 166 baseline = 173 passed — confirmed GREEN
- REFACTOR: No refactoring needed; implementation was clean

## Self-Check

Files created:
- v2/src/features/shopping/listMerge.js: exists
- v2/src/data/listSync.js: exists
- v2/tests/test-list-merge.js: exists

Commits:
- 37a27d2: Task 1 — listMerge.js + tests
- a425842: Task 2 — drive.js + listSync.js
- e5c0eef: Task 3 — shopping.js wiring + sw/version/i18n

Test results: 173 passed, 0 failed, 173 total (baseline was 166 + 7 new = 173)

## Self-Check: PASSED
