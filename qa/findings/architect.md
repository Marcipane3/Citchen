# Architect — findings (2026-06-14T11:45:45Z)

Build `2026-06-13-v2.5`, suite 145/145. App under `v2/`. Read: `01_ARCHITECTURE.md`,
`SCHEMA.md`, `store.js`, `data/sync.js`, `data/drive.js`, `data/migrate.js`, `data/schema.js`,
`data/db.js`, `sw.js`, `ai/client.js`, `ai/gate.js`, `features/shopping/shopping.js`,
`ROADMAP.md` Epic I. Scope: decisions going forward, not line-bugs.

**Verdict up front:** the structure is genuinely slim and well-built for what it is today. The
layering holds, the canonical/overlay split is sound, security is honest. The single real
fault-line is exactly the one the roadmap already flagged: `sync.js` is hard-wired to one object,
and Epic I2 needs a second. Refactor *that seam* before you write a second Drive writer — the rest
is fine for now or is a deliberate V3 fork.

---

### ADR-candidate: Generalise `sync.js` to a collection-agnostic core before the second writer  ·  horizon: before-I2
- **Context:** `sync.js` hard-codes a single object: one `META_KEY = "collection"`, one Drive file
  (`drive.findFile()` resolves the *recipe* file by `KNOWN_FILE_ID`/name), one IndexedDB store
  (`recipes`). The reconciliation logic — LWW on `meta.updated`, dirty-flag push, first-run
  upload, snapshot seeding — is genuinely good, but every line assumes "the recipes." The shopping
  list (`shopping.js`) persists to the `lists` store via its own `db.put("lists", …)` and **never
  touches Drive at all.** I2 wants a second synced object (`einkaufsliste.json`). There are two
  ways to get there: (a) copy-paste `syncWithDrive`/`saveCollection` for the list, or (b) extract a
  `SyncedObject` core parameterised by `{ key, storeName, fileResolver, serialize, deserialize,
  meta }`.
- **Risk if ignored:** path (a) doubles the Drive-corruption surface. The recipe sync has
  hard-won invariants — never create a duplicate file, never lose the array, LWW string-compare on
  `updated`, dirty-push only when local strictly newer. A hand-copied second writer will drift from
  those invariants the first time one of them is patched, and the failure mode is silent data loss
  on Marcel's *recipe* file or his *list* file. Two ad-hoc writers also means two `findFile`
  fallbacks racing over the `drive.file` namespace.
- **Recommendation:** Extract the core **before** I2, not during. The seam already exists in all but
  name — `META_KEY`, `SNAPSHOT_URL`, the three `db` store names, and `drive.findFile()` are the
  only object-specific bits in an otherwise generic engine. Concrete shape:
  ```
  // sync-core.js
  createSyncedObject({
    metaKey,                 // kv key for {version, updated, fileId, dirty, lastSync, source}
    store,                   // IndexedDB store name ("recipes" | "shopping")
    resolveFile,             // () => fileId|null   (recipes: KNOWN_FILE_ID+name search)
    snapshotUrl,             // optional seed for empty store
    serialize, deserialize,  // collection <-> file string  (migrate.toFileString / loadCollection)
  }) -> { loadLocal, syncWithDrive, save, onStatus }
  ```
  Then `sync.js` becomes `createSyncedObject({ metaKey:"collection", store:"recipes", … })` and the
  list becomes a second instance with `metaKey:"shopList"`, `store:"lists"`, its own resolver.
  Trade-off named: this is a **refactor with no user-visible change**, so it competes for time
  against shippable features and risks a regression in the one sync path that works today — guard it
  with the existing round-trip tests *extended to two instances* before merging. Worth it: the
  alternative (two divergent writers) is the more expensive mistake.
- **Effort / blast radius:** **M** · new `sync-core.js`; `sync.js` shrinks to a config; `store.js`
  unaffected (still calls `sync.saveCollection`); tests gain a second-instance round-trip. Do it as
  its own commit, no behaviour change, then I2 sits on top.

---

### ADR-candidate: `drive.file` scope cannot do cross-account sharing — pick the model now  ·  horizon: before-I2
- **Context:** `drive.file` (`drive.js` `SCOPE`) only exposes files **the app itself created**. This
  is the right privacy posture and is load-bearing for the "no backend, no tracking" promise — but
  it means two *different* Google accounts **cannot both see the same `einkaufsliste.json`** the way
  Marcel imagines "share with housemates." App A created the file; App B (different account) gets a
  fresh `findFile()` miss and creates its *own* file. They never converge. The roadmap lists three
  options; here is the honest ranking.
- **Risk if ignored:** I2 gets built as LWW-on-one-file (mirroring recipes), demoed on Marcel's two
  *own* devices where it works, then fails the moment a real second person joins — because that was
  never the same file. The feature looks done and isn't.
- **Recommendation:** Be honest about the three models:
  1. **Shared-folder model (recommended for I2).** One person creates the list file and shares the
     *containing folder* (or the file) with the others via normal Drive sharing. The catch:
     `drive.file` still won't surface a file the app didn't create on *that* account — so the
     collaborator must **open the file through the app once via a file-picker/`drive.file` grant**
     (Google Picker hands the app explicit per-file access under `drive.file`). That keeps the
     minimal scope. Cost: a one-time "pick the shared list" onboarding step per collaborator. This
     is the only option that preserves the privacy promise.
  2. **Broader scope (`drive` or `drive.readonly`).** Trivially makes sharing work — but it grants
     the app read of the user's *entire* Drive, directly contradicts §6 minimalism, and would force
     a new OAuth consent. **Reject** unless Marcel explicitly trades privacy for convenience.
  3. **Item-level merge instead of LWW.** Orthogonal to the access problem (it doesn't *solve*
     cross-account visibility) but it's the right *conflict* model for a list two people edit
     concurrently: a checked-off item shouldn't be resurrected because the other device's
     whole-file write was newer. A list is a set of items with stable keys (`itemKey(name,unit)`
     already exists in `shopping/logic.js`) — a per-item `{qty, done, updated, tombstone}` merge is
     natural and avoids the "my add clobbered your add" failure that whole-file LWW guarantees for
     concurrent editors.
  My call: **shared-folder + Picker for access (1), item-level merge for conflicts (3).** LWW is
  correct for recipes (single editor, Marcel + project-Claude serialised by the SCHEMA.md
  open-once-then-edit protocol) but **wrong for a genuinely shared list** where two people tick
  items at the same time. Don't reuse the recipe conflict model here just because the sync *engine*
  is shared.
- **Effort / blast radius:** **L** · Picker integration in `drive.js`; item-merge in a new list
  logic module; the sync-core from the previous ADR must allow a pluggable merge strategy (LWW for
  recipes, item-merge for the list) — fold that into the core's `deserialize`/reconcile seam.

---

### ADR-candidate: Canonical-German overlay is holding — keep the discipline  ·  horizon: now (sound)
- **Context:** `store.js` keeps `recipesDe` private (canonical, persisted) and exposes
  `state.recipes` as a localized view via `localizeRecipes`. Every mutation path — `updateRecipe`,
  `addRecipe`, `deleteRecipe` — operates on `recipesDe` and calls `persist()` → `sync.saveCollection(recipesDe)`.
  `applyLanguageOverlay` is explicitly read-only and writes nothing. Logic that must match German
  constants (shopping catalog, pantry) correctly reaches for `getRecipeDe`.
- **Risk if ignored:** if a future feature persists `state.recipes` instead of `recipesDe`,
  translated content leaks to Drive and corrupts the file shared with v1 + project-Claude. That's an
  architectural failure, not a bug. Today there is **no such path** — I traced all three mutators
  and the persist call; all go through the German array.
- **Recommendation:** This is already right. One cheap guardrail to keep it right: a unit test (or a
  dev-only assertion in `saveCollection`) that **fails if any recipe being serialized carries a
  non-empty translation marker** / asserts the array identity is `recipesDe`, not the view. Cheap
  insurance against a future contributor (or future-Claude) wiring a view into persistence. The S2
  Markdown-export inconsistency in the roadmap is the only place the overlay leaks *visibly*, and
  it's cosmetic, not persisted.
- **Effort / blast radius:** **S** · one test in `v2/tests`. No code change needed today.

---

### ADR-candidate: No-bundler is still correct for v2.x — it is the deliberate V3 fork  ·  horizon: before-V3
- **Context:** 42 ES modules in `src/`, 105 recipes, per-language snapshot files loaded on switch.
  `sw.js` enumerates **every module by hand** in `SHELL` (currently ~50 entries) and pins them with
  a single `CACHE = "koch-v2.5-1"` string bumped per release. First paint pulls IndexedDB
  immediately (good — instant/offline), so request-count on cold load is the only real cost.
- **Risk if ignored:** the no-build choice's tax is **the hand-maintained `SHELL` array**. Every new
  module must be added by hand; a forgotten entry means that file isn't pre-cached and the app
  breaks *offline only* — invisible in online testing, exactly the kind of bug that ships. That's a
  process hazard, not a runtime one. Request count (~50 module GETs on cold cache) is acceptable on
  modern HTTP/2 GitHub Pages for a single-user app; it is not a reason to add a build step at v2.x.
- **Recommendation:** **Keep no-build for all of v2.x** — it is exactly what makes the app
  hand-editable by Marcel and project-Claude, which is a stated design goal. The two failure modes
  have cheap mitigations short of a bundler: (1) **derive the `SHELL` list** or add a test that
  globs `src/**/*.js` and asserts every module is listed in `sw.js` — kills the "forgot to cache a
  file" class outright; (2) keep bumping `CACHE` per build (already disciplined). The bundler
  question genuinely belongs to **V3**, where the roadmap already flags "moving off single-folder
  static PWA toward a proper build (TWA/Capacitor)" for the app-store packaging — *that* is the
  right moment, driven by store packaging, not by module count. Don't pre-pay that cost now.
- **Effort / blast radius:** **S** · one `sw.js`-coverage test in `v2/tests`. The bundler itself is
  a V3 planning task, not a v2.x action.

---

### ADR-candidate: BYOK + security posture is honest — one residual to note  ·  horizon: now (sound)
- **Context:** API key lives in `localStorage` only (`gate.js`), sent only as `x-api-key` to
  `api.anthropic.com` from the user's browser (`client.js`), never logged, never in the Drive file.
  `gate.isPremium()` gates AI; `aiUnavailableReason()` distinguishes no-key vs offline honestly. The
  Drive scope is minimal. The OAuth access token is short-lived in `localStorage` with a TTL and a
  silent-renew guard. This all matches §6 and the "no backend, no tracking" promise.
- **Risk if ignored:** two things to keep on the radar, neither blocking: (1) `localStorage` key is
  readable by any script on the origin — fine for a single-user static app with no third-party
  scripts, but it means **any future dependency you add to the page can exfiltrate the key.** The
  near-zero-dependency rule is therefore a *security* control, not just a simplicity one — treat it
  as load-bearing. (2) `anthropic-dangerous-direct-browser-access: true` is correct and necessary
  for browser BYOK, but it's the reason the key must never be a *shared* key baked into the
  app — the roadmap's "shared API key / pay-double" idea would put a secret in client code, which is
  unshippable. Flag that for the payments discussion: BYOK or a real backend proxy, no middle.
- **Recommendation:** No change today. **Write down** that "near-zero dependencies" is a security
  invariant (so nobody adds an analytics snippet later), and that any shared-key model needs a
  backend proxy — it cannot be done client-side without leaking the secret. Both belong in the V3
  payments plan, not v2.x.
- **Effort / blast radius:** **S** · documentation only.

---

### ADR-candidate: Schema validation is strict enough to survive a bad external write  ·  horizon: now (sound)
- **Context:** `SCHEMA.md` is a contract shared with external writers (v1, project-Claude editing
  the file in place). `loadCollection` (`migrate.js`) validates via `validateCollection` but —
  deliberately — **does not drop invalid recipes** ("wir verlieren nie Daten"); it loads them and
  reports errors to console. `validateRecipe` enforces required `id`/`name`/`category`-in-enum and
  type-checks every optional field. Unknown fields are passed through untouched (forward-safe).
  `withDefaults` fills the six v1 fields. The G1 round-trip (edit preserved, `photos`/rating
  untouched, idempotent reload) is test-covered.
- **Risk if ignored:** the load-but-don't-drop policy is the right call for *Marcel's own* file
  (never silently lose a recipe a bad edit produced), **but** it means a malformed external write
  reaches the in-memory store and the UI. The mitigating fact: `store.js`'s own mutators re-validate
  via `validateRecipe` and **throw** before persisting, so a bad external recipe can't be *written
  back* worse than it arrived — it round-trips byte-stable or blocks the save. The one genuine gap:
  `validateCollection` flags a **duplicate `id`** but, like everything else, doesn't reject the
  file; two recipes with the same `id` would both load and IndexedDB's `keyPath:"id"` would keep
  only the last on `replaceAll`. That's a silent merge, not corruption, and only an external writer
  can cause it (the app's `makeIdFactory` prevents collisions).
- **Recommendation:** Keep the lenient load. Add **one** thing: surface `report.errors` to the user
  (a non-blocking "Drive file has N issues" toast) instead of console-only — so a bad
  project-Claude write is *visible* to Marcel rather than silently tolerated. The dup-id case is
  rare enough to leave as-is for now, but note it in `SCHEMA.md` as a writer responsibility. Round-
  trip safety itself is **proven and sound** — don't touch it.
- **Effort / blast radius:** **S** · surface existing `report.errors` in the sync status line.

---

## Forward map — if you only do three structural things before V3

1. **Extract `sync-core.js` (collection-agnostic) before writing any second Drive writer.** The
   recipe sync is good; the danger is *duplicating* it for I2. One parameterised core, two
   instances, with a **pluggable conflict strategy** (LWW for recipes, item-level merge for the
   shared list). This is the single highest-leverage refactor and it gates Epic I2.

2. **Decide the cross-account model for the shared list now, on paper, before estimating I2.** Pick
   shared-folder + Google Picker (keeps `drive.file` minimal) over a broader scope (kills the
   privacy promise). Accept that whole-file LWW is *wrong* for a two-person list and design
   item-level merge in from the start — don't inherit the recipe conflict model by reflex.

3. **Turn two invisible invariants into automated tests:** (a) a `sw.js`-SHELL coverage test that
   globs `src/**/*.js` and fails on any uncached module — this is the no-build tax made safe; and
   (b) a persistence-canonicality test asserting only `recipesDe` (never the localized view) reaches
   Drive. Both protect already-correct architecture from future drive-by regressions, including
   ones a future-Claude could introduce.
