---
phase: 01-shared-shopping-list
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - v2/src/data/drive.js
  - v2/src/data/listSync.js
  - v2/src/features/shopping/listMerge.js
  - v2/src/features/shopping/shopping.js
  - v2/src/i18n.js
  - v2/src/version.js
  - v2/sw.js
  - v2/tests/run.js
  - v2/tests/test-list-merge.js
findings:
  critical: 3
  warning: 6
  info: 1
  total: 10
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 1 shared-shopping-list implementation: Drive sync layer (`listSync.js`), item-level merge (`listMerge.js`), shopping UI (`shopping.js`), the Drive I/O module (`drive.js`), plus supporting files.

The merge function itself (`mergeList`) is correct and well-tested. The critical failures are all in how the UI layer and sync layer interact with the tombstone system. Local mutations (`splice`, `filter(!done)`) bypass tombstones entirely, meaning deletions never propagate to a partner. A timestamp mismatch in the pull/conflict path creates an infinite sync loop. These three issues will silently corrupt partner state in the happy-path sharing scenario.

---

## Critical Issues

### CR-01: Local item deletions bypass tombstone propagation — partner re-adds deleted items on next sync

**File:** `v2/src/features/shopping/shopping.js:228, 236, 242`

**Issue:** Three mutation paths remove items from `ITEMS` using `splice` or `filter`, instead of setting `deleted: true` + `updated`. The tombstone system in `listMerge.js` relies on `deleted: true` flags to propagate deletes to the partner. When a local user removes an item (dec to 0, X button, or "clear done"), the item disappears from their local `ITEMS` array but is still present (and un-tombstoned) in the partner's copy and in Drive. On next sync, `mergeList` sees the item in `remote` and no matching entry in `local`, so it re-adds it. The item will re-appear on the user's list after every sync.

**Fix:** All three removal paths must tombstone instead of splice/filter:

```js
// sl-dec → qty reaches 0
if (it.qty <= 0) {
  it.deleted = true;
  it.updated = new Date().toISOString();
  // do NOT splice
}

// sl-rm
b.onclick = () => {
  const it = ITEMS[+b.dataset.i];
  if (it) { it.deleted = true; it.updated = new Date().toISOString(); save(); paintList(container); paintCatalog(container); }
};

// clear done (line 242)
ITEMS.forEach(x => { if (x.done) { x.deleted = true; x.updated = new Date().toISOString(); } });
save(); paintList(container); paintCatalog(container);
```

`paintList` already filters `ITEMS.filter(x => !x.deleted)` (line 161), so tombstoned items are invisible to the user immediately. The tombstone then propagates on the next Drive push.

---

### CR-02: Timestamp mismatch in pull/conflict path causes infinite sync loop

**File:** `v2/src/data/listSync.js:84-89`

**Issue:** When action is `pull` or `conflict`, the code stores `updated = remote.updated` in the local DB record (line 84), but pushes the merge result back to Drive with `updated: new Date().toISOString()` (line 89) — a *newer* timestamp. On the very next sync, `meta.updated` (= `remote.updated`, older) will be less than the Drive file's `updated` (= the new timestamp just written), so `decideSync` will see a newer remote and trigger `pull` again. This repeats on every sync call, causing the list to be re-fetched and re-pushed in an endless loop.

**Fix:** Use a single consistent timestamp for both the local DB write and the Drive push:

```js
if (action === "pull" || action === "conflict") {
  const localItems = await loadLocalList();
  const merged = mergeList(localItems, remote.items || []);
  const updated = new Date().toISOString(); // one timestamp for both
  await db.put("lists", { id: LIST_DB_ID, items: merged, updated });
  meta = { ...meta, fileId, updated, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
  await db.kvSet(META_KEY, meta);
  await drive.updateFile(fileId, JSON.stringify({ version: 1, updated, items: merged }));
  setStatus("Synchronisiert ✓");
  return { changed: true, items: merged, meta };
}
```

---

### CR-03: Index-based mutation handlers become incorrect after a sync injects tombstoned items

**File:** `v2/src/features/shopping/shopping.js:181-236`

**Issue:** `data-i` attributes are set to the item's index in the raw `ITEMS` array (which may contain `deleted:true` items after a sync). The DOM is built from `indexed = ITEMS.map((it, i) => ...)` with the original indices, then filtered for `!it.deleted`. When a user taps an action button, the handler reads `ITEMS[+b.dataset.i]`. If any tombstoned items exist at lower indices in `ITEMS` between two renders, the stored `data-i` still points to the original index so the reference stays valid — but only if `ITEMS` is not mutated between the render and the click. The `sl-rm` handler (line 236) calls `ITEMS.splice(+b.dataset.i, 1)`, which shifts all subsequent indices. If two removes happen in rapid succession without a repaint, the second button's `data-i` now points to the wrong item (classic index invalidation after splice). Once CR-01 is fixed (no more splices), only the no-splice tombstone path remains valid, and this issue is resolved. But until CR-01 is fixed, any two-remove sequence risks removing the wrong item.

**Fix:** Resolve CR-01 first (switch to tombstone). After that, confirm no remaining `splice` calls mutate `ITEMS` during a render cycle.

---

## Warnings

### WR-01: Hardcoded OAuth Client ID in source

**File:** `v2/src/data/drive.js:8`

**Issue:** `GOOGLE_CLIENT_ID` contains a live OAuth 2.0 client ID. Committed to version control, this is visible to anyone with repo access. An attacker can register their own web application with this Client ID on an authorized redirect URI they control, then redirect auth flows through it. Even for a personal app, rotating credentials requires a code change rather than a config change.

**Fix:** Move to a build-time variable or a `config.js` that is gitignored. At minimum, document that the Client ID should be treated as semi-public and ensure "Authorized JavaScript origins" is tightly scoped to the actual hosting domain in Google Cloud Console.

---

### WR-02: `id` collision risk when multiple items added rapidly

**File:** `v2/src/features/shopping/shopping.js:60`

**Issue:** `id: "li-" + Date.now()` produces identical IDs if two items are added within the same millisecond (rapid taps from catalog, or `addItemsToList` bulk-adding). When `mergeList` processes two items with the same ID, the second one silently overwrites the first based on `updated` comparison — one item is lost with no error.

**Fix:**

```js
id: "li-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
```

A short random suffix makes same-millisecond collisions practically impossible without needing a full UUID library.

---

### WR-03: Race condition on first sync — concurrent calls can create duplicate Drive files

**File:** `v2/src/data/listSync.js:49-58`

**Issue:** `renderShopping` (line 149) calls `syncListWithDrive()` immediately after `load()`. If the user is signed in and taps the Refresh button (line 115) before the first background sync completes, two concurrent calls both find `meta.fileId === undefined` and both execute the `createFile` branch. The second call also succeeds (Drive allows multiple files with the same name under `drive.file` scope), resulting in two `einkaufsliste.json` files. Subsequent syncs will use whichever `fileId` was saved last, silently ignoring the other.

**Fix:** Add an in-flight guard:

```js
let syncInProgress = false;
export async function syncListWithDrive() {
  if (syncInProgress) return { changed: false };
  syncInProgress = true;
  try { /* existing body */ } finally { syncInProgress = false; }
}
```

---

### WR-04: Partner-link validation is silent and locale-fragile

**File:** `v2/src/features/shopping/shopping.js:130-132`

**Issue:** `fileName.includes("einkaufsliste")` is the only guard against picking the wrong file. It fails silently (only `console.warn`) with no user-facing message. A partner who renamed the file, or whose OS localized the filename, will see the link button appear to succeed but nothing happens. The fileId is then saved with `linked: true` and subsequent syncs will try to read an unrelated JSON file, corrupting the list.

**Fix:** Show a visible error to the user when validation fails, and consider adding a content-based check (e.g., verify that the fetched file contains `{ version: 1, items: [...] }`):

```js
if (!fileName.includes("einkaufsliste")) {
  alert(t("shopping.pickerWrongFile") || "Das ist keine Einkaufsliste. Bitte die richtige Datei wählen.");
  return;
}
```

---

### WR-05: Cache name in sw.js is not tied to version.js — stale cache risk on version bumps

**File:** `v2/sw.js:9`

**Issue:** `const CACHE = "koch-v2.10-1"` is a manually maintained string. `version.js` has `BUILD = "2026-06-17-v2.10"`. These can drift independently. If a developer updates `version.js` to `v2.11` but forgets to update `sw.js`, the service worker continues serving cached `v2.10` assets. This already happened: the `"-1"` suffix in the cache name suggests the cache was manually bumped independently of the version.

**Fix:** There is no build step to automate this, so at minimum add a comment making the coupling explicit:

```js
// MUST match APP_VERSION in src/version.js — bump both together.
const CACHE = "koch-v2.10-1";
```

Longer term: generate the cache name from `version.js` via a pre-deploy script.

---

### WR-06: `mergeList` silently accepts items without `updated` field — wrong merge outcome

**File:** `v2/src/features/shopping/listMerge.js:12`

**Issue:** The merge condition is `item.updated > existing.updated`. If either value is `undefined` (item has no `updated` field), the comparison is `undefined > string` or `string > undefined`, both of which evaluate to `false` in JavaScript. An item without `updated` will never win a conflict, even if it is the only version of a new item added by the partner. Test cases in `test-list-merge.js` (cases 4, 5, 6, 7) use non-ISO strings like `"T1"`, `"T2"` for `updated` — this works for unit tests but masks the real problem that the function has no guard for missing `updated`.

`loadLocalList` (listSync.js:30) assigns `updated` during migration, but `shopAdd` in shopping.js sets `updated` correctly. However, items coming from a partner who runs older code (before this phase) may lack the field.

**Fix:**

```js
function cmp(a, b) {
  // treat missing updated as epoch so any real timestamp wins
  return (a.updated || "") > (b.updated || "");
}
// then: if (!existing || cmp(item, existing)) byId.set(item.id, item);
```

---

## Info

### IN-01: Inconsistent dedup strategies between `shopAdd` and catalog badge lookup

**File:** `v2/src/features/shopping/shopping.js:56-57 and 291`

**Issue:** `shopAdd` deduplicates by `itemKey(name, null)` (line 56), while the catalog badge lookup uses `x.name.toLowerCase() === b.dataset.name.toLowerCase()` (line 291). `itemKey` normalizes by stripping units and whitespace (depending on its implementation); a simple `.toLowerCase()` does not. If `itemKey` considers "Tomaten" and "tomaten" the same but `toLowerCase` does not (unlikely, but possible if `itemKey` does more normalization), the badge count could display for a different item than expected, or not display at all.

**Fix:** Use `itemKey` consistently in both places, or confirm the two comparison strategies are provably equivalent for all catalog item names.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
