# Phase 1: Shared Shopping List — Research

**Researched:** 2026-06-17
**Domain:** Google Drive sync, item-level merge, Google Picker API, PWA offline
**Confidence:** HIGH (codebase fully read; Picker behavior verified via official docs)

---

## Summary

The shopping list is currently IndexedDB-only (`shopping.js` → `db.js` store "lists", id "current"). It never touches Drive. `sync.js` and `store.js` know only the recipe collection. This phase opens one structural seam — persisting the list to a second Drive file (`einkaufsliste.json`) — and adds cross-account access via the Google Picker.

The K2 work already extracted `decideSync()` as a pure, collection-agnostic function in `src/data/decideSync.js`. This is the correct seam to reuse: list sync uses the same five-signal decision matrix (`hasRemote`, `localUpdated`, `remoteUpdated`, `dirty`, `source`) as recipe sync. No second ad-hoc Drive writer is needed; instead the list gets its own thin sync module that calls `decideSync()`.

Item-level merge (`mergeList(local, remote)`) is required because two simultaneous editors sharing a file must not clobber each other's adds. The merge rule is simple: union of all items, last-writer-per-item wins by `updated` ISO timestamp. Deleted items use a `deleted: true` tombstone instead of absence.

**Primary recommendation:** Build in two focused plans — (01-01) item schema + `mergeList()` + Drive persistence + offline queue; (01-02) Google Picker handshake + share UX. Keep the recipe sync path completely untouched.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| List persistence (read/write Drive) | `src/data/listSync.js` (new) | `src/data/drive.js` (existing) | Mirrors `sync.js` pattern; drive.js is the only Drive I/O layer |
| Item-level merge logic | `src/features/shopping/listMerge.js` (new, pure) | — | Must be pure + unit-tested; no I/O |
| Offline queue | `src/data/listSync.js` | `src/data/db.js` (kv store, `dirty` flag) | Same dirty-flag pattern as recipe sync |
| Google Picker handshake | `src/features/shopping/shopping.js` (UI trigger) | `src/data/drive.js` (gapi.load) | Picker is a UI action; fileId stored in kv |
| Cross-account fileId storage | `src/data/db.js` kv store (key: `listMeta`) | — | Same pattern as `collection` meta key |
| Service worker cache | `sw.js` SHELL list | — | New modules must be added or the SHELL guard test fails |
| i18n strings | `src/i18n.js` | — | New keys for sync status, Picker prompt, link/unlink |

---

## Standard Stack

### Core (all already in the project — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `src/data/drive.js` | (existing) | Drive REST CRUD — `createFile`, `readFile`, `updateFile` | Single Drive I/O layer; extend, don't duplicate |
| `src/data/decideSync.js` | (existing) | Pure LWW decision: create/push/pull/conflict/noop | K2 seam; already unit-tested for 9 cases |
| `src/data/db.js` | (existing) | IndexedDB, kv store for meta | `kvGet`/`kvSet` pattern already used for `collection` meta |
| `src/features/shopping/logic.js` | (existing) | `mergeItems()`, `itemKey()` for local add-merge | Extend/parallel pattern for `mergeList()` |
| Google Identity Services (GIS) | (existing, loaded in index.html) | OAuth token for Drive and Picker | Already wired in `drive.js:initAuth()` |

### New module: Google Picker API

| Library | Source | Purpose | Notes |
|---------|--------|---------|-------|
| `gapi` (`apis.google.com/js/api.js`) | CDN (already in index.html) | Loads Picker library via `gapi.load('picker', cb)` | Already loaded for Drive; just need to load the `picker` module too |
| `google.picker.PickerBuilder` | CDN (same script) | Shows Drive file-chooser UI | [VERIFIED: developers.google.com/workspace/drive/picker] |

**No new npm packages. No build step. Zero dependencies added.** [VERIFIED: codebase read]

### Installation

None — no packages to install. The Picker is a CDN API loaded from `apis.google.com/js/api.js`, the same script tag already present.

---

## Package Legitimacy Audit

No external packages are being installed in this phase. All capabilities come from:
- Existing project modules (in-repo `.js` files)
- Google APIs already loaded via CDN in `index.html`

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** none

---

## Architecture Patterns

### System Architecture Diagram

```
  [shopping.js — UI]
        |
        |— add/check/remove → ITEMS[] (in-memory)
        |                          |
        |                    save() → IndexedDB "lists" (instant)
        |                          |
        |              listSync.syncListWithDrive()
        |                    |           |
        |              (online+auth)  (offline)
        |                    |           |
        |              drive.readFile   dirty=true
        |                    |         (queued)
        |              mergeList(local, remote)
        |                    |
        |              drive.updateFile / createFile
        |
        |— "🔄 Aktualisieren" button → listSync.syncListWithDrive()
        |
        |— "Partner verknüpfen" → Picker flow:
              gapi.load('picker') → PickerBuilder.setOAuthToken(TOKEN)
              .addView(DOCS).setCallback(cb) → user picks einkaufsliste.json
              cb receives fileId → kvSet('listMeta', {..., fileId, linked: true})
              → syncListWithDrive() with partner's fileId
```

### Recommended Project Structure

```
v2/src/
  data/
    listSync.js          # NEW: list-sync lifecycle (mirrors sync.js for recipes)
  features/
    shopping/
      listMerge.js       # NEW: pure mergeList(local, remote) → merged[]
      shopping.js        # MODIFY: wire listSync on load + "🔄" button + Picker trigger
```

### Pattern 1: Collection-agnostic sync using decideSync()

The recipe sync (`sync.js`) calls `decideSync({hasRemote, localUpdated, remoteUpdated, dirty, source})` to decide action. The list sync module does the same, with the list's own `listMeta` kv entry supplying the same five inputs.

**What:** `listSync.js` reads `listMeta` from kv, reads the Drive file if present, calls `decideSync()`, then handles create/push/pull/conflict exactly as `sync.js` does for recipes.

**When to use:** On every app load (after auth resolves) and on manual "🔄 Aktualisieren" press.

```javascript
// Source: pattern derived from src/data/sync.js + src/data/decideSync.js
async function syncListWithDrive() {
  if (!drive.isSignedIn()) return { changed: false };
  let meta = await db.kvGet("listMeta", {});
  let fileId = meta.fileId;

  if (!fileId) {
    // No known file: create one with current local list
    const items = await loadLocalList();
    const content = JSON.stringify({ version: 1, updated: new Date().toISOString(), items });
    fileId = await drive.createFile(content, "einkaufsliste.json");
    // NOTE: drive.createFile() currently hardcodes FILE_NAME = "rezepte.json" —
    // must be extended to accept a fileName parameter. See Pitfall 1.
    await db.kvSet("listMeta", { ...meta, fileId, dirty: false, lastSync: new Date().toISOString() });
    return { changed: false };
  }

  const remote = await drive.readFile(fileId);
  const action = decideSync({
    hasRemote: true,
    localUpdated: meta.updated || "",
    remoteUpdated: remote.updated || "",
    dirty: meta.dirty || false,
    source: meta.source || "local",
  });

  if (action === "push") {
    const items = await loadLocalList();
    const updated = new Date().toISOString();
    await drive.updateFile(fileId, JSON.stringify({ version: 1, updated, items }));
    await db.kvSet("listMeta", { ...meta, dirty: false, updated, lastSync: new Date().toISOString(), source: "drive" });
    return { changed: false };
  }
  if (action === "pull" || action === "conflict") {
    const localItems = await loadLocalList();
    const merged = mergeList(localItems, remote.items || []);
    await db.put("lists", { id: "current", items: merged, updated: remote.updated });
    await db.kvSet("listMeta", { ...meta, updated: remote.updated, dirty: false, lastSync: new Date().toISOString(), source: "drive" });
    return { changed: true, items: merged };
  }
  // noop or create: no action
  return { changed: false };
}
```

**Note on conflict for lists:** Unlike recipes, the list uses item-level merge, so `conflict` is not a dead-end — `mergeList()` resolves it. The conflict case for the list should call `mergeList()` and push the result, not just preserve local.

### Pattern 2: Item-level merge — `mergeList(local, remote)`

**What:** Union of all items keyed by `id`. Last writer per item wins by `updated` ISO string comparison. Deleted items carry `deleted: true` tombstone; they are excluded from the rendered list but included in the merged file so deletion propagates.

**When to use:** Whenever a remote version of the list is read and must be reconciled with local.

```javascript
// Source: derived from Epic I2 item-merge spec in ROADMAP.md
// File: src/features/shopping/listMerge.js
export function mergeList(local, remote) {
  // Build a map: id → item (whichever has the later `updated` timestamp wins)
  const byId = new Map();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing || item.updated > existing.updated) byId.set(item.id, item);
  }
  return [...byId.values()];
}
// Returns all items including those with deleted:true.
// Shopping.js filters out deleted:true before rendering.
```

**Multi-party note:** This merge works for 2+ authors because it operates on each item independently. The `author` field is informational only; merge correctness does not depend on it.

### Pattern 3: Google Picker handshake for cross-account access

**What:** Person A creates `einkaufsliste.json`, shares it with person B in Google Drive. Person B opens the app, taps "Partner verknüpfen", and the Google Picker shows their Drive including shared-with-me files. They pick the `einkaufsliste.json`. The Picker callback gives person B the `fileId`. B stores this fileId in `listMeta`. From this point on, B's app reads/writes using this fileId, and `drive.file` scope covers it because the Picker granted it. [CITED: developers.google.com/workspace/drive/api/guides/api-specific-auth]

**OAuth scope confirmed:** `drive.file` grants access to "files that the user shares with an app while using the Google Picker API." [CITED: developers.google.com/workspace/drive/api/guides/api-specific-auth]

**What the Picker needs:**
- `gapi.load('picker', callback)` — loads the Picker library (gapi itself is already loaded)
- An OAuth access token — already available from `drive.TOKEN` (private in drive.js, need a getter or pass it in)
- `setDeveloperKey(API_KEY)` — the API_KEY (not the client_id) — **this is a new credential needed** (see Open Questions)
- `setAppId(PROJECT_NUMBER)` — the Google Cloud project number (not the client_id)

```javascript
// Source: developers.google.com/drive/picker/guides/sample [CITED]
function openPickerForPartnerLink(oauthToken, developerKey, appId, onFilePicked) {
  gapi.load("picker", () => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes("application/json");
    const picker = new google.picker.PickerBuilder()
      .setAppId(appId)
      .setOAuthToken(oauthToken)
      .setDeveloperKey(developerKey)
      .addView(view)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const fileId = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID];
          onFilePicked(fileId);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
```

### Pattern 4: Item schema

Each item in `einkaufsliste.json` follows this shape (multi-party-ready from day one):

```javascript
{
  id: "li-1718600000000",  // "li-" + Date.now() — unique, no UUID library needed
  name: "Feta",
  qty: 1,
  amount: 200,
  unit: "g",
  cat: "Käse",
  icon: "🧀",
  checked: false,         // "done" renamed to "checked" in the Drive file for clarity
  updated: "2026-06-17T12:00:00.000Z",  // ISO, set on every mutation
  author: "marcel",       // display name or email prefix — informational
  deleted: false,         // tombstone: true = soft-deleted, not rendered
}
```

**Local IndexedDB shape stays as-is** (`shopping.js` uses `done`, not `checked`). The `listSync.js` layer translates between the two on read/write.

Alternatively: keep `done` everywhere and use it in the Drive file too. Simpler, but less clear in a multi-author context. [ASSUMED — the planner should choose one and lock it]

### Pattern 5: Offline queue (dirty flag)

Same pattern as recipes. When `drive.isSignedIn()` is false or `navigator.onLine === false`:
- Save to IndexedDB immediately
- Set `listMeta.dirty = true` in kv
- On next successful `syncListWithDrive()`, `decideSync()` returns `push` if local is newer

No separate queue data structure needed — the dirty flag plus `listMeta.updated` timestamp is sufficient, exactly as in `saveCollection()` for recipes.

### Anti-Patterns to Avoid

- **Second hard-coded file name in drive.js:** Do not copy-paste a second Drive writer that hardcodes `"einkaufsliste.json"` into shopping.js. This doubles the Drive-corruption surface. Instead, extend `drive.createFile()` to accept a `fileName` parameter. `drive.findFile()` similarly needs to accept either the known ID or a name.
- **Whole-file Last-Write-Wins for the list:** Two people simultaneously add items → one edit is silently lost. Use `mergeList()`. This is why `mergeList()` must be implemented and unit-tested before wiring Drive persistence.
- **Putting list sync inside `sync.js`:** `sync.js` is recipe-specific. Create `listSync.js` as a separate module. Both call `decideSync()` and `drive.*` — that's fine. They do NOT share state.
- **Writing to `rezepte.json`:** The recipe file must never be touched by this phase. The SHELL guard test and canonical test will catch accidental cross-writes if the tests are run.
- **Rendering deleted:true tombstone items:** Filter `item.deleted !== true` before building the display list in `shopping.js`.
- **Not bumping CACHE/BUILD in version.js:** The SW guard test will catch new modules missing from SHELL, but the cache version must also be bumped so users get the new SW. Pattern: `"koch-v2.10-1"` → `"koch-v2.10-2"` is for SHELL-only changes; for new app versions bump APP_VERSION.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drive REST I/O | New fetch wrapper in shopping.js or listSync.js | `drive.js` (`readFile`, `updateFile`, `createFile` extended with fileName param) | drive.js is the single Drive I/O surface; duplicating it doubles the failure surface |
| Sync decision logic | New "should I push or pull?" conditions in listSync.js | `decideSync()` from `decideSync.js` | Already tested for 9 edge cases including the silent-overwrite bug |
| UUID for item IDs | `crypto.randomUUID()` or a library | `"li-" + Date.now()` | Same-millisecond collision probability is negligible for a 1–5 person list; no library needed |
| Real-time push/notify | WebSockets, Firebase, SSE | Manual "🔄 Aktualisieren" button | Roadmap explicitly chose refresh-to-sync; real-time is out of scope (I3 path B, V3) |
| File discovery without known ID | Drive search query | Store fileId in `listMeta` kv after creation or Picker | `drive.file` scope cannot list files without a known ID; the existing `findFile()` fallback uses name search but only works for files the app created |

**Key insight:** The most dangerous risk in this phase is not the merge logic (it's simple) — it's accidentally introducing a second Drive writer that bypasses `drive.js`. Every Drive operation must go through the existing `drive.js` functions, extended where needed.

---

## Common Pitfalls

### Pitfall 1: drive.createFile() and drive.findFile() are hardcoded to rezepte.json

**What goes wrong:** `createFile()` sets `name: FILE_NAME` where `FILE_NAME = "rezepte.json"`. If called without modification, the list file will be created as `rezepte.json`, which would then overwrite the recipe file.

**Why it happens:** drive.js was written for a single file. The `FILE_NAME` constant and `KNOWN_FILE_ID` constant are module-level.

**How to avoid:** Add a `fileName` parameter to `createFile()` with `"rezepte.json"` as default. Add an optional `fileName` parameter to `findFile()` for name-search fallback. The list sync module passes `"einkaufsliste.json"`.

**Warning signs:** If a test opens the recipe Drive file and finds list items in it — this pitfall was hit.

### Pitfall 2: The Picker needs an API key (developer key) that is not in the project yet

**What goes wrong:** `PickerBuilder.setDeveloperKey(API_KEY)` requires a Google Cloud API key (not the OAuth client ID). This is a separate credential. Without it, the Picker may throw an "API key is invalid" error.

**Why it happens:** The existing app only has `GOOGLE_CLIENT_ID` (OAuth). The Picker API is a separate Google service that needs its own API key restriction.

**How to avoid:** During plan 01-02, the task must include: "Enable the Google Picker API in Google Cloud Console, create a browser-restricted API key, add it to drive.js or a new constant in index.html." This is a one-time setup step, not code.

**Warning signs:** Picker dialog doesn't open; browser console shows "The API developer key is invalid."

### Pitfall 3: drive.file scope and Picker — the partner must pick the file at least once

**What goes wrong:** Person B tries to read partner's `einkaufsliste.json` directly by fileId (perhaps manually entered) without having gone through the Picker. Drive returns 403.

**Why it happens:** `drive.file` grants access only to files the app opened via the Picker or created itself. Even if person B has the fileId, the scope blocks access until the Picker flow grants it. [CITED: developers.google.com/workspace/drive/api/guides/api-specific-auth]

**How to avoid:** The Picker handshake is not optional for cross-account access with `drive.file` scope. Person B must always use the Picker to link the file the first time. After that, the fileId is stored in `listMeta` and future reads work.

**Warning signs:** 403 errors on `readFile(partnerFileId)` even though person B has Drive access to the file via web UI sharing.

### Pitfall 4: gapi.load('picker') is async — don't open the Picker before the library loads

**What goes wrong:** Calling `PickerBuilder` before `gapi.load('picker', cb)` completes results in `google.picker is undefined`.

**Why it happens:** The Picker library is not loaded automatically with `gapi.js`; it must be explicitly loaded per session.

**How to avoid:** Always open the Picker inside the `gapi.load('picker', () => { ... })` callback or after a promise that wraps it. Cache the loaded state (boolean flag or promise) so subsequent opens don't re-load.

**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'PickerBuilder')`.

### Pitfall 5: Sync on list page load races with the page render

**What goes wrong:** `shopping.js` calls `syncListWithDrive()` on load, which is async. The UI renders from the local IndexedDB snapshot immediately, then the sync returns and changes the list — but the DOM is not updated.

**Why it happens:** Current `shopping.js:load()` is async but the render is fire-and-forget. Adding Drive sync makes the latency longer and more variable.

**How to avoid:** After `syncListWithDrive()` resolves with `changed: true`, call `paintList(container)` again. The same pattern is used in `app.js:syncWithDrive()` for recipes (it calls `setRecipes()` → `emit()` → views re-render). For the list, the refresh must be triggered within `shopping.js` itself since the list state lives there.

### Pitfall 6: mergeList produces duplicates if item IDs are not stable

**What goes wrong:** If an item's `id` changes between two saves (e.g., generated from Date.now() on every save instead of once on item creation), `mergeList()` treats each version as a different item. Two users end up with duplicate entries for the same product.

**Why it happens:** IDs must be assigned once at creation time and never changed. The current `shopping.js` items have no `id` field at all — only `name`, `qty`, `done`, `cat`, `icon`, `amount`, `unit`.

**How to avoid:** Add `id` to each item at creation time in `shopAdd()`. Assign `"li-" + Date.now()` when the item is first added to ITEMS. Persist this id to IndexedDB immediately. Existing items in IndexedDB without an id need a migration step: assign ids on first load (a one-time patch in `listSync.js`'s `loadLocalList()`).

**Warning signs:** After two devices both add the same ingredient name, the merged list shows it twice.

---

## Code Examples

### Current item shape in ITEMS[] (shopping.js — no id field today)

```javascript
// Source: shopping.js line 56
ITEMS.push({ name, cat: cat || "Sonstiges", icon: icon || "🛒", qty: 1, done: false, amount: null, unit: null });
// Missing: id, updated, author, deleted
```

### Target item shape after this phase

```javascript
// Source: derived from Epic I2 spec in ROADMAP.md + CONTEXT.md
// On creation (shopAdd mutation):
ITEMS.push({
  id: "li-" + Date.now(),        // stable, assigned once
  name, cat, icon, qty: 1,
  done: false,
  amount: null, unit: null,
  updated: new Date().toISOString(),   // set on every mutation
  author: "local",                     // or user display name from Drive profile
  deleted: false,
});
// On check/uncheck and qty change: also update item.updated
```

### Drive file format (einkaufsliste.json)

```javascript
// Source: derived from ROADMAP.md item schema + rezepte.json pattern
{
  "version": 1,
  "updated": "2026-06-17T12:00:00.000Z",
  "items": [
    {
      "id": "li-1718600000000",
      "name": "Feta",
      "qty": 1,
      "amount": 200,
      "unit": "g",
      "cat": "Käse",
      "icon": "🧀",
      "done": false,
      "updated": "2026-06-17T12:00:00.000Z",
      "author": "marcel",
      "deleted": false
    }
  ]
}
```

### listMeta kv structure

```javascript
// Stored under kvKey "listMeta" in IndexedDB kv store
// Mirrors the "collection" meta key used for recipes
{
  fileId: "1ABCdef...",         // Drive file ID (null until first sync or Picker link)
  updated: "2026-06-17T...",   // last known `updated` from the Drive file
  dirty: false,                // local unpushed changes?
  lastSync: "2026-06-17T...", // when we last successfully synced
  source: "drive",            // "drive" | "local" | "linked"
  linked: false,              // true = partner linked their file via Picker
}
```

### Extending drive.createFile() for a second file name

```javascript
// Source: drive.js line 159 — current signature
export async function createFile(contentString) {
  const meta = { name: FILE_NAME, mimeType: "application/json" };
  // ...
}

// Target: add optional fileName param
export async function createFile(contentString, fileName = FILE_NAME) {
  const meta = { name: fileName, mimeType: "application/json" };
  // ...
}
```

### Google Picker init flow (minimal, matching existing GIS pattern)

```javascript
// Source: developers.google.com/drive/picker/guides/sample [CITED]
// This goes in a new helper or inline in shopping.js
function openPartnerPicker(onFilePicked) {
  // TOKEN is private in drive.js — need drive.getToken() getter (3 lines to add)
  const token = drive.getToken(); // new export needed
  if (!token) return; // not signed in
  gapi.load("picker", () => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes("application/json");
    const picker = new google.picker.PickerBuilder()
      .setAppId(GOOGLE_APP_ID)          // Cloud project number — new constant needed
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)  // new constant needed
      .addView(view)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const fileId = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID];
          onFilePicked(fileId);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
```

---

## Runtime State Inventory

Step 2.5 does not apply to this phase — it is a greenfield feature addition, not a rename or refactor. No runtime state is being renamed.

However, one migration concern exists:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | IndexedDB "lists" items have no `id` field today | One-time migration: assign `"li-" + Date.now() + index` on first load in `listSync.loadLocalList()` |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | Google Cloud API key (GOOGLE_API_KEY) not yet created | Setup task in Google Cloud Console; add to drive.js constants |
| Build artifacts | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test suite (`node v2/tests/run.js`) | Yes | (installed, tests pass) | — |
| Google APIs CDN | Picker API, Drive API | Yes (online) | current | App works offline without it; Picker requires online |
| Google Cloud Console access | API key for Picker | Yes (Marcel has access) | — | Cannot use Picker without API key; feature blocked |

**Missing dependencies with no fallback:**
- Google Cloud API key (GOOGLE_API_KEY): required for Picker; must be created in Google Cloud Console before plan 01-02 can be executed

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Custom runner (`v2/tests/runner.js`) — no external dependencies |
| Config file | None — `node v2/tests/run.js` |
| Quick run command | `node v2/tests/run.js` |
| Full suite command | `node v2/tests/run.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-I2 | `mergeList(local, remote)` — union + last-writer-per-item | unit | `node v2/tests/run.js` (via test-list-merge.js) | No — Wave 0 |
| REQ-I2 | Tombstone items (`deleted: true`) are excluded from render | unit | `node v2/tests/run.js` | No — Wave 0 |
| REQ-I2 | `mergeList` is idempotent: `mergeList(merged, merged) === merged` | unit | `node v2/tests/run.js` | No — Wave 0 |
| REQ-I2 | `mergeList` handles empty arrays | unit | `node v2/tests/run.js` | No — Wave 0 |
| REQ-I2 | Offline: save to IndexedDB + dirty flag set | unit (logic only) | `node v2/tests/run.js` | No — Wave 0 |
| REQ-I2 | SW SHELL includes new modules | guard | `node v2/tests/run.js` (test-sw-shell.js) | Yes |
| REQ-I3A | Author field present on items — multi-party merge still correct | unit | `node v2/tests/run.js` | No — Wave 0 |
| REQ-I3A | Two authors adding different items → both survive merge | unit | `node v2/tests/run.js` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `node v2/tests/run.js`
- **Per wave merge:** `node v2/tests/run.js`
- **Phase gate:** Full suite green + 166 baseline tests pass before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `v2/tests/test-list-merge.js` — covers REQ-I2 and REQ-I3A merge cases (minimum 6 cases, matching `test-decide-sync.js` depth)
- [ ] `v2/tests/run.js` — add `import "./test-list-merge.js";` line

*(Existing test infrastructure covers SW shell guard and all baseline functionality — no other gaps.)*

---

## Security Domain

`security_enforcement: true`, ASVS level 1.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes — Drive access requires Google OAuth | GIS token flow already in `drive.js` — no change |
| V3 Session Management | Partial — token stored in localStorage | Existing pattern, existing risk; no change in this phase |
| V4 Access Control | Yes — only signed-in users can sync | `drive.isSignedIn()` guard already in `sync.js`; replicate in `listSync.js` |
| V5 Input Validation | Yes — items from Drive must be sanitised before render | Use `esc()` from `ui/helpers.js` on all string fields rendered to DOM (already done in `shopping.js`) |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via Drive content | Tampering | `esc()` already used on item names in `shopping.js` — must ensure merged items from Drive are also escaped before render |
| Drive file corruption via concurrent writes | Tampering | Item-level merge + `decideSync()` — never blind-overwrite |
| Stale/expired OAuth token on sync | Elevation of Privilege | `drive.js` already clears token on 401 and surfaces an error |
| Picker phishing (wrong file picked) | Spoofing | Validate that picked file name is `einkaufsliste.json` in the Picker callback before storing the fileId |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Whole-file LWW for recipes | `decideSync()` pure function (K2) | 2026-06-14 | List sync can reuse this immediately |
| No list persistence | IndexedDB-only (current) | — | This phase adds Drive persistence |
| Shopping list no id field | Must add `id` on creation | This phase | One-time migration in `loadLocalList()` |

**Deprecated/outdated:**
- Nothing in this codebase is deprecated relative to this phase.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Local item shape in the Drive file uses `done` (not `checked`) to match IndexedDB and avoid a translation layer | Architecture Patterns, Pattern 4 | If `checked` is chosen, a translation step is needed in listSync.js on every read/write |
| A2 | `GOOGLE_API_KEY` and `GOOGLE_APP_ID` (project number) are not yet in the project and must be added as new constants in `drive.js` or `index.html` | Open Questions | If the Picker works without a developer key in this context (OAuth-only mode), no new constant needed |
| A3 | `drive.getToken()` needs to be added as a new export to expose the private `TOKEN` variable to the Picker flow | Code Examples | If the Picker is invoked from `drive.js` itself (instead of `shopping.js`), no export is needed |

---

## Open Questions

1. **Does the Picker require a developer key (GOOGLE_API_KEY) or can it run with OAuth token only?**
   - What we know: Official sample uses `setDeveloperKey(API_KEY)`; some sources say it's optional with OAuth
   - What's unclear: Whether omitting it causes errors in this app's specific Google Cloud project setup
   - Recommendation: Attempt without it first in 01-02; add the API key if the Picker throws errors. Document in the task.

2. **Where should the Picker be invoked — from `shopping.js` UI or from `drive.js`?**
   - What we know: Picker needs the OAuth token (private to drive.js); the UI trigger is in shopping.js
   - What's unclear: Whether to add a `drive.getToken()` export, or encapsulate the whole Picker flow in drive.js as `drive.openPickerForFile(callback)`
   - Recommendation: Encapsulate in `drive.js` as `openPickerForFile(mimeType, callback)` — keeps all Google API surface in one module, consistent with existing architecture.

3. **Should `listMeta.updated` track the Drive file's `updated` field or the last-pushed local timestamp?**
   - What we know: Recipe sync uses `collection.updated` from the Drive file as the comparison point
   - What's unclear: Whether a "push" should update `listMeta.updated` to the new timestamp or to the remote's timestamp
   - Recommendation: Follow recipe sync exactly — set `updated` to the new ISO string when pushing, set it to `remote.updated` when pulling.

---

## Sources

### Primary (HIGH confidence)
- Codebase — `v2/src/data/drive.js`, `v2/src/data/sync.js`, `v2/src/data/decideSync.js`, `v2/src/features/shopping/shopping.js`, `v2/src/data/db.js`, `v2/tests/test-decide-sync.js`, `v2/sw.js`, `v2/src/version.js`, `v2/src/store.js` — fully read
- `ROADMAP.md` §10 (Epic I) — item schema, merge model, Picker model decision
- `.planning/STATE.md` — locked decisions
- `.planning/ROADMAP.md` — phase goal and success criteria

### Secondary (MEDIUM confidence)
- [developers.google.com — Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — drive.file scope and Picker grant [CITED]
- [developers.google.com — Code sample for web apps](https://developers.google.com/drive/picker/guides/sample) — Picker callback and data structure [CITED]

### Tertiary (LOW confidence)
- gmass.co blog on Picker API — Picker callback data structure cross-check [ASSUMED as supplement to official docs]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all modules read from disk; no new dependencies
- Architecture: HIGH — derived directly from K2 seam (decideSync) and existing sync.js pattern
- Pitfalls: HIGH — items 1, 3, 4, 6 verified by reading actual code; item 2 (API key) verified by Picker docs
- Picker flow: MEDIUM — official docs confirm the pattern but exact API key requirement needs empirical test

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (Google Picker API is stable; Drive API v3 is not changing)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-I2 | Couples: two-way shared list via shared Drive file (`einkaufsliste.json`), item-level merge, refresh-to-sync | `listSync.js` pattern (Pattern 1), `mergeList()` (Pattern 2), `decideSync()` seam, Pitfalls 1/3/5/6 |
| REQ-I3A | Multi-party-ready from day one: author field on each item, union-merge works for 2+ authors | Item schema (Pattern 4), `mergeList()` by id not by author (Pattern 2), test cases for two-author merge |
</phase_requirements>
