# Test-Warden — findings (2026-06-14T12:08:28Z) · suite: 145/145

Build `2026-06-13-v2.5`. `node v2/tests/run.js` is **green: 145 passed, 0 failed, 145 total.**
Pure-logic, offline, no DOM/network, wired through 11 `tests/test-*.js` files.

**Headline:** the suite is genuinely strong on every module that touches the recipe
*content* path (schema, migrate, derive, shopping, planner, filter, capture, lager, i18n,
baseLang, ai). The one structurally important hole is **`data/sync.js`** — the entire
LWW / dirty / source / offline-queue decision tree has **zero tests**, and roadmap Epic I2
will refactor exactly this code to support a second synced object. That refactor must be
test-driven; the cases below are written so the refactor lands against them.

---

## Coverage map (pure modules → test file)

| Module | Test | State |
|---|---|---|
| `data/schema.js` | test-schema.js (10) | covered |
| `data/migrate.js` | test-migrate.js (incl. round-trip, G1 external edit) | covered, strong |
| `data/derive.js` | test-derive.js | covered, strong |
| `data/baseLang.js` | test-baselang.js (4) | covered |
| `features/cookbook/filter.js` (+export.js) | test-filter.js (22) | covered, strong |
| `features/planner/logic.js` | test-planner.js (16) | covered, strong |
| `features/shopping/logic.js` (+catalog.js) | test-shopping.js | covered, strong |
| `ai/gate.js` + `ai/parse.js` + `ai/prompts.js` | test-ai.js | covered, strong |
| `features/capture/parse.js` | test-capture.js (5) | covered |
| `features/lager/logic.js` | test-lager.js (12) | covered |
| `i18n.js` | test-i18n.js (9) | covered |
| **`data/sync.js`** | — | **NONE — high-risk gap** |
| `data/drive.js` | — | network/Google-bound, no pure logic to extract (acceptable) |
| `data/db.js`, `data/settings.js`, `data/lager.js`, `features/match/match.js` | — | IndexedDB/DOM wrappers, intentionally untested (acceptable) |
| `features/onboarding/language.js`, all `*/...view` files | — | pure DOM, intentionally untested (correct) |

---

## Coverage gaps (ranked by risk)

### v2/src/data/sync.js  ·  risk: HIGH
The persistence/sync brain — `syncWithDrive()` and `saveCollection()` — decides who wins
between local and Drive, when to push, and what happens offline. No test file exists. Drive
and db are async I/O, but the *decision* is pure and the spec calls these branches out
explicitly (LWW / dirty / offline). The realistic way to test without a browser is to inject
fakes for the `db` and `drive` modules (the module already imports them as namespaces, so the
I2 refactor should pass them in or expose a pure `decideSync(meta, remoteMeta)` helper —
propose that as part of I2).

- **Covered today:** none.
- **Gap — the LWW / dirty / source branches in `syncWithDrive()`:**
  - `sync.firstUpload`: signed-in, `findFile()` → null, local recipes present → expect `createFile` called once, `meta.source="drive"`, `dirty=false`, `changed=false`.
  - `sync.remoteNewerWins`: `remote.updated="…T12:00Z"` > `local.updated="…T09:00Z"`, `meta.dirty=false` → expect `replaceAll` called with remote recipes, `changed=true`, returned meta carries remote `updated`/`version`.
  - `sync.localDirtyNewerPushes`: `meta.dirty=true` and `localUpdated > remoteUpdated` → expect `updateFile` (PATCH, never createFile), `dirty=false` after, `changed=false`.
  - `sync.localDirtyButRemoteNewer`: `meta.dirty=true` BUT `remoteUpdated > localUpdated` → **currently remote wins and the dirty local edit is silently overwritten** (the `dirty && local>remote` guard is false, so the `remoteUpdated !== localUpdated` branch replaces all). Pin this as the *documented* behaviour or flag it as a real conflict-loss bug — either way it needs a test so I2 doesn't change it by accident.
  - `sync.firstDriveLoadEvenIfEqual`: `remoteUpdated === localUpdated` but `meta.source !== "drive"` (e.g. `"snapshot"`) → expect `changed=true`, recipes replaced from Drive, `source="drive"`.
  - `sync.noChangeNoOp`: `remoteUpdated === localUpdated` and `source==="drive"` → expect only `lastSync` bumped, `changed=false`, no `replaceAll`/`updateFile`.
  - `sync.signedOutShortCircuits`: `drive.isSignedIn()===false` → expect `{changed:false}` and **no** db/drive calls, no status change.
  - `sync.driveThrows401`: `readFile` throws `{status:401}` → expect status set to "Anmeldung abgelaufen", `{changed:false, error}`, meta untouched.
  - `sync.driveThrowsOffline`: `findFile` throws generic network error → expect status "Offline — lokale Daten", `{changed:false, error}`, no data loss.
- **Gap — `saveCollection()` offline/dirty queue:**
  - `save.offlineStaysDirty`: `navigator.onLine===false` → expect `replaceAll` ran, `meta.dirty=true`, no drive calls, status "Lokal gespeichert".
  - `save.onlinePushClears`: signed-in + online, existing `fileId` → expect `updateFile` called, `dirty=false`, `source="drive"`.
  - `save.pushFailsRemainsDirty`: `updateFile` throws → expect `dirty=true` still (queued for next sync), status "Sync ausstehend".
  - `save.updatedMonotonic`: two `saveCollection` calls → expect second `meta.updated` strictly greater (inject `now`); guards LWW ordering.
- **Gap — `loadLocal()` empty-DB seeding:**
  - `load.emptyDbSeedsSnapshot`: empty `recipes` → fetch snapshot, `replaceAll`, `meta.source="snapshot"`, `dirty=false`.
  - `load.snapshotUnreachable`: fetch throws → expect no crash, `meta.source="empty"`, `recipes=[]`.

### Forward coverage for Epic I2 (sync.js → collection-agnostic)  ·  risk: HIGH (pre-emptive)
I2 generalises sync to a *second* synced object (e.g. shopping list / plan). Write these
**before** the refactor so it's test-driven. They assume I2 extracts a pure
`decideSync({localUpdated, remoteUpdated, dirty, source})` returning an action
(`"push" | "pull" | "noop" | "create"`) — propose that extraction as the seam.

- `i2.decidePure.remoteNewer`: `{local:"T1", remote:"T2", dirty:false}` → `"pull"`.
- `i2.decidePure.localDirtyNewer`: `{local:"T2", remote:"T1", dirty:true}` → `"push"`.
- `i2.decidePure.conflict`: `{local:"T2", remote:"T2-different-content", dirty:true}` → defined resolution (propose `"pull"` + flag, matching today's silent-remote-wins, or a new `"conflict"` action). **This is the case to nail down before two objects multiply it.**
- `i2.decidePure.equalDriveSource`: `{local:"T1", remote:"T1", source:"drive"}` → `"noop"`.
- `i2.decidePure.equalNonDriveSource`: `{local:"T1", remote:"T1", source:"snapshot"}` → `"pull"`.
- `i2.twoWriterConverge`: device A pushes `vA`, device B (dirty, older) syncs → B pulls `vA`, B's later edit pushes `vB` > `vA`, A pulls `vB`. Expect both devices converge to `vB`, no lost write beyond the documented conflict rule.
- `i2.collectionAgnostic.recipes` & `i2.collectionAgnostic.shopping`: same `decideSync` inputs drive both objects identically — proves the generalisation didn't special-case recipes.
- `i2.offlineQueuePerObject`: object A dirty+offline, object B clean → next online sync pushes only A, leaves B as noop. Guards the per-object dirty flag.
- `i2.separateFileIds`: two objects → two distinct Drive `fileId`s, never cross-written (a PATCH to A must never hit B's id).

### v2/src/data/migrate.js — `toFileString` edge inputs  ·  risk: LOW
- **Covered today:** round-trip fixpoint, umlaut/emoji byte-fidelity, `setUpdated` stamping, G1 external-edit + append, broken-input tolerance. Excellent.
- **Gap (minor):** `toFileString` with `{ setUpdated:true }` but no `now` injected falls to `Date.now()` — one case asserting the output `updated` parses as a valid ISO string would close the only untested line.

### v2/src/ai/parse.js — `extractJson` adversarial input  ·  risk: LOW
- **Covered today:** pure JSON, fenced, prose-wrapped, escaped quotes, nested braces, empty/none. Strong.
- **Proposed cases:**
  - `extractJson.unbalanced`: `'{"a":1'` (never-closed) → expect `null` (loop ends, no throw).
  - `extractJson.braceInString`: `'{"note":"use { and } sparingly"}'` → expect the full object, not a truncation at the inner `}` (string-state machine already handles this — lock it in).
  - `extractJson.arrayRoot`: `'[1,2,3]'` (no top-level `{`) → expect `null` (documents that only objects are extracted).

---

## If you add three tests, add these
1. **`sync.localDirtyButRemoteNewer`** — the one place a user's offline edit can be silently overwritten. Highest blast radius, untested, and I2 will multiply it across objects. Test it first; decide explicitly whether today's behaviour is correct or a bug.
2. **`save.pushFailsRemainsDirty`** — proves a failed Drive push doesn't drop the edit (stays queued). Core offline-first promise of the app.
3. **`i2.decidePure.conflict`** (with the `decideSync` extraction) — write the conflict rule down as an executable spec before I2 generalises sync to a second object, so two-writer convergence has a fixed point to build against.

## Already well-covered (don't re-flag on reruns)
- `data/migrate.js` — round-trip, byte-fidelity, G1 external-edit/append, broken-input. Gold standard.
- `data/derive.js` — minutes/hours parsing, tipps structuring, ingredient parse (units, fractions, ranges, groups, 🛒, optional), scaling (metric vs. count, fraction output), servings. Exhaustive.
- `features/shopping/logic.js` + `catalog.js` — marker vs. marker-less buying, staples override, aggregation/merge/scaling, catalog assignment. Thorough.
- `features/planner/logic.js` — deterministic RNG, slot/effort/season/cuisine scoring, locks, leftover days, rotation. 16 cases.
- `ai/gate.js` + `ai/parse.js` + `ai/prompts.js` — BYOK gating, `aiUnavailableReason` nokey/offline, coercion to schema, suggestion/plan id-filtering, prompt assembly. Strong.
- `features/cookbook/filter.js`, `data/schema.js`, `data/baseLang.js`, `i18n.js`, `features/lager/logic.js`, `features/capture/parse.js` — all carry meaningful, non-trivial cases.

**Conclusion:** one real gap (sync.js) on the highest-risk path; everything else is well-protected. A green suite — but sync needs tests before I2, not after.
