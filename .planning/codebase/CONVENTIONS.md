# Code Conventions

**Analysis Date:** 2026-06-16

## Naming

**Files:**
- `camelCase.js` for all source modules: `decideSync.js`, `baseLang.js`, `migrate.js`
- Feature folders use kebab-case: `v2/src/features/cookbook/`, `v2/src/features/shopping/`
- Test files: `test-<module>.js` pattern: `test-decide-sync.js`, `test-i18n.js`
- Data files: `rezepte.snapshot.json` (kebab-case)

**Functions:**
- `camelCase` throughout: `validateRecipe`, `loadCollection`, `makeIdFactory`, `withDefaults`, `buildLangMap`, `localizeRecipes`
- Render functions prefixed `render`: `renderCookbook`, `renderShopping`, `renderPlanner`
- Open/close UI actions prefixed: `openDetail`, `openForm`, `closeAllSheets`
- Boolean-returning helpers use descriptive verbs: `needsBuying`, `isSpecialChip`, `hasLang`

**Variables:**
- `camelCase` for local vars: `recipesDe`, `langMap`, `activeChips`, `filterMode`
- Single-letter aliases allowed for short-lived local values: `const r = raw.recipes[0]`
- Private module-scope state uses lowercase camelCase: `let recipesDe = []`, `let langMap = new Map()`

**Constants:**
- `SCREAMING_SNAKE_CASE` for frozen arrays/enums: `CATEGORIES`, `EFFORT_VALUES`, `DIFFICULTY_VALUES`, `DEFAULT_STAPLES`
- Module-level exports follow camelCase: `SCHEMA_VERSION = 3` (mixed — schema version uses screaming)

**Types (no TypeScript; JSDoc comments used sparingly):**
- Validation returns `{ valid: boolean, errors: string[] }` — consistent across `validateRecipe` and `validateCollection`
- `decideSync` returns string literals: `"create"`, `"pull"`, `"push"`, `"noop"`, `"conflict"`

## Language / i18n

**Core invariant:** Recipe data is stored in German. This is the canonical language. Drive file (`rezepte.json`) is always German.

**Two-layer architecture:**
- `recipesDe` — canonical German data (private to `v2/src/store.js`). This is what gets written to IndexedDB and Drive.
- `state.recipes` — display view, may be overlaid with translations via `buildLangMap` / `localizeRecipes` in `v2/src/data/baseLang.js`.
- The separation is enforced by a source-code guard test (`test-canonical.js`): every `saveCollection()` call in `store.js` must pass `recipesDe`, never `state.recipes`.

**Only 4 fields are translatable per recipe:** `name`, `ingredients`, `steps`, `tips`. All other fields (`category`, `id`, `rating`, `favorite`, `photos`, etc.) are immutable across languages.

**`category` field:** Always stored as one of the 16 German canonical strings (defined in `v2/src/data/schema.js` → `CATEGORIES`). Category translation for display uses `tCat()` from `v2/src/i18n.js`.

**UI language system (`v2/src/i18n.js`):**
- Supported languages: `de`, `en`, `es`, `da` (default: `de`)
- Translation lookup: `t("dot.path.key")`, `tn("key", count)` for plurals, `tCat("DE category string")` for categories
- Fallback chain: requested lang → `de` → key echo (never crashes)
- `setLang("xx")` with unknown code is silently ignored (stays at current lang)
- All languages must have exact key parity with `de` — enforced by `test-i18n.js`

**UI text:** Always in German by default; all UI strings go through `t()`, never hardcoded in feature files.

**`🛒` shopping marker convention:** Appended as ` 🛒` at the end of ingredient strings that are not in the user's pantry. Used both in the app and by Claude when writing recipes. Preserved through translation overlays and serialization.

## Error Handling

**Validation pattern:** Functions return `{ valid: boolean, errors: string[] }` rather than throwing. Used consistently in `v2/src/data/schema.js`:
```js
const res = validateRecipe(r);
if (!res.valid) { /* handle res.errors */ }
```

**`loadCollection` graceful degradation:** Invalid input (e.g., `null`, malformed JSON) returns `{ collection: { recipes: [] }, report: { errors: [...] } }` — never throws. Defective individual recipes are kept in the collection but reported.

**UI error display:** No centralized error UI component in `index.html`. Errors surface via `console.error` (legacy v1) or inline empty-state text rendered by feature views.

**Sync errors:** `decideSync()` returns `"conflict"` as a safe fallback when dirty state is ambiguous — no silent data loss. Actual Drive API errors are caught with `.catch(() => {})` in `v2/src/app.js` (service worker registration).

**Navigation cleanup:** `app.js` wraps route teardown in `try { currentCleanup() } catch(e) { /* egal */ }` — tolerates cleanup failures silently.

## DOM Patterns

**Template strings for HTML:** Feature render functions build HTML as template literal strings, then assign to `.innerHTML`. Example from `v2/src/features/cookbook/cookbook.js`:
```js
function cardHTML(r) {
  return `<div class="rcard" data-id="${esc(r.id)}" ...>${esc(r.name)}</div>`;
}
el.innerHTML = filtered.map(cardHTML).join("");
```

**`esc()` helper:** All user-supplied data interpolated into HTML is escaped with `esc()` from `v2/src/ui/helpers.js`. Never skip `esc()` for recipe fields in HTML context.

**Event wiring post-render:** After setting `.innerHTML`, event listeners are attached via `querySelectorAll` + `.forEach`. No event delegation on root.
```js
el.querySelectorAll(".rcard").forEach((c) => {
  c.onclick = open;
  c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") open(); };
});
```

**Keyboard accessibility:** Interactive cards use `role="button"` + `tabindex="0"` + `onkeydown` for Enter/Space. Icon buttons use `aria-label`. Pattern introduced in K3 sweep.

**`data-*` attributes for identity:** Recipe IDs are stored as `data-id` on cards, `data-fav` on heart buttons, `data-hero` on thumbnail containers.

**Lazy image loading:** Thumbnail/hero images are hydrated after render via `hydrateHeroes()` from `v2/src/ui/helpers.js`.

**Sheets (bottom drawers):** Full-screen overlays rendered as `.sheet` elements. All sheets closed via `closeAllSheets()` from `v2/ui/sheet.js` on route change.

**CSS:** Single `<style>` block in `index.html` for legacy v1 app. v2 uses module-scoped CSS injected by feature render functions or shared via the root `index.html`. CSS variables in `:root`: `--accent`, `--accent2`, `--ink`, `--paper`, `--card`.

## Comment Style

**File-level docblocks:** Every source module starts with a `//` comment block explaining purpose, key constraints, and relevant epic/ticket references:
```js
// store.js — In-Memory-Zustand + Mutations-Aktionen.
//
// SPRACH-ARCHITEKTUR (B2/B3): `state.recipes` ist die ANZEIGE-Sicht ...
```

**Inline comments:** German or English, mixed throughout. Architecture-critical invariants are always in German (matching the product language). Implementation notes tend to be German; test assertion messages mix both.

**Test comments:** Test files open with a `//` comment explaining what module is tested and which epic/bug it guards. Individual test groups use `/* --- Section --- */` separators.

**No JSDoc:** Functions are not annotated with `@param`/`@returns` JSDoc. Validation return shapes are documented in comments at the function definition.

**`// ← comment`** pattern used inline in test fixture data to annotate expected values (see `test-migrate.js` G1 block).
