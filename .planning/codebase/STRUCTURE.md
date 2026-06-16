<!-- refreshed: 2026-06-16 -->
# Project Structure

**Analysis Date:** 2026-06-16

## Directory Layout

```
Koch_Project/
├── index.html              # v1 single-file PWA (1465 lines, self-contained)
├── sw.js                   # v1 service worker (cache kochbuch-v9)
├── manifest.json           # PWA manifest for v1
├── icon-192.png            # App icon
├── icon-512.png            # App icon (large)
├── rezepte.json            # Local/dev copy of Drive data (not the source of truth)
├── rezepte.seed.json       # Seed data (initial recipe for first-time Drive setup)
├── SCHEMA.md               # JSON schema contract (for Claude Drive writes)
├── ROADMAP.md              # Feature roadmap with epics
├── CLAUDE.md               # Claude Code project context and instructions
├── README.md               # User-facing setup/usage guide
├── SETUP-GOOGLE.md         # OAuth setup walkthrough
├── 00_OVERVIEW.md          # Architecture overview (pre-v2)
├── 01_ARCHITECTURE.md      # Architecture doc (pre-v2, may be outdated)
├── 02_DATA_SCHEMA.md       # Data schema (pre-v2)
├── 03_FEATURES.md          # Feature list (pre-v2)
├── 04_BUILD_PLAN.md        # Build plan (pre-v2)
├── qa/                     # QA agent definitions and test tooling
│   └── ...
└── v2/                     # Active v2 development (ES modules, IndexedDB-first)
    ├── index.html          # v2 app shell (loads src/app.js as module)
    ├── sw.js               # v2 service worker
    ├── manifest.webmanifest# v2 PWA manifest
    ├── icon-192.png        # v2 icons
    ├── icon-512.png
    ├── README.md           # v2-specific notes
    ├── src/                # Application source
    │   ├── app.js          # Bootstrap entry point
    │   ├── store.js        # In-memory state + mutations
    │   ├── router.js       # Hash-based SPA router
    │   ├── i18n.js         # Translation strings (DE/EN/ES/DA)
    │   ├── flags.js        # Feature flags
    │   ├── version.js      # BUILD constant
    │   ├── data/           # Data layer (I/O, schema, sync logic)
    │   │   ├── sync.js     # Load/sync orchestration (IndexedDB ↔ Drive)
    │   │   ├── decideSync.js  # Pure LWW conflict decision function
    │   │   ├── db.js       # IndexedDB wrapper
    │   │   ├── drive.js    # Google Drive API v3 + GIS auth
    │   │   ├── schema.js   # Recipe schema, validation, ID factory
    │   │   ├── migrate.js  # v1→v2→v3 migration parser
    │   │   ├── baseLang.js # Language overlay logic
    │   │   ├── lager.js    # Pantry (Vorrat/Lager) data layer
    │   │   └── settings.js # App settings persistence
    │   ├── features/       # Route views (one dir per route)
    │   │   ├── cookbook/   # Main recipe list view
    │   │   ├── cooking/    # Cook mode (step-by-step, timers, wake lock)
    │   │   ├── match/      # Swipe-to-discover (Koch-Match)
    │   │   ├── shopping/   # Shopping list view
    │   │   ├── planner/    # Meal planner (week view)
    │   │   ├── assistant/  # AI assistant integration
    │   │   ├── capture/    # Recipe capture (photo/URL import)
    │   │   ├── lager/      # Pantry management view
    │   │   ├── guide/      # Onboarding guide
    │   │   ├── settings/   # App settings view
    │   │   └── onboarding/ # Language selection modal
    │   ├── ui/             # Shared UI primitives
    │   │   ├── sheet.js    # Bottom sheet overlay (shared across features)
    │   │   └── helpers.js  # DOM helpers (esc, $, etc.)
    │   └── ai/             # AI integration
    │       ├── client.js   # API client
    │       ├── gate.js     # Rate limiting / availability gate
    │       ├── parse.js    # Recipe parsing from AI response
    │       └── prompts.js  # Prompt templates
    ├── data/               # Bundled static data (served with app)
    │   ├── rezepte.snapshot.json      # German recipe snapshot (seed + offline)
    │   ├── rezepte.snapshot.en.json   # English overlay snapshot
    │   ├── rezepte.snapshot.es.json   # Spanish overlay snapshot
    │   └── rezepte.snapshot.da.json   # Danish overlay snapshot
    ├── tools/              # Dev/build tooling
    └── tests/              # Test suite (node-based, no browser required)
        ├── run.js          # Test runner entry point
        ├── runner.js       # Test harness
        ├── test-decide-sync.js  # decideSync() unit tests
        ├── test-schema.js       # Schema validation tests
        ├── test-migrate.js      # Migration tests
        ├── test-filter.js       # Filter/search tests
        ├── test-shopping.js     # Shopping list tests
        ├── test-i18n.js         # i18n key parity tests
        ├── test-lager.js        # Pantry tests
        ├── test-planner.js      # Meal planner tests
        ├── test-derive.js       # Derived state tests
        ├── test-capture.js      # Recipe capture tests
        ├── test-baselang.js     # Language overlay tests
        ├── test-canonical.js    # Drive canonicality guard tests (K4b)
        ├── test-ai.js           # AI integration tests
        └── test-sw-shell.js     # Service worker shell tests
```

## Key Files

**Active app entry points:**
- `v2/index.html` — v2 PWA shell; loads `src/app.js` as `type="module"`.
- `v2/src/app.js` — boot sequence: SW, local load, routes, auth.
- `v2/sw.js` — v2 service worker (cache name changes with version bumps).

**Data contracts:**
- `SCHEMA.md` — JSON schema for `rezepte.json`. Both the PWA and Claude's Drive writes must comply.
- `v2/src/data/schema.js` — runtime schema enforcement (`validateRecipe`, `withDefaults`).
- `v2/data/rezepte.snapshot.json` — canonical German baseline; bundled with app for first-load seed.

**Core logic:**
- `v2/src/data/decideSync.js` — single exported function `decideSync(opts)`. Pure, no imports.
- `v2/src/store.js` — all state mutations go through here.
- `v2/src/router.js` — all navigation goes through `router.navigate(path)`.

**Tests:**
- `v2/tests/run.js` — entry: `node v2/tests/run.js`
- 145 tests as of K4b. Tests run in Node (no browser, no DOM).

## Module Organization (within v2)

The v2 codebase follows a layered ES module structure:

```
app.js (bootstrap)
  → router.js (navigation)
  → store.js (state)
      → data/sync.js (I/O orchestration)
          → data/db.js (IndexedDB)
          → data/drive.js (Drive API)
          → data/decideSync.js (pure logic)
          → data/migrate.js (parsing)
  → features/* (views — read store, call store actions)
  → ui/* (shared DOM primitives)
  → i18n.js (translation strings)
```

**Dependency rules:**
- `features/*` import from `store.js`, `i18n.js`, `ui/*`, `router.js`. Never import from other features.
- `data/*` modules only import from other `data/*` modules. No UI imports.
- `decideSync.js` has zero imports — intentionally pure.
- `store.js` imports from `data/*` but not from `features/*`.

## Naming Conventions

**Files:**
- `camelCase.js` for all JS modules.
- Feature directories use `kebab-case` (e.g., `features/cooking/`, `features/match/`).
- Test files: `test-<subject>.js` (e.g., `test-decide-sync.js`).
- Snapshot data files: `rezepte.snapshot.<lang>.json`.

**Functions:**
- Render functions: `render<Feature>(container)` pattern (e.g., `renderCookbook`, `renderShopping`).
- Data actions: verb + noun (e.g., `updateRecipe`, `addRecipe`, `loadLocal`, `syncWithDrive`).
- Event handlers: inline arrow functions in render functions.

**CSS classes (v1 `index.html`):**
- Single-word or hyphenated utility classes (`.sheet`, `.card`, `.icon-btn`, `.cook-step`).
- BEM not used — flat class names.

**IDs:**
- Recipe IDs: `"r" + Date.now()` (e.g., `r01`, `r1749123456789`).

## Where to Add New Code

**New feature/route (v2):**
- Create `v2/src/features/<feature-name>/<feature-name>.js`.
- Export `render<FeatureName>(container)` — optionally return a cleanup function.
- Register route in `v2/src/app.js`: `router.register("path", () => mount("name", render<FeatureName>))`.

**New store action:**
- Add to `v2/src/store.js`. Must operate on `recipesDe`, call `persist()`, call `recomputeView()` + `emit()`.

**New data layer utility:**
- Add to `v2/src/data/`. Keep pure logic (no I/O) in its own file for testability.

**New tests:**
- Add `v2/tests/test-<subject>.js`. Import the module under test directly. Register with the runner in `v2/tests/run.js`.

**New UI primitive:**
- Add to `v2/src/ui/`. Keep stateless where possible.

**Modifying the recipe schema:**
- Update `v2/src/data/schema.js` (validation + `withDefaults`).
- Update `SCHEMA.md` (Claude's Drive write contract).
- Update `v2/src/data/migrate.js` if old records need backfilling.
- Add a test in `v2/tests/test-schema.js`.

## Special Directories

**`v2/data/`:**
- Purpose: Bundled static JSON — recipe snapshots for seed and offline language overlays.
- Generated: Snapshot files may be regenerated by tooling in `v2/tools/`.
- Committed: Yes — required for offline-first boot.

**`v2/tests/`:**
- Purpose: Node-based test suite (no browser).
- Run: `node v2/tests/run.js`
- Committed: Yes.

**`qa/`:**
- Purpose: QA agent definitions (`.claude/agents/` fleet) for automated review passes.
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: Codebase map documents consumed by GSD planning commands.
- Committed: Yes (planning artifacts).

---

*Structure analysis: 2026-06-16*
