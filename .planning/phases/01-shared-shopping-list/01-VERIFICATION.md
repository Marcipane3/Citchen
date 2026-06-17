---
phase: 01-shared-shopping-list
verified: 2026-06-17T15:00:00Z
status: gaps_found
score: 9/11 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Tombstone items (deleted:true) never reach the DOM — deletions propagate to partners"
    status: failed
    reason: "CR-01: All four local deletion paths in shopping.js use ITEMS.splice() or ITEMS.filter() to remove items rather than setting deleted:true + updated. Tombstone propagation is only meaningful if tombstones are actually created on delete. Currently, a locally deleted item disappears from ITEMS entirely, so mergeList re-adds it from the remote partner on the next sync. The phase-level truth cannot be achieved with splice semantics."
    artifacts:
      - path: "v2/src/features/shopping/shopping.js"
        issue: "Line 228: ITEMS.splice(i, 1) when qty reaches 0 (dec handler). Line 236: ITEMS.splice(+b.dataset.i, 1) in the X-button handler. Line 242: ITEMS = ITEMS.filter((x) => !x.done) in clear-done. Line 247: ITEMS = [] in clear-all. None of these set deleted:true."
    missing:
      - "Replace ITEMS.splice(i, 1) at line 228 with: it.deleted = true; it.updated = new Date().toISOString();"
      - "Replace ITEMS.splice(+b.dataset.i, 1) at line 236 with a tombstone mutation on ITEMS[+b.dataset.i]"
      - "Replace ITEMS.filter((x) => !x.done) at line 242 with forEach that sets deleted:true + updated on done items"
      - "Clear-all (line 247: ITEMS = []) needs a tombstone path for shared-list mode; current full-wipe is acceptable only for local-only use but breaks partner sync"

  - truth: "syncListWithDrive() creates einkaufsliste.json on first run; reads/merges/writes on subsequent runs — stable across repeated syncs (no infinite loop)"
    status: failed
    reason: "CR-02: In the pull/conflict branch of syncListWithDrive() (listSync.js lines 84-89), meta.updated is set to remote.updated (old timestamp from Drive), but Drive is written with updated: new Date().toISOString() (a newer timestamp). On the very next sync call, decideSync receives localUpdated=remote.updated (old) vs remoteUpdated=new_now (newer), which triggers pull again. This creates an infinite sync loop: every call to syncListWithDrive() in the pull/conflict path will permanently re-fetch, re-merge, and re-push the list."
    artifacts:
      - path: "v2/src/data/listSync.js"
        issue: "Line 84: const updated = remote.updated (stored in meta and local DB). Line 89: drive.updateFile writes updated: new Date().toISOString() — a DIFFERENT, newer timestamp. These two timestamps must be the same value."
    missing:
      - "Use a single timestamp for both the local DB write (line 84) and the Drive push (line 89): const updated = new Date().toISOString(); then use it in both db.put and drive.updateFile"
---

# Phase 01: Shared Shopping List — Verification Report

**Phase Goal:** The shopping list is persisted to its own `einkaufsliste.json` on Google Drive with an item-level merge model. A second person (partner/friend with the app + Google account) can link to the same file once via the Google Picker and then both parties see each other's additions after a manual refresh. Design is multi-party-ready from day one (author field, union-merge semantics).

**Verified:** 2026-06-17T15:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Shopping list survives a full page reload — items loaded from Drive on start | VERIFIED | `load().then()` in renderShopping (line 146) calls `listSync.syncListWithDrive()` and repaints if `result.changed === true`. IndexedDB load plus Drive background sync on every page render. |
| 2 | Adding an item on device A and refreshing on device B (same Google account) shows the new item | VERIFIED | saveList() in shopping.js line 30 pushes to Drive on save. syncListWithDrive() reads Drive and merges on load/refresh. Refresh button (line 114-124) is wired and disabled during in-flight. |
| 3 | Two concurrent adds (one per device/account) both survive — no item is silently dropped | VERIFIED | mergeList() builds a Map keyed by item.id using union semantics. Test case 7 in test-list-merge.js directly covers this: concurrent adds from both sides produce merged.length === 2. |
| 4 | Going offline queues changes (dirty flag); they push when back online | VERIFIED | saveList() (listSync.js lines 110-130) sets dirty:true immediately, then attempts Drive push only if `drive.isSignedIn() && navigator.onLine !== false`. Push failure is caught and dirty flag stays true for next sync. |
| 5 | mergeList(local, remote) is a pure function with at least 6 unit-test cases passing | VERIFIED | listMerge.js: no imports, no I/O, pure export. test-list-merge.js: 7 test() calls covering empty, remote-wins, local-wins, tombstone, two-author, idempotent, concurrent-adds. All 173 tests pass (node v2/tests/run.js). |
| 6 | The recipe file rezepte.json is never touched by any list operation (grep gate) | VERIFIED | `grep -rn "rezepte.json" v2/src/data/listSync.js` — 0 matches. `grep -rn "rezepte.json" v2/src/features/shopping/listMerge.js v2/src/features/shopping/shopping.js` — 0 matches. createFile() in listSync.js is always called with LIST_FILE_NAME ("einkaufsliste.json"). |
| 7 | Tombstone items (deleted:true) never reach the DOM | PARTIAL | paintList() correctly filters: `const visible = ITEMS.filter(x => !x.deleted)` (line 161). The render loop uses `indexed = ITEMS.map((it, i) => ...).filter(({ it }) => !it.deleted)` (line 202). DOM filtering is correct. However: local deletions do NOT create tombstones (CR-01 — see gaps). Items are spliced/filtered out of ITEMS entirely, so they also vanish from Drive on next push. A partner's copy still has the item un-tombstoned and it will re-appear after the next merge. The DOM-level filter works; the propagation contract is broken. |
| 8 | syncListWithDrive() creates einkaufsliste.json on first run; stable across repeated syncs | PARTIAL | First-run path is correct (lines 49-58: loadLocalList → createFile with LIST_FILE_NAME → store meta). Subsequent push path is correct. Pull/conflict path has a timestamp mismatch (CR-02): meta.updated = remote.updated but Drive gets new Date().toISOString(), causing decideSync to see a perpetually newer remote and triggering pull again on every subsequent sync call. |
| 9 | openPickerForFile(mimeType, callback) is exported from drive.js; TOKEN never leaves the module | VERIFIED | drive.js line 211: `export function openPickerForFile(mimeType, onFilePicked)`. TOKEN is module-private (line 17: `let TOKEN = null`). `grep -n "export.*TOKEN" v2/src/data/drive.js` returns only `export function isSignedIn() { return !!TOKEN; }` — TOKEN value is never exported. pickerLoaded singleton at line 209. |
| 10 | Picker button in shopping.js validates fileName before storing fileId in listMeta | VERIFIED | shopping.js line 130: `if (!fileName.includes("einkaufsliste"))` guard before any kvSet. Aborts with console.warn on mismatch. Valid pick stores meta via db.kvSet("listMeta", ...) and immediately calls syncListWithDrive(). |
| 11 | pickerPrompt key present in all 4 language blocks | VERIFIED | `grep -c "pickerPrompt" v2/src/i18n.js` returns 4. Confirmed in DE (line 199), EN, ES, DA blocks. refreshBtn also confirmed at count 4. |

**Score:** 9/11 truths fully verified; 2 truths FAILED (CR-01, CR-02) representing the tombstone propagation contract and infinite sync loop.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `v2/src/features/shopping/listMerge.js` | Pure mergeList() export, union + LWW by ISO string | VERIFIED | No imports, no I/O. Single export `mergeList(local=[], remote=[])`. Map keyed by id, remote wins if `item.updated > existing.updated`. |
| `v2/src/data/listSync.js` | syncListWithDrive, saveList, onStatus, getStatus exports | VERIFIED | All 4 exports present. mirrors sync.js structure. Uses LIST_FILE_NAME constant for Drive file. |
| `v2/tests/test-list-merge.js` | 7 unit tests for mergeList | VERIFIED | Exactly 7 test() calls with German names. Covers all 7 behaviors from plan spec. All pass. |
| `v2/src/data/drive.js` | createFile(contentString, fileName = FILE_NAME); openPickerForFile export | VERIFIED | Line 162: `createFile(contentString, fileName = FILE_NAME)`. Line 211: `export function openPickerForFile(mimeType, onFilePicked)`. |
| `v2/src/features/shopping/shopping.js` | Drive wiring, id/updated/author/deleted fields, Refresh button, tombstone filter | PARTIAL | All structural wiring present. shopAdd() adds id/updated/author/deleted (lines 60-66). Refresh button wired (lines 114-124). paintList tombstone filter correct at DOM level (lines 161, 202). Deletion handlers do NOT tombstone — CR-01. |
| `v2/sw.js` | CACHE "koch-v2.10-1"; SHELL includes listMerge.js and listSync.js | VERIFIED | Line 9: `const CACHE = "koch-v2.10-1"`. Line 45: `"./src/features/shopping/listMerge.js"`. Line 46: `"./src/data/listSync.js"`. |
| `v2/src/version.js` | BUILD/APP_VERSION = "2.10"; CHANGELOG entry | VERIFIED | BUILD = "2026-06-17-v2.10", APP_VERSION = "2.10". v2.10 CHANGELOG entry present. |
| `v2/src/i18n.js` | 6 keys (refreshBtn, refresh, linkPartner, unlinkPartner, syncStatus, syncPending) + pickerPrompt in all 4 languages | VERIFIED | All 7 keys confirmed in DE block (lines 196-199). grep -c returns 4 for both refreshBtn and pickerPrompt. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| shopping.js | listSync.js | `import * as listSync` | VERIFIED | Line 7 of shopping.js. syncListWithDrive() called at lines 117, 137, 149. saveList() called at line 30. |
| listSync.js | drive.js | `drive.createFile(content, LIST_FILE_NAME)` | VERIFIED | Line 54: `drive.createFile(content, LIST_FILE_NAME)`. LIST_FILE_NAME = "einkaufsliste.json". |
| listSync.js | listMerge.js | `import { mergeList }` | VERIFIED | Line 9: `import { mergeList } from "../features/shopping/listMerge.js"`. Used at line 83. |
| sw.js | listSync.js | SHELL array entry | VERIFIED | Line 46: `"./src/data/listSync.js"`. |
| sw.js | listMerge.js | SHELL array entry | VERIFIED | Line 45: `"./src/features/shopping/listMerge.js"`. |
| shopping.js (.sl-link-partner) | drive.js (openPickerForFile) | `drive.openPickerForFile(...)` | VERIFIED | shopping.js line 128: `drive.openPickerForFile("application/json", async (fileId, fileName) => {...})`. |
| Picker callback | db.kvSet("listMeta") | filename validation + kvSet | VERIFIED | Lines 130-136: validates fileName.includes("einkaufsliste"), then kvSet with new meta. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| shopping.js (paintList) | `visible` (filtered ITEMS) | `load()` reads IndexedDB; `syncListWithDrive()` reads Drive | Yes — IndexedDB read via db.get, Drive read via driveFetch | FLOWING |
| listSync.js (syncListWithDrive) | `remote.items` | drive.readFile(fileId) → driveFetch(Drive API) | Yes — real Drive API call returning parsed JSON | FLOWING |
| listMerge.js (mergeList) | return value | Called with localItems (from IndexedDB) and remote.items (from Drive) | Yes — real items arrays | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 173 tests pass (covers merge, sync logic, SW shell guard) | `node v2/tests/run.js` | `173 bestanden, 0 fehlgeschlagen, 173 gesamt` — exit 0 | PASS |
| SW cache name is "koch-v2.10-1" | `grep -c "koch-v2.10-1" v2/sw.js` | 1 | PASS |
| listSync.js references einkaufsliste.json (not rezepte.json) | `grep -c "einkaufsliste.json" v2/src/data/listSync.js` + `grep -c "rezepte.json" v2/src/data/listSync.js` | 2 matches for einkaufsliste, 0 for rezepte | PASS |
| openPickerForFile exported; TOKEN not exported | `grep -n "openPickerForFile" v2/src/data/drive.js` + `grep -n "export.*TOKEN"` | Line 211 match; `isSignedIn` is only export using TOKEN (value not exported) | PASS |
| i18n refreshBtn count = 4; pickerPrompt count = 4 | `grep -c "refreshBtn" v2/src/i18n.js` + `grep -c "pickerPrompt" v2/src/i18n.js` | 4, 4 | PASS |
| Tombstone filter in paintList | `grep -n "x.deleted" v2/src/features/shopping/shopping.js` | Lines 119, 139, 151 (post-sync filter), 161 (paintList), 202 (indexed) | PASS |
| Deletion handlers use tombstone (not splice) | `grep -n "splice" v2/src/features/shopping/shopping.js` | Lines 228, 236 — SPLICE in use, not tombstone | FAIL — CR-01 |
| Pull/conflict uses consistent updated timestamp | `grep -n "updated" v2/src/data/listSync.js` lines 84-89 | Line 84: `remote.updated`; Line 89: `new Date().toISOString()` — TWO different timestamps | FAIL — CR-02 |

---

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files found; phase is a UI/module phase with no conventional probes.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| REQ-I2 | 01-01-PLAN.md | Two-way shared list via shared Drive file with item-level merge | PARTIAL | Infrastructure (listSync.js, mergeList, Drive wiring) complete. CR-01 means deletes do not propagate; CR-02 means the sync loop fires on every pull/conflict. The add-item case works; the delete-item case is broken for partner sync. |
| REQ-I3A | 01-01-PLAN.md, 01-02-PLAN.md | Multi-party-ready schema (author field, union-merge for 2+ authors); Google Picker cross-account handshake | PARTIAL | Schema correct (author, id, deleted, updated fields on items). mergeList union semantics correct. Picker handshake implemented and wired. CR-01 means delete propagation (part of multi-party contract) is broken. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| v2/src/features/shopping/shopping.js | 228 | `ITEMS.splice(i, 1)` — removes item instead of tombstoning | BLOCKER | Partner sync re-adds deleted items; breaks REQ-I2 delete propagation |
| v2/src/features/shopping/shopping.js | 236 | `ITEMS.splice(+b.dataset.i, 1)` — removes item instead of tombstoning | BLOCKER | Same as above; X-button path |
| v2/src/features/shopping/shopping.js | 242 | `ITEMS = ITEMS.filter((x) => !x.done)` — filters out done items instead of tombstoning | BLOCKER | "Clear done" path also bypasses tombstone propagation |
| v2/src/features/shopping/shopping.js | 247 | `ITEMS = []` — clears all items without tombstoning | WARNING | "Clear all" is more of a local-only action; less critical but still bypasses partner sync |
| v2/src/data/listSync.js | 84-89 | `const updated = remote.updated` stored locally but `new Date().toISOString()` written to Drive | BLOCKER | Creates infinite sync loop: decideSync always sees Drive as newer, triggering pull on every sync |
| v2/src/data/listSync.js | (structural) | No in-flight sync guard | WARNING | Concurrent calls on page load + Refresh button can create duplicate einkaufsliste.json files in Drive |
| v2/src/features/shopping/shopping.js | 60 | `id: "li-" + Date.now()` — collision risk on rapid adds | WARNING | Same-millisecond adds produce duplicate IDs; one item silently lost by mergeList |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-modified files.

---

### Human Verification Required

The following items cannot be verified programmatically and require a live browser session:

#### 1. Drive Persistence — Single Account

**Test:** Open the app (GitHub Pages URL), sign in with Google, open the Shopping List, add an item (e.g. "Testitem"), perform a hard reload (Ctrl+Shift+R).
**Expected:** "Testitem" is still in the list (loaded from Drive). `einkaufsliste.json` visible in Google Drive.
**Why human:** Requires a live Google auth session and Drive API calls; cannot be run in a headless check.

#### 2. Refresh Button Behavior

**Test:** After adding items and signing in, tap the "Aktualisieren" button.
**Expected:** Button is visibly disabled during the request, then re-enabled. Status updates without error.
**Why human:** DOM interaction and disabled-state timing require a browser.

#### 3. Google Picker — Cross-Account Partner Link

**Test:** On a second device or incognito window, sign in with a different Google account. Go to Shopping List → tap "Partner verknüpfen". Pick the owner's `einkaufsliste.json` from "Shared with me".
**Expected:** Picker opens, file is selectable, list reloads showing owner's items. Adding an item on the partner account and refreshing on the owner account shows the partner's item.
**Why human:** Requires two real Google accounts, a live Picker API session, and cross-account Drive file sharing.

#### 4. Picker File Validation

**Test:** In the Picker, try to pick a file other than `einkaufsliste.json` (e.g. `rezepte.json`).
**Expected:** Picker callback fires `console.warn` and no fileId is stored; list does not change.
**Why human:** Requires interactive Picker session and browser dev-tools observation.

#### 5. CR-01 Manifestation in Shared Context

**Test:** With two accounts linked to the same `einkaufsliste.json`, add an item on account A. On account B, add the same item (different name). On account A, delete the item using the X button. Tap Refresh on account A. Tap Refresh on account B.
**Expected (broken):** Deleted item will re-appear on account A after refresh because CR-01 means the delete was not tombstoned and account B's copy still has the item.
**Why human:** Requires two active sessions; also confirms the CR-01 failure mode is observable rather than theoretical.

---

## Gaps Summary

Two blockers prevent full phase goal achievement:

**CR-01 — Tombstone bypass on local deletes** (shopping.js lines 228, 236, 242, 247)

All four local deletion paths (`sl-dec` qty-to-zero, `sl-rm` X-button, "clear done", "clear all") use `ITEMS.splice()` or `ITEMS.filter()` to physically remove items rather than setting `deleted: true` + `updated`. The tombstone propagation system in `listMerge.js` is correct and the DOM render filter (`visible = ITEMS.filter(x => !x.deleted)`) is correct — but tombstones are never created. The practical effect: when a user deletes an item, it vanishes from their local state and Drive push. But the partner's copy still has the item (un-tombstoned). On the next merge, `mergeList` sees the item in `remote` and not in `local`, so it re-adds it. The item will ghost-reappear after every sync. This breaks REQ-I2 and the "deletion propagation" contract of the tombstone design.

**CR-02 — Infinite sync loop in pull/conflict path** (listSync.js lines 84-89)

After a pull or conflict merge, `meta.updated` is set to `remote.updated` (the old Drive timestamp), but the Drive file is written with `updated: new Date().toISOString()` (a new, later timestamp). On the next call to `syncListWithDrive()`, `decideSync` compares `meta.updated` (old) with the Drive file's `updated` (new) and decides `pull` again. This repeats indefinitely. Every Refresh button tap or page load sync will re-fetch, re-merge, and re-push — the list never reaches a stable "noop" state after an initial pull. The fix is a 1-line change: use a single `const updated = new Date().toISOString()` for both the local DB write and the Drive push.

Both gaps are root-cause bugs in the shared-list protocol implementation. CR-02 is a 1-line fix; CR-01 requires replacing 3-4 mutation handlers with tombstone logic. Neither is a design issue — the correct design (tombstones, LWW merge, stable timestamps) is already specified and partially implemented.

---

_Verified: 2026-06-17T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
