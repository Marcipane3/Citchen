# Testing

**Analysis Date:** 2026-06-16

## Test Runner & Setup

**Runner:** Custom zero-dependency mini-framework in `v2/tests/runner.js`. No npm packages required.

**Node requirement:** Node ≥ 18 (uses native ESM `import`, `node:fs`, `node:path`).

**Run command:**
```bash
node v2/tests/run.js
```

**Output format:** `✓ test name` / `✗ test name` per test, summary line at end: `N bestanden, N fehlgeschlagen, N gesamt`. Exit code 1 on any failure.

**Entry point:** `v2/tests/run.js` — imports all test files in order, then calls `run()` from `runner.js`.

**Assertion API (from `v2/tests/runner.js`):**
- `assert(cond, msg)` — truthy check
- `assertEqual(actual, expected, msg)` — strict equality with diff output
- `assertDeepEqual(actual, expected, msg)` — JSON-serialized deep comparison
- `test.only(name, fn)` — focus mode: only `.only` tests run when any exist

**Async support:** `runner.run()` is async; individual test functions may be `async`.

**No mocking framework.** Pure unit tests only. Drive API, IndexedDB, and DOM are not tested.

## Test Categories

### Schema & Validation — `test-schema.js` (9 tests)
Tests `v2/src/data/schema.js`. Covers:
- `CATEGORIES` array: exact 16 entries, exact strings matching `SCHEMA.md`
- `validateRecipe`: minimal valid recipe, full v3 recipe, invalid category, missing name, invalid `rating` (> 5), wrong type for `ingredients`, invalid `effort` value
- `validateCollection`: duplicate ID detection
- `makeIdFactory`: `"r" + timestamp` format, batch uniqueness, collision avoidance
- `withDefaults`: fills the 6 v1 fields, does not mutate input, does not overwrite existing values

### Migration & Round-Trip — `test-migrate.js` (10 tests)
Tests `v2/src/data/migrate.js` against the real snapshot (`v2/data/rezepte.snapshot.json`, 105 recipes). Covers:
- Real file: 105 recipes, version 3, validates clean
- `loadCollection`: loads all 105 without validation errors
- Lossless migration: every original field survives with identical value
- No unauthorized new fields added (only the 6 allowed defaults)
- `feedback` field survives migration untouched
- Round-trip idempotency: `serialize(load(x))` re-loaded = identical
- UTF-8 / Umlaut / emoji preservation (`Süßkartoffel-Curry`, `Käsespätzle`, `🛒`)
- `toFileString` with `setUpdated: true` stamps current ISO time
- **G1 scenario:** External Claude edit of an existing recipe — app loads the edited file losslessly, app-owned fields (`photos`, `rating`, `favorite`, `cookedCount`) are untouched, `feedback` cleared, new Drive timestamp carries through LWW logic
- **G1 append:** Claude appends a new recipe — unique ID, validates, defaults added, existing recipes intact
- Broken input → empty collection with errors, no crash

### Filter & Search — `test-filter.js` (16 tests)
Tests `v2/src/features/cookbook/filter.js` and `v2/src/features/cookbook/export.js` against the real snapshot. Covers:
- Name search (case-insensitive)
- Ingredient search (finds recipes without matching name)
- Empty query returns all
- Chip list structure: `Alle`, `__fav`, `__alltag`, `__besonders`, `__mealprep`, `__totry`, `__quick`
- Chips absent when data doesn't support them
- `chipLabel` abbreviations (matching v1 display)
- Filter by `effort`: `alltag`/`besonders` disjoint and complete
- Filter by `mealPrep`, `toTry`, `__quick` (totalTime ≤ 30)
- Filter by exact category
- Combined filter: chip + query + cuisine
- Season filter
- `distinctValues`: alphabetical, no empty strings
- `isSpecialChip` discrimination
- Multi-category ODER within facette
- Facette UND (category AND quick)
- Mode `"or"` union across facettes (set algebra verified)
- Multi-cuisine OR
- Query always AND even in OR mode
- `activeFilterCount` counting
- `exportMarkdown`: structure matches v1 (category order, field labels, star rating in title), empty categories omitted

### Sync Decision Logic — `test-decide-sync.js` (9 tests)
Tests `v2/src/data/decideSync.js` — pure function, no I/O. Covers all branches of Last-Write-Wins:
- No remote → `"create"`
- Clean local, remote newer → `"pull"`
- Clean, equal timestamps but source is snapshot (not drive) → `"pull"` (first load)
- Clean, equal timestamps, source is drive → `"noop"`
- Dirty, local newer → `"push"`
- Dirty, remote newer → `"conflict"` (guards against the silent-overwrite bug from `qa/findings/bug-hunter.md`)
- Dirty, equal timestamps → `"conflict"`
- Dirty with empty timestamps → `"conflict"` (safe fallback)
- Empty/missing args → `"create"` (safe default)

### Canonicality Guard — `test-canonical.js` (3 tests)
Guards the German-only persistence invariant (K4b). Covers:
- `localizeRecipes` does not mutate the canonical German array
- `toFileString` serializes the German collection, not the localized view (content assertions on Drive output)
- **Source-code watcher:** reads `v2/src/store.js` via `fs.readFileSync` and asserts every `saveCollection()` call passes `recipesDe`, never `state.recipes`

### i18n — `test-i18n.js` (8 tests)
Tests `v2/src/i18n.js`. Covers:
- Default language is `"de"`
- Sample keys resolve in DE/EN/ES (no key-echo)
- Full key parity: all languages have exactly the DE key set (no missing, no extra)
- `tCat`: DE passthrough, EN/DA translation, unknown category passthrough (no crash)
- All 16 categories translated in EN/ES/DA
- `t()` interpolation (`{n}` placeholder)
- `tn()` singular/plural
- Fallback on missing key (key echo)
- `setLang` ignores unknown codes

### Base Language Overlay — `test-baselang.js`
Tests `v2/src/data/baseLang.js`. Covers:
- `overlayTranslation`: overlays exactly 4 fields (`name`, `ingredients`, `steps`, `tips`), leaves all other fields untouched, does not mutate input
- `🛒` marker count preserved through overlay
- `buildLangMap` / `localizeRecipes` batch overlay
- `checkTranslation` validation

### Pantry / Shopping — `test-shopping.js`
Tests `v2/src/features/shopping/logic.js` and `v2/src/features/shopping/catalog.js`. Covers:
- `needsBuying` with `🛒`-marked ingredients
- `needsBuying` fallback (no markers) using pantry/staples list
- Custom staples list override
- `ingMatchCat` catalog assignment for real ingredient strings
- Aggregation, quantity summing, merge behavior

### AI Capture — `test-capture.js`, `test-ai.js`
Tests parsing/capture logic and AI gate. Covers structured recipe parsing and AI interaction guards.

### Pantry Stock (Lager) — `test-lager.js`
Tests `v2/src/data/lager.js`. Covers pantry stock logic.

### Derived Fields — `test-derive.js`
Tests `v2/src/data/derive.js`. Covers in-memory computed fields (tags, tip parsing, quantity extraction).

### Meal Planner — `test-planner.js`
Tests `v2/src/features/planner/logic.js`. Covers weekly plan generation and logic.

### Service Worker Shell — `test-sw-shell.js`
Tests service worker shell logic (offline caching, route handling).

## Coverage Summary

| Area | Tested | Notes |
|------|--------|-------|
| Schema validation | Yes | Full — all field types, edge cases |
| Migration / lossless round-trip | Yes | Against real 105-recipe snapshot |
| External Claude edit (G1) | Yes | Explicit scenario in `test-migrate.js` |
| Sync decision (LWW) | Yes | All 9 branches including conflict guard |
| Canonicality (German-only persistence) | Yes | Includes source-code watcher |
| i18n key parity | Yes | Structural: all langs vs DE keyset |
| Filter & search logic | Yes | Against real data, set-algebra verified |
| Shopping / pantry logic | Yes | `🛒` convention + fallback |
| AI parsing / capture | Yes | `test-ai.js`, `test-capture.js` |
| Derived in-memory fields | Yes | `test-derive.js` |
| Planner logic | Yes | `test-planner.js` |
| Service worker shell | Yes | `test-sw-shell.js` |

## Notable Gaps

**No Drive API tests.** `v2/src/data/drive.js` and `v2/src/data/sync.js` are not tested. The actual HTTP calls to Google Drive (file upload, download, metadata fetch, token refresh) have no test coverage. Integration-level Drive failures must be caught manually.

**No DOM tests.** All feature render functions (`cookbook.js`, `detail.js`, `form.js`, `shopping.js`, etc.) are untested. No headless browser, no jsdom. UI regressions are caught only by manual testing.

**No IndexedDB tests.** `v2/src/data/db.js` is not tested. The persistence layer between Drive syncs has no automated coverage.

**No E2E tests.** No Playwright, Puppeteer, or Cypress. The PWA install flow, Google OAuth, and end-to-end "add recipe → sync → appear on second device" path have no automation.

**No settings tests.** `v2/src/data/settings.js` (theme, language persistence) has no dedicated test file.

**Conflict resolution UI not tested.** `decideSync` returning `"conflict"` is tested, but what the app actually shows the user (UI branch in `sync.js` or `app.js`) has no coverage.

**Snapshot dependency.** `test-filter.js`, `test-shopping.js`, and `test-migrate.js` run against `v2/data/rezepte.snapshot.json` (105 recipes). If the snapshot diverges from the live Drive file, count-based assertions (e.g., `mealPrep` = 80, `toTry` = 27) will fail without indicating a bug in logic. The snapshot must be manually updated when the recipe collection changes materially.
