# Concerns & Risks

**Analysis Date:** 2026-06-16
**Build:** v2.7 (suite 158/158 green, branch `koch-k3`)

---

## Data Integrity

### LWW conflict silently discards dirty local edit
- **Files:** `v2/src/data/sync.js:101-119`, `v2/src/data/decideSync.js`
- **Issue:** When the user edits a recipe offline (`dirty:true`, `updated=T1`) and Drive then carries a newer stamp (e.g. from project-Claude editing `rezepte.json`, `updated=T2 > T1`), `decideSync` returns `"conflict"` — but the current `sync.js` handler surfaces a status banner and keeps the local dirty state. The K2 fix (shipped v2.7) made the conflict *visible* instead of silent, but it does not resolve it: the dirty local edit and the remote edit remain unmerged until the user manually decides. There is no per-recipe merge — the whole file is still LWW on next push.
- **Impact:** In the primary single-user workflow (Marcel + project-Claude serialised via SCHEMA.md open-once protocol) this is safe. It becomes a real data-loss path the moment Epic I2 introduces a second writer (partner/household).
- **Fix approach:** Item-level merge is the correct long-term model (already specified in ROADMAP.md §10 for the shopping list). For recipes the serialised protocol in SCHEMA.md is the near-term mitigation — document it as a hard operational constraint.

### `rezepte.json` duplicate-id on external write is silently resolved
- **Files:** `v2/src/data/schema.js` (`validateCollection`), `v2/src/data/db.js` (`replaceAll`)
- **Issue:** `validateCollection` flags duplicate `id` values in its error report but does not reject the file. IndexedDB's `replaceAll` uses `id` as the keyPath, so the second recipe with the same id silently wins. Only an external writer (project-Claude, manual edit) can produce a duplicate — the app's `makeIdFactory` prevents collisions internally.
- **Impact:** Low probability; silent merge is not corruption but causes invisible recipe loss.
- **Fix approach:** Surface `report.errors` as a non-blocking toast (architect finding, `qa/findings/architect.md`). Already tracked as a known gap.

### `rezepte.json` can diverge from IndexedDB if Drive-for-Desktop sync lags
- **Files:** `v2/src/data/drive.js`, `SCHEMA.md`
- **Issue:** SCHEMA.md requires project-Claude to edit the file in-place via the local Drive-for-Desktop path (`G:\My Drive\rezepte.json`). Drive-for-Desktop has its own upload delay; if the user opens the PWA before the upload completes, the app reads a stale version and LWW may push that stale version back.
- **Impact:** Rare in practice (single user, one editor at a time). Mitigated by SCHEMA.md's open-once-then-edit protocol.
- **Fix approach:** Document as an operational constraint. No code change needed for v2.x.

---

## Sync & Concurrency

### `sync.js` is still hard-wired to the recipe collection
- **Files:** `v2/src/data/sync.js` (entire file), `v2/src/data/decideSync.js`
- **Issue:** `META_KEY = "collection"`, `db.replaceAll("recipes", …)`, and `drive.findFile()` are all wired to one object. K2 extracted a pure `decideSync()` function as the seam, but `sync.js` itself is not collection-agnostic. Epic I2 (shared shopping list on Drive) needs a second synced object. Duplicating `sync.js` would double the Drive-corruption surface and the hard-won invariants would drift.
- **Impact:** Blocks Epic I2 safely. Duplicating without the refactor is the risky path — two divergent Drive writers, two `findFile` fallbacks racing.
- **Fix approach:** Extract `createSyncedObject({ metaKey, store, resolveFile, snapshotUrl, serialize, deserialize })` from `sync.js` (architect ADR, `qa/findings/architect.md`). Effort M. Must be done before any I2 coding starts.

### Shopping list is IndexedDB-only — never synced to Drive
- **Files:** `v2/src/features/shopping/shopping.js`, `v2/src/data/sync.js`
- **Issue:** `sync.js` only syncs the recipe collection. The shopping list (`lists` store in IndexedDB) has no Drive counterpart. Data is lost on a new device or a fresh browser.
- **Impact:** Blocks both I2 (two-way shared list) and simple cross-device list access.
- **Fix approach:** Addressed by Epic I1 (share-as-text, trivial) and I2 (Drive-backed list with item-merge). Requires sync-core refactor first.

### `drive.file` scope structurally prevents cross-account sharing
- **Files:** `v2/src/data/drive.js:9` (`SCOPE = "https://www.googleapis.com/auth/drive.file"`)
- **Issue:** `drive.file` only exposes files the app itself created. A second Google account running the app gets a fresh `findFile()` miss and creates its own file — they never converge. This is the correct privacy posture for single-user v2, but it is a hard architectural constraint for Epic I2 (couples/household sharing).
- **Impact:** I2 as "just sync a second file" will appear to work on the same account across two devices, then fail with a real second person.
- **Fix approach:** Google Picker grants explicit per-file access under `drive.file` without broadening the scope — the one-time share handshake model (ROADMAP.md §10 Model A). Do not use `drive` (broader) scope — it breaks the privacy promise and triggers Google's consent verification.

---

## Architecture Risks

### No bundler means hand-maintained `SHELL` array in `sw.js`
- **Files:** `v2/sw.js:11-67`
- **Issue:** `sw.js` enumerates every module by hand in `SHELL` (~50 entries). A new module added to `v2/src/` that is not added to `SHELL` is not pre-cached — the app silently breaks offline only. This was a real bug: `v2/src/data/baseLang.js` was found missing from SHELL on 2026-06-14 (K4 finding).
- **Impact:** Offline-only breakage is invisible in standard online testing. The no-build choice is correct for v2.x maintainability; the tax is this process hazard.
- **Fix approach:** `v2/tests/test-sw-shell.js` (shipped, K4a) guards this by globbing `src/**/*.js` and failing if any module is absent from SHELL. Run the suite after adding any new source file.

### Localized view (`state.recipes`) must never reach Drive persistence
- **Files:** `v2/src/store.js`, `v2/src/data/baseLang.js`, `v2/src/data/sync.js`
- **Issue:** `store.js` exposes `state.recipes` as a localized overlay while `recipesDe` is the canonical German source. All three mutators (`addRecipe`, `updateRecipe`, `deleteRecipe`) persist via `recipesDe`. If a future contributor (or future-Claude) wires `state.recipes` into `saveCollection`, translated content leaks to Drive and corrupts the file for all readers.
- **Impact:** Silent data corruption: project-Claude would receive translated recipe content instead of canonical German, breaking `🛒` marker logic, category enum checks, and the shopping catalog.
- **Fix approach:** `v2/tests/test-canonical.js` (shipped, K4b) guards this invariant at the source level (3 cases). The guard is in place — maintain it on every new persistence path.

### BYOK API key in `localStorage` is exfiltrable by any added dependency
- **Files:** `v2/src/ai/gate.js`
- **Issue:** The Anthropic API key is stored in `localStorage`, readable by any script on the origin. This is acceptable for a zero-dependency single-user app. Adding any third-party script (analytics, error tracking) to `index.html` would expose it.
- **Impact:** Low risk today. Becomes a security incident if the near-zero-dependency rule is broken.
- **Fix approach:** Treat "no third-party scripts" as a load-bearing security invariant, not a style preference. Any V3 shared-key model needs a backend proxy — BYOK via `anthropic-dangerous-direct-browser-access: true` cannot be used with a shared key.

---

## PWA / Deployment

### `sw.js` CACHE string must be bumped manually on every release
- **Files:** `v2/sw.js:9` (`const CACHE = "koch-v2.7-3"`)
- **Issue:** Cache invalidation is manual. A release that forgets to bump the `CACHE` string serves stale assets from the previous build to returning users until they force-refresh. No automated check enforces this.
- **Impact:** Users may run mismatched code (new `index.html` + old cached modules) if the version string is not bumped.
- **Fix approach:** Add `CACHE` string bump to the release checklist (`qa/ROUTINE.md`) or a release-captain agent check. Low effort.

### No PWA update prompt
- **Files:** `v2/sw.js`, `v2/src/app.js`
- **Issue:** The service worker uses stale-while-revalidate for assets. When a new build is deployed and the SW activates (on next visit after `skipWaiting`), the user gets the new shell silently. There is no "new version available — reload" prompt. For a single-user app this is acceptable, but a stale cached asset could persist until the CACHE key rotates.
- **Impact:** Low for single-user. Worth noting if multiple devices (Marcel's phone + laptop) are in use.
- **Fix approach:** Add a `controllerchange` listener in `app.js` that reloads the page when a new SW takes over. S effort.

### OAuth token stored in `localStorage` with manual TTL
- **Files:** `v2/src/data/drive.js`
- **Issue:** The Google OAuth access token is kept in `localStorage` with a TTL and a silent-renew guard. If the token expires while the user is mid-edit (offline or the silent renew fails), the next Drive operation returns 401. The architect finding confirms the 401 path is handled in `sync.js` with a "Anmeldung abgelaufen" status — but the user must manually re-authenticate.
- **Impact:** Occasional auth interruption in long offline sessions. No data loss.
- **Fix approach:** No change needed for v2.x. The 401 handler already exists.

---

## Roadmap Readiness

### Epic I2 (shared shopping list) has no safe foundation yet
- **Files:** `v2/src/data/sync.js`, `v2/src/features/shopping/shopping.js`
- **Issue:** I2 requires: (1) sync-core refactor, (2) Google Picker integration, (3) item-level merge replacing whole-file LWW, (4) a second Drive file (`einkaufsliste.json`). None of these exist. Attempting I2 without the sync-core refactor risks silently doubling the Drive-corruption surface.
- **Impact:** I2 is architecturally blocked until the sync-core refactor is done. This is the single highest-leverage structural task before any sharing work.
- **Fix approach:** Sequence: sync-core refactor → item-merge `mergeList()` module (pure, testable) → Picker integration → I2 feature. Do not start I2 coding until the first two are in place.

### Epic I3 (friends without app/Google) collides with "no backend" constraint
- **Files:** `v2/src/data/drive.js` (`SCOPE`)
- **Issue:** `drive.file` structurally cannot let a non-Google user write to the list. The only honest path to I3 is a minimal backend (Firebase/Supabase free tier). This reverses the founding "no server / free" architecture constraint.
- **Impact:** I3 is a V3 architectural decision, not a sprint task. Building it half-way on Drive would appear to work in testing (same-account) and fail with real friends.
- **Fix approach:** ROADMAP.md §10 is honest: decide explicitly between redefining "friends" as app-users (I2 with multi-party, no backend) or accepting a minimal backend (I3, V3). Do not start I3 without that decision.

### V3 stack is undefined — "TWA/Capacitor or a framework" remains a planning task
- **Files:** `ROADMAP.md §13`
- **Issue:** V3 targets app-store packaging and a proper build. The stack decision (TWA, Capacitor, framework) has not been made. The no-build architecture that makes v2 hand-editable is incompatible with app-store packaging.
- **Impact:** V3 cannot be scoped until the stack decision is made. All v2.x work should remain compatible with v3 (no V3-incompatible shortcuts).
- **Fix approach:** Plan V3 as a separate horizon. Hard dependency: Epics A–B complete before V3 starts (per ROADMAP.md).

### Bottom tab bar (J2) not yet built — navigation is hamburger-only
- **Files:** `v2/src/features/menu.js`, all 9 view files
- **Issue:** All 10 primary views are only reachable via the hamburger menu (`#menuBtn → openMenu()`). No persistent navigation affordance exists. NN/g research cited in ROADMAP.md projects ~21% task-completion reduction for hidden-menu-only navigation.
- **Impact:** Feature discoverability and daily use ergonomics. Affects all users (currently Marcel only, but relevant if sharing/V3 happens).
- **Fix approach:** ROADMAP.md §11 J2: persistent bottom tab bar for 5 primary sections (Kochbuch · Match · Lager · Einkauf · Planer), ☰ retained for secondary items. Effort M.

---

## Technical Debt

### Cooking-mode timer is destroyed on pager navigation and portion scaling
- **Files:** `v2/src/features/cooking/cooking.js:199` (`clearTimers`), `:231-245` (scaler), `:266-271` (pager)
- **Issue:** `paint()` calls `clearTimers()` unconditionally. Any pager navigation (prev/next/check) or portion-scale change kills a running step timer with no warning. The scaler has an inline comment acknowledging this; the pager path does not.
- **Impact:** User sets a 10-minute timer on step 3, taps "next" — timer vanishes silently, no alarm fires. P3 defect (bug-hunter finding).
- **Fix approach:** Persist timer remaining-time in a Map keyed by step index, restore it in `paint()` on re-wire. Or add a visible warning before navigating when a timer is running.

### Match "restart" re-shows already-liked recipes
- **Files:** `v2/src/features/match/match.js:126`
- **Issue:** The restart handler shuffles `state.recipes.map(r => r.id)` without filtering out already-matched recipes. The initial render correctly filters (`state.recipes.filter(r => !swipeMatches.includes(r.id))`). The `commitSwipe` guard prevents double-matching, but the user must swipe past already-decided cards again.
- **Impact:** Minor UX friction. P3 defect (bug-hunter finding).
- **Fix approach:** Apply the same filter in the restart handler: `shuffle(state.recipes.filter(r => !swipeMatches.includes(r.id)).map(r => r.id))`. One-line fix.

### `assistant.js` chat history and log grow unbounded per session
- **Files:** `v2/src/features/assistant/assistant.js`
- **Issue:** Module-level `history` and `chatLog` arrays are not cleared on navigation away from the assistant view (`app.js` calls `currentCleanup()` but assistant has no `cleanup()` function). The API call slice (`slice(-12)`) bounds the API payload but the in-memory log grows for the whole session.
- **Impact:** Unkritisch — the session resets on page reload. No memory leak in the browser-crash sense. Mentioned in bug-hunter "nothing found" notes as deliberate session memory.
- **Fix approach:** Add a `cleanup()` to assistant that resets or trims the log if session memory becomes a concern in V3.

### `buildLine` footer repeats 8 times across views
- **Files:** `v2/src/features/assistant/assistant.js:50`, `guide.js:43`, `shopping.js:73`, `match.js:89`, `planner.js:142`, `lager.js:70`, `capture.js:76`, `cookbook.js:180`
- **Issue:** Identical `` <div class="build-line">Build ${esc(BUILD)}</div> `` string in 8 files (simplifier finding). Low priority but each requires a separate BUILD import where it is otherwise unused.
- **Fix approach:** `export const buildLine = () => ...` in `v2/src/ui/helpers.js`. S effort. Bundle with any future header/footer work.

### S1–S3 open cosmetic issues from the bug-sweep
- **Files:** ROADMAP.md §2 (S1–S3)
- **S1:** `time`, `lastCooked`, and cuisine/season filter values remain German in non-DE UI. Cosmetic; filtering works on canonical values.
- **S2:** Markdown export uses German headers but localized recipe bodies. Inconsistent but functional.
- **S3:** Shopping list item names are German (matching aisle catalog). Requires parallel German/localized arrays through `aggregateIngredients` to fix.
- **Impact:** All P3 cosmetic. None affects data integrity or functionality.

---

## Test Coverage Gaps

### `v2/src/data/sync.js` — zero tests on the highest-risk path
- **What's not tested:** The entire `syncWithDrive()` decision tree: LWW remote-wins, dirty-push, conflict detection, first-upload, offline short-circuit, 401/network error handlers. Also `saveCollection()` offline-dirty-queue behaviour.
- **Files:** `v2/src/data/sync.js` (174 lines), no corresponding `test-sync.js`
- **Risk:** Epic I2 will refactor exactly this code to be collection-agnostic. Refactoring untested code that manages the only precious data file.
- **Priority:** High. Test-warden finding #1. Specific cases documented in `qa/findings/test-warden.md`.

### `v2/src/ai/parse.js` — adversarial JSON edge cases not pinned
- **What's not tested:** Unbalanced braces, braces-inside-string, array root (not object).
- **Files:** `v2/src/ai/parse.js`, `v2/tests/test-ai.js`
- **Risk:** Low. Current coverage is strong; these are insurance cases.
- **Priority:** Low.

---

## Priority Ranking

1. **`sync.js` has zero tests and Epic I2 will refactor it** — The only precious data file's sync logic is completely untested. I2 (shared shopping list) will refactor this exact code. Test-driven refactor is mandatory before I2 starts. (`v2/src/data/sync.js`)

2. **`sync.js` is not collection-agnostic — I2 is blocked** — Duplicating the recipe sync engine for the shopping list doubles the Drive-corruption surface. Extract `createSyncedObject()` before any I2 coding. (`v2/src/data/sync.js`, architect ADR in `qa/findings/architect.md`)

3. **`drive.file` scope cannot do cross-account sharing — decide the I2 model on paper first** — Building I2 without deciding the access model (Google Picker vs broader scope) produces a feature that works in single-account testing and fails with a real partner. (`v2/src/data/drive.js`)

4. **SW `SHELL` array is hand-maintained — one missed entry breaks offline silently** — `test-sw-shell.js` (K4a) guards this, but the discipline must be maintained: run the suite after adding any new source file. (`v2/sw.js`)

5. **Cooking-mode timer is killed by normal pager navigation** — A user following a timed recipe and tapping "next step" loses the running timer with no warning. P3 but affects the app's primary use case. (`v2/src/features/cooking/cooking.js:199`)

---

*Concerns audit: 2026-06-16. Source: `qa/findings/` (bug-hunter, architect, test-warden, simplifier), ROADMAP.md, SCHEMA.md, direct source reads.*
