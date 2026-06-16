<!-- refreshed: 2026-06-16 -->
# Architecture

**Analysis Date:** 2026-06-16

## System Overview

There are two parallel app implementations in this repository:

- **Root `index.html`** — v1 single-file PWA. All logic (auth, Drive I/O, state, UI) lives in one 1465-line HTML file. No build step, no modules.
- **`v2/`** — v2 multi-file PWA with ES modules, IndexedDB-first local storage, and a proper module boundary structure. This is the active development target (v2.7 as of K3).

```
┌────────────────────────────────────────────────────────────┐
│  Browser (PWA, installed from GitHub Pages)                 │
│                                                             │
│  v2/index.html → v2/src/app.js (ES module bootstrap)       │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ features/│  │ store.js │  │ router.js│  │  i18n.js  │  │
│  │ (views)  │←→│ (state)  │  │ (hash)   │  │ (4 langs) │  │
│  └──────────┘  └────┬─────┘  └──────────┘  └───────────┘  │
│                     │                                       │
│              ┌──────▼──────┐                               │
│              │  data/sync  │                               │
│              │  (IndexedDB │                               │
│              │   + Drive)  │                               │
│              └──────┬──────┘                               │
└─────────────────────┼──────────────────────────────────────┘
                      │ HTTPS (Drive API v3)
          ┌───────────▼───────────────────┐
          │  Google Drive: rezepte.json   │
          │  (single source of truth)     │
          └───────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Path |
|-----------|----------------|------|
| `v2/src/app.js` | Bootstrap: SW registration, local load, route setup, auth init | `v2/src/app.js` |
| `v2/src/store.js` | In-memory state, canonical German recipes, language overlay, emit | `v2/src/store.js` |
| `v2/src/router.js` | Hash-based SPA router (`#/cookbook`, `#/cook/:id`, etc.) | `v2/src/router.js` |
| `v2/src/i18n.js` | Translation keys for DE/EN/ES/DA; language persistence | `v2/src/i18n.js` |
| `v2/src/data/sync.js` | IndexedDB-first load + Drive background sync orchestration | `v2/src/data/sync.js` |
| `v2/src/data/decideSync.js` | Pure Last-Write-Wins decision function (no I/O) | `v2/src/data/decideSync.js` |
| `v2/src/data/db.js` | IndexedDB wrapper (stores: recipes, plans, lists, kv) | `v2/src/data/db.js` |
| `v2/src/data/drive.js` | Google Drive API v3 calls + GIS auth | `v2/src/data/drive.js` |
| `v2/src/data/schema.js` | Recipe schema, validation, ID factory, `withDefaults` | `v2/src/data/schema.js` |
| `v2/src/data/migrate.js` | Parses and migrates v1/v2/v3 JSON formats to current schema | `v2/src/data/migrate.js` |
| `v2/src/data/baseLang.js` | Language overlay logic: builds id→translation map | `v2/src/data/baseLang.js` |
| `v2/src/features/*` | Route-specific views (cookbook, cook, shopping, match, planner, etc.) | `v2/src/features/` |
| `v2/src/ui/sheet.js` | Reusable bottom-sheet overlay primitive | `v2/src/ui/sheet.js` |
| `v2/src/ui/helpers.js` | DOM helpers (`esc`, etc.) | `v2/src/ui/helpers.js` |
| `v2/sw.js` | Service worker: network-first for HTML shell, cache-first for static assets | `v2/sw.js` |
| `index.html` | v1 single-file app (kept for reference; not the active build) | `index.html` |

## Data Flow

### Boot sequence (v2)

1. `v2/src/app.js` boots — registers SW, calls `sync.loadLocal()`.
2. `sync.loadLocal()` reads `IndexedDB["recipes"]`. Empty DB: seeds from `v2/data/rezepte.snapshot.json` (bundled).
3. `setRecipes(recipes, meta)` writes to `store.state.recipes` and emits.
4. `applyLanguageOverlay(lang)` fetches the matching `rezepte.snapshot.<lang>.json` and overlays translated base recipe content (display only; does NOT write to DB or Drive).
5. Router starts — current hash determines which feature view mounts.
6. `drive.initAuth({ silent: true })` attempts a silent Google sign-in.
7. On auth success → `sync.syncWithDrive()` runs in background.

### Sync flow (Drive background sync)

1. `sync.syncWithDrive()` reads Drive for `rezepte.json` file ID.
2. `decideSync({ hasRemote, localUpdated, remoteUpdated, dirty, source })` returns one of: `"create"`, `"push"`, `"pull"`, `"conflict"`, `"noop"`.
3. Action is executed: create/push writes to Drive; pull replaces IndexedDB; conflict is preserved (no silent overwrite since K2).
4. On change: `setRecipes()` updates store → cookbook view re-renders.

### Mutation flow (user edits)

1. User action in a feature view calls `store.updateRecipe(id, fn)` or `store.addRecipe(recipe)`.
2. Mutation applies to `recipesDe` (canonical German copy) only.
3. `persist()` saves to IndexedDB immediately, then pushes to Drive asynchronously.
4. `recomputeView()` re-applies the language overlay and emits to listeners.

## Sync Strategy

**Model:** IndexedDB-first (offline instant), Drive as durable sync target.

**Conflict resolution (`v2/src/data/decideSync.js`):**
- Pure function — no I/O, fully testable.
- Input: `{ hasRemote, localUpdated, remoteUpdated, dirty, source }`.
- Outcomes:
  - `"create"` — no Drive file yet, upload local.
  - `"push"` — local `updated` timestamp is newer, push to Drive.
  - `"pull"` — remote is newer and local is clean, replace local.
  - `"conflict"` — local has unsaved edit AND remote is same age or newer → preserve local, do NOT overwrite. (Real resolution deferred to Epic I2.)
  - `"noop"` — timestamps match and source is already Drive.

**Canonicality guard:** Drive and IndexedDB always store the German (`de`) version of recipes. Language overlays are computed at render time from bundled snapshot files (`v2/data/rezepte.snapshot.<lang>.json`) and never persisted. This means Claude (via Drive) can always write German-only JSON and the app will translate on the fly.

**Offline state:** App shell cached by SW (network-first for `index.html`, cache-first for icons/manifest). Drive API calls are never cached — always live.

**v1 (`index.html`) sync model:** Simpler. On login, reads Drive directly into memory. On every save, pushes full JSON to Drive. No IndexedDB. No conflict resolution. No offline beyond the SW shell cache.

## State Management

**v2 state shape (`v2/src/store.js`):**
```js
state = {
  recipes: [],    // Display view — may be localized (German base + overlay)
  meta: null,     // { version, updated, fileId, dirty, lastSync, source }
  signedIn: false,
}

// Private (not on state object):
recipesDe = [];   // Canonical German recipes — source for persistence
langMap = Map();  // id → translated fields (empty = show German)
```

**Update pattern:**
- Views read `state.recipes` (localized display view).
- Mutations write to `recipesDe` via store actions (`updateRecipe`, `addRecipe`, etc.).
- `recomputeView()` rebuilds `state.recipes` from `recipesDe + langMap`.
- `emit()` notifies all registered listeners (`onState(fn)`).
- Only the cookbook list view re-renders on state change (see `app.js:80`). Detail/cook views manage their own lifecycle.

**v1 state shape (`index.html`):**
```js
let TOKEN = null, FILE_ID = null;
let DATA = { version: 3, updated: null, recipes: [] };
let query = "", activeCat = "Alle";
let appView = "recipes";
const imgCache = new Map(); // Drive fileId → Object-URL
let SHOP = [];  // Shopping list, localStorage only
```

## Language Architecture

- 4 UI languages: German (de), English (en), Spanish (es), Danish (da).
- UI strings: `v2/src/i18n.js` — key-value translation map.
- Recipe content: base recipes are German in DB/Drive. Non-German display uses bundled snapshot overlays.
- `localizeRecipes(recipesDe, langMap)` merges: for each recipe, if `langMap` has an entry, overwrite content fields (name, ingredients, steps, tips, category) with translated version.
- Sprachneutrale fields (favorite, rating, cookedCount, feedback) always come from the German object and survive language switches correctly.

## Key Design Decisions

1. **Single JSON file on Drive** — `rezepte.json` is the entire recipe collection. No per-recipe files. Simplest possible Drive integration; works with Claude's Drive connector without special tooling.
2. **Drive scope: `drive.file`** — app can only see files it created. Minimal permissions.
3. **IndexedDB-first (v2)** — app is usable offline immediately after first load. Drive sync runs in background. This is the primary architectural difference between v1 and v2.
4. **`decideSync()` is pure** — extracted as a zero-dependency function in K2. Enables unit testing of all conflict scenarios without mocking I/O. Reuse planned for shared shopping list sync in Epic I2.
5. **German canonical** — Drive and IndexedDB always store German. Language overlays are ephemeral (display-only). This keeps Claude's write path simple and prevents drift between Drive and in-app mutations.
6. **No framework** — Vanilla JS + DOM manipulation. Build step is `<script type="module">` only; no bundler. Files are directly editable.
7. **v1 retained** — root `index.html` is a working, simpler fallback. v2 lives in `v2/`. Both are deployed on GitHub Pages.

## Entry Points

**v2 app:**
- `v2/index.html` — loads `v2/src/app.js` as ES module entry point.
- `v2/sw.js` — service worker registered from `app.js`.

**v1 app:**
- `index.html` — self-contained; inline `<script>` is the entire app.
- `sw.js` (root) — v1 service worker.

## Error Handling

**Drive errors:** Caught in `sync.js` and `drive.js`. On 401 (token expired): clear token, attempt silent refresh, fall back to login button. Other errors surface as status messages (`.sync-line` element).

**Schema validation:** `validateRecipe()` in `v2/src/data/schema.js` runs before every `updateRecipe` persist. Throws with error list if fields are invalid.

**v1:** Drive errors are caught in `afterLogin()` — clears token and attempts silent re-auth. No per-operation error UI beyond `alert()` on save failure.

---

*Architecture analysis: 2026-06-16*
