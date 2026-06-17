# Phase 1: Shared Shopping List — Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 8 (2 new, 6 modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `v2/src/features/shopping/listMerge.js` | utility (pure) | transform | `v2/src/data/decideSync.js` | exact (pure function, no I/O) |
| `v2/src/data/listSync.js` | service | CRUD + Drive I/O | `v2/src/data/sync.js` | exact (same role + data flow) |
| `v2/src/features/shopping/shopping.js` | component | request-response | itself (modify) | — (add Drive wiring + Picker trigger) |
| `v2/src/data/drive.js` | service | file-I/O | itself (modify) | — (add fileName param + getToken export) |
| `v2/src/i18n.js` | config | transform | itself (modify) | — (add keys per existing section shape) |
| `v2/sw.js` | config | — | itself (modify) | — (add SHELL entries, bump CACHE) |
| `v2/src/version.js` | config | — | itself (modify) | — (bump BUILD) |
| `v2/tests/test-list-merge.js` | test | — | `v2/tests/test-decide-sync.js` | exact (same: pure function unit tests) |

---

## Pattern Assignments

### `v2/src/features/shopping/listMerge.js` (utility, transform)

**Analog:** `v2/src/data/decideSync.js`

**Pattern:** Pure function — no imports, no I/O, no side effects. Exported function is the entire file. Comment header explains purpose and reuse context. ESM export.

**File header pattern** (decideSync.js lines 1–20):
```javascript
// listMerge.js — Item-level last-writer-wins merge for einkaufsliste.json.
// Pure function — no I/O, no imports. Called by listSync.js on every pull/conflict.
// Merge rule: union of all items keyed by id; later `updated` ISO string wins.
// Deleted items carry deleted:true tombstone — included in merged output so deletion
// propagates to partners. shopping.js filters out deleted:true before render.
```

**Core export pattern** (decideSync.js lines 21–39 — full file is one exported function):
```javascript
export function mergeList(local = [], remote = []) {
  const byId = new Map();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing || item.updated > existing.updated) byId.set(item.id, item);
  }
  return [...byId.values()];
}
// Returns all items, including deleted:true tombstones.
// Caller (shopping.js) filters: items.filter(x => !x.deleted)
```

**No error handling needed** — pure transform over arrays; invalid input yields empty array.

---

### `v2/src/data/listSync.js` (service, CRUD + Drive I/O)

**Analog:** `v2/src/data/sync.js` — mirror this module exactly; replace `collection`/`META_KEY`/recipe-specific logic with list equivalents.

**Imports pattern** (sync.js lines 9–13):
```javascript
import * as db from "./db.js";
import * as drive from "./drive.js";
import { decideSync } from "./decideSync.js";
import { mergeList } from "../features/shopping/listMerge.js";

const META_KEY = "listMeta"; // { fileId, updated, dirty, lastSync, source, linked }
const LIST_FILE_NAME = "einkaufsliste.json";
const LIST_DB_ID = "current"; // IndexedDB "lists" store key
```

**Status listener pattern** (sync.js lines 40–45):
```javascript
let statusListeners = new Set();
let status = "";
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(msg) { status = msg; for (const fn of statusListeners) fn(msg); }
export function getStatus() { return status; }
```

**Core sync function** (sync.js lines 75–143 — adapt for list):
```javascript
export async function syncListWithDrive() {
  if (!drive.isSignedIn()) return { changed: false };
  setStatus("Verbinde mit Drive…");
  let meta = await db.kvGet(META_KEY, {});
  let fileId = meta.fileId;
  try {
    if (!fileId) {
      // First run: create einkaufsliste.json from current local items
      const items = await loadLocalList();
      const updated = new Date().toISOString();
      const content = JSON.stringify({ version: 1, updated, items });
      fileId = await drive.createFile(content, LIST_FILE_NAME); // fileName param added to drive.js
      meta = { ...meta, fileId, dirty: false, updated, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: false, meta };
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
      meta = { ...meta, fileId, dirty: false, updated, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      setStatus("Synchronisiert ✓");
      return { changed: false, meta };
    }

    if (action === "pull" || action === "conflict") {
      // Unlike recipes, conflict for lists is resolved by item-level merge (not preserved)
      const localItems = await loadLocalList();
      const merged = mergeList(localItems, remote.items || []);
      const updated = remote.updated || new Date().toISOString();
      await db.put("lists", { id: LIST_DB_ID, items: merged, updated });
      meta = { ...meta, fileId, updated, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
      await db.kvSet(META_KEY, meta);
      // Also push merged result back to Drive (so partner sees the union)
      await drive.updateFile(fileId, JSON.stringify({ version: 1, updated: new Date().toISOString(), items: merged }));
      setStatus("Synchronisiert ✓");
      return { changed: true, items: merged, meta };
    }

    // noop
    meta = { ...meta, fileId, lastSync: new Date().toISOString() };
    await db.kvSet(META_KEY, meta);
    setStatus("Synchronisiert ✓");
    return { changed: false, meta };
  } catch (e) {
    console.warn("Listen-Sync fehlgeschlagen:", e);
    setStatus(e.status === 401 ? "Anmeldung abgelaufen" : "Offline — lokale Daten");
    return { changed: false, error: e };
  }
}
```

**Save (dirty-flag) pattern** (sync.js lines 149–174 — adapt for list):
```javascript
export async function saveList(items) {
  const updated = new Date().toISOString();
  await db.put("lists", { id: LIST_DB_ID, items, updated });
  let meta = await db.kvGet(META_KEY, {});
  meta = { ...meta, updated, dirty: true };
  await db.kvSet(META_KEY, meta);

  if (drive.isSignedIn() && navigator.onLine !== false) {
    try {
      const fileId = meta.fileId;
      if (fileId) {
        await drive.updateFile(fileId, JSON.stringify({ version: 1, updated, items }));
        meta = { ...meta, dirty: false, lastSync: new Date().toISOString(), source: "drive" };
        await db.kvSet(META_KEY, meta);
      }
    } catch (e) {
      console.warn("Drive-Push fehlgeschlagen (bleibt dirty):", e);
    }
  }
  return meta;
}
```

**loadLocalList helper** (new — no sync.js analog, but follows db.js pattern):
```javascript
async function loadLocalList() {
  const row = await db.get("lists", LIST_DB_ID);
  let items = row && Array.isArray(row.items) ? row.items : [];
  // One-time migration: assign stable ids to items that lack them
  let migrated = false;
  items = items.map((it, i) => {
    if (!it.id) { migrated = true; return { ...it, id: "li-" + (Date.now() + i), updated: new Date().toISOString(), author: "local", deleted: false }; }
    return it;
  });
  if (migrated) await db.put("lists", { id: LIST_DB_ID, items, updated: new Date().toISOString() });
  return items;
}
```

---

### `v2/src/features/shopping/shopping.js` (component — MODIFY)

**Analog:** itself; pattern for adding Drive wiring is `v2/src/app.js` (syncWithDrive call after auth).

**New import to add** (after existing imports at lines 1–10):
```javascript
import * as listSync from "../../data/listSync.js";
```

**Item creation — add id/updated/author/deleted fields** (existing shopAdd, line 56):
```javascript
// BEFORE:
ITEMS.push({ name, cat: cat || "Sonstiges", icon: icon || "🛒", qty: 1, done: false, amount: null, unit: null });

// AFTER:
ITEMS.push({
  id: "li-" + Date.now(),
  name, cat: cat || "Sonstiges", icon: icon || "🛒",
  qty: 1, done: false, amount: null, unit: null,
  updated: new Date().toISOString(),
  author: "local",
  deleted: false,
});
```

**Mutation stamp pattern — add `updated` on every mutation** (apply to check/uncheck, qty inc/dec):
```javascript
// Example: check/uncheck in paintList event handler (line 166)
it.done = !it.done;
it.updated = new Date().toISOString(); // ADD THIS
save();
```

**save() — wire listSync** (lines 27–28):
```javascript
// BEFORE:
function save() {
  db.put("lists", { id: LIST_ID, items: ITEMS, updated: new Date().toISOString() }).catch(() => {});
}

// AFTER:
function save() {
  db.put("lists", { id: LIST_ID, items: ITEMS, updated: new Date().toISOString() }).catch(() => {});
  listSync.saveList(ITEMS).catch(() => {}); // Drive push (dirty-flag pattern)
}
```

**load() — sync on page load + re-paint if changed** (lines 21–25):
```javascript
async function load() {
  const row = await db.get("lists", LIST_ID);
  ITEMS = row && Array.isArray(row.items) ? row.items : [];
  sortMode = await db.kvGet(SORT_KEY, "aisle");
  // Drive sync in background — re-paint if remote had newer items
  listSync.syncListWithDrive().then((result) => {
    if (result.changed && result.items) {
      ITEMS = result.items.filter(x => !x.deleted); // filter tombstones before render
      paintList(container); // container captured by closure — see renderShopping
      paintCatalog(container);
    }
  }).catch(() => {});
}
```

**Render — add refresh button + Picker button** (renderShopping, lines 68–103):
```javascript
// Add to the `extra:` block in appHeader:
<button class="sl-refresh" aria-label="${t('shopping.refresh')}">${t('shopping.refreshBtn')}</button>
<button class="sl-link-partner">${t('shopping.linkPartner')}</button>
```

**Wire refresh button** (after wireHeader call, following same onclick pattern used in lines 99–100):
```javascript
const refreshBtn = container.querySelector(".sl-refresh");
if (refreshBtn) refreshBtn.onclick = () => {
  refreshBtn.disabled = true;
  listSync.syncListWithDrive().then((result) => {
    if (result.changed && result.items) {
      ITEMS = result.items.filter(x => !x.deleted);
      paintList(container); paintCatalog(container);
    }
    refreshBtn.disabled = false;
  }).catch(() => { refreshBtn.disabled = false; });
};
```

**Wire Picker button** (after refresh button wiring):
```javascript
const linkBtn = container.querySelector(".sl-link-partner");
if (linkBtn) linkBtn.onclick = () => {
  drive.openPickerForFile("application/json", async (fileId) => {
    let meta = await db.kvGet("listMeta", {});
    await db.kvSet("listMeta", { ...meta, fileId, linked: true, source: "linked" });
    listSync.syncListWithDrive().then((result) => {
      if (result.changed && result.items) {
        ITEMS = result.items.filter(x => !x.deleted);
        paintList(container); paintCatalog(container);
      }
    }).catch(() => {});
  });
};
```

**Tombstone filter in paintList** (line 108 — add filter before render):
```javascript
// BEFORE:
const doneCount = ITEMS.filter((x) => x.done).length;

// AFTER — filter tombstones first so deleted items never reach the DOM:
const visible = ITEMS.filter(x => !x.deleted);
const doneCount = visible.filter((x) => x.done).length;
// Then replace ITEMS references in paintList's render with `visible`
```

---

### `v2/src/data/drive.js` (service — MODIFY)

**Analog:** itself. Two targeted changes only.

**Change 1 — createFile fileName param** (line 159):
```javascript
// BEFORE:
export async function createFile(contentString) {
  const meta = { name: FILE_NAME, mimeType: "application/json" };

// AFTER:
export async function createFile(contentString, fileName = FILE_NAME) {
  const meta = { name: fileName, mimeType: "application/json" };
```

**Change 2 — add openPickerForFile export** (new function, append at end of file):
```javascript
// Picker: load gapi picker library and open a file chooser.
// Caller passes mimeType filter and receives the picked fileId.
// All Google API surface stays in drive.js (no TOKEN leaking out).
let pickerLoaded = null;
export function openPickerForFile(mimeType, onFilePicked) {
  if (!TOKEN) return; // not signed in
  if (!pickerLoaded) {
    pickerLoaded = new Promise((resolve) => gapi.load("picker", resolve));
  }
  pickerLoaded.then(() => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes(mimeType);
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(TOKEN)
      // .setDeveloperKey(GOOGLE_API_KEY)  // uncomment if Picker requires API key
      // .setAppId(GOOGLE_APP_ID)          // uncomment if needed
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

**Note:** `gapi` is already loaded via CDN in index.html. `TOKEN` is module-private — Picker is kept in drive.js to avoid needing a `getToken()` export. If Picker throws `"developer key invalid"`, add `GOOGLE_API_KEY` constant (see Research Pitfall 2).

---

### `v2/src/i18n.js` (config — MODIFY)

**Pattern:** Add new keys inside the existing `shopping:` object in each of the 4 language blocks (de, en, es, da). Follow exact same inline style — comma-separated keys on same or adjacent lines. No structural changes to the file.

**Rule from file header (line 6):** Never use straight `"` inside values — use curly quotes or escaped `\"`.

**Keys to add in each language block** (inside `shopping: { ... }` — example for `de`):
```javascript
// Add after line 195 (share: "📤 Teilen", ...):
refreshBtn: "🔄 Aktualisieren", refresh: "Einkaufsliste aktualisieren",
linkPartner: "Partner verknüpfen", unlinkPartner: "Partner trennen",
syncStatus: "Synchronisiert ✓", syncPending: "Sync ausstehend",
pickerPrompt: "Wähle die geteilte Einkaufsliste aus Google Drive",
```

**EN equivalents:**
```javascript
refreshBtn: "🔄 Refresh", refresh: "Refresh shopping list",
linkPartner: "Link partner", unlinkPartner: "Unlink partner",
syncStatus: "Synced ✓", syncPending: "Sync pending",
pickerPrompt: "Pick the shared shopping list from Google Drive",
```

**ES equivalents:**
```javascript
refreshBtn: "🔄 Actualizar", refresh: "Actualizar lista de compra",
linkPartner: "Vincular pareja", unlinkPartner: "Desvincular pareja",
syncStatus: "Sincronizado ✓", syncPending: "Sincronización pendiente",
pickerPrompt: "Elige la lista de compra compartida de Google Drive",
```

**DA equivalents:**
```javascript
refreshBtn: "🔄 Opdater", refresh: "Opdater indkøbsliste",
linkPartner: "Tilknyt partner", unlinkPartner: "Fjern partner",
syncStatus: "Synkroniseret ✓", syncPending: "Synkronisering afventer",
pickerPrompt: "Vælg den delte indkøbsliste fra Google Drive",
```

---

### `v2/sw.js` (config — MODIFY)

**Pattern:** Add new module paths to the `SHELL` array (lines 11–67) and bump the `CACHE` constant (line 9). New entries go after existing shopping entries (lines 43–44).

**CACHE bump** (line 9):
```javascript
// BEFORE:
const CACHE = "koch-v2.9-1";
// AFTER:
const CACHE = "koch-v2.10-1";
```

**SHELL entries to add** (after `"./src/features/shopping/shopping.js"` on line 44):
```javascript
"./src/features/shopping/listMerge.js",
"./src/data/listSync.js",
```

**Guard test context:** `v2/tests/test-sw-shell.js` already exists and verifies that all `src/` module files are listed in SHELL. If new `.js` files are created but not added here, that test will fail.

---

### `v2/src/version.js` (config — MODIFY)

**Pattern** (lines 2–3):
```javascript
// BEFORE:
export const BUILD = "2026-06-17-v2.9";
export const APP_VERSION = "2.9";

// AFTER:
export const BUILD = "2026-06-17-v2.10";
export const APP_VERSION = "2.10";
```

Add a CHANGELOG entry (newest first, line 6 — following existing entries):
```javascript
{ v: "v2.10", txt: "Einkaufsliste mit Partner teilen: Verbinde deine Liste über Google Drive — beide sehen dieselben Artikel und können gleichzeitig hinzufügen. Aktualisieren-Knopf holt den neuesten Stand." },
```

---

### `v2/tests/test-list-merge.js` (test)

**Analog:** `v2/tests/test-decide-sync.js` — exact structure. Import runner + the pure function; write named test cases covering all documented behaviors.

**Imports pattern** (test-decide-sync.js lines 6–8):
```javascript
import { test, assertEqual } from "./runner.js";
import { mergeList } from "../src/features/shopping/listMerge.js";
```

**Test case structure** (test-decide-sync.js lines 10–50 — one test() call per behavior):
```javascript
// Minimum 6 cases matching research REQ-I2 + REQ-I3A:

// 1. Empty arrays
test("mergeList: beide leer → leeres Array", () => {
  assertEqual(JSON.stringify(mergeList([], [])), "[]");
});

// 2. Remote wins (newer updated)
test("mergeList: remote item neuer → remote gewinnt", () => {
  const local  = [{ id: "li-1", name: "Feta", updated: "2026-06-17T10:00:00.000Z" }];
  const remote = [{ id: "li-1", name: "Feta XL", updated: "2026-06-17T11:00:00.000Z" }];
  const merged = mergeList(local, remote);
  assertEqual(merged[0].name, "Feta XL");
});

// 3. Local wins (newer updated)
test("mergeList: lokales item neuer → lokal gewinnt", () => {
  const local  = [{ id: "li-1", name: "Milch", updated: "2026-06-17T12:00:00.000Z" }];
  const remote = [{ id: "li-1", name: "Milch alt", updated: "2026-06-17T09:00:00.000Z" }];
  const merged = mergeList(local, remote);
  assertEqual(merged[0].name, "Milch");
});

// 4. Tombstone propagation
test("mergeList: deleted:true tombstone bleibt erhalten (propagiert Löschung)", () => {
  const local  = [{ id: "li-1", name: "Ei", deleted: false, updated: "T1" }];
  const remote = [{ id: "li-1", name: "Ei", deleted: true,  updated: "T2" }];
  const merged = mergeList(local, remote);
  assertEqual(merged[0].deleted, true);
});

// 5. Two authors adding different items — both survive
test("mergeList: zwei Autoren fügen verschiedene Artikel hinzu → beide bleiben", () => {
  const local  = [{ id: "li-1", name: "Käse",  author: "marcel", updated: "T1" }];
  const remote = [{ id: "li-2", name: "Wasser", author: "partner", updated: "T1" }];
  const merged = mergeList(local, remote);
  assertEqual(merged.length, 2);
});

// 6. Idempotent: mergeList(merged, merged) equals merged
test("mergeList: idempotent — mergeList(merged, merged) ist stabil", () => {
  const items  = [{ id: "li-1", name: "Tomate", updated: "T1" }];
  const merged = mergeList(items, items);
  assertEqual(merged.length, 1);
  assertEqual(merged[0].id, "li-1");
});
```

**Registration:** After writing the test file, add `import "./test-list-merge.js";` to `v2/tests/run.js`, following the exact pattern of the other test imports already in that file.

---

## Shared Patterns

### isSignedIn guard
**Source:** `v2/src/data/sync.js` line 76
**Apply to:** `listSync.syncListWithDrive()` — first line of every Drive-touching function
```javascript
if (!drive.isSignedIn()) return { changed: false };
```

### dirty-flag offline queue
**Source:** `v2/src/data/sync.js` lines 149–174 (`saveCollection`)
**Apply to:** `listSync.saveList()` — same pattern: write IndexedDB immediately, attempt Drive push, set dirty=true on failure, catch and log without throwing
```javascript
if (drive.isSignedIn() && navigator.onLine !== false) {
  try { /* Drive push */ } catch (e) { console.warn("Drive-Push fehlgeschlagen (bleibt dirty):", e); }
}
```

### XSS: esc() on all string fields rendered to DOM
**Source:** `v2/src/ui/helpers.js` (already used throughout shopping.js)
**Apply to:** Any merged remote items rendered to DOM in shopping.js — `esc(item.name)`, `esc(item.cat)`, etc. The existing `rowHTML` function in shopping.js already calls `esc(itemLabel(it))` — ensure merged items flow through the same path, not a separate render branch.

### driveFetch 401 propagation
**Source:** `v2/src/data/drive.js` lines 118–120
**Apply to:** listSync.js — catch block must check `e.status === 401` and surface "Anmeldung abgelaufen" status (same as sync.js line 141)
```javascript
setStatus(e.status === 401 ? "Anmeldung abgelaufen" : "Offline — lokale Daten");
```

### kvGet/kvSet meta pattern
**Source:** `v2/src/data/sync.js` line 79 (`db.kvGet(META_KEY, {})`)
**Apply to:** All `listMeta` reads in listSync.js — always use `{}` as default, spread to update: `{ ...meta, fieldName: value }`

---

## No Analog Found

All files have close analogs. No entries needed here.

---

## Metadata

**Analog search scope:** `v2/src/data/`, `v2/src/features/shopping/`, `v2/tests/`, `v2/sw.js`, `v2/src/version.js`, `v2/src/i18n.js`
**Files read:** 9 source files + 1 research file
**Pattern extraction date:** 2026-06-17
