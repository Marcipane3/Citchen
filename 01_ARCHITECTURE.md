# Koch v2 — Architecture

> **Status (2026-10-27, v2.15.1).** Sections 1–9 are the original build plan (June 2026); §0 says
> where the built app differs. The data contract is `SCHEMA.md`; sharing is `v2/docs/SHARING.md`.

## 0. As built (read this first)

| Plan said | Built |
|---|---|
| Web Components for the UI kit | Plain ES-module functions that render HTML strings (`src/ui/helpers.js`, `sheet.js`, `tabbar.js`, `tabs.js`). No Shadow DOM. |
| `/features/cooking-mode` | `/features/cooking`; extra modules `lager`, `match`, `guide`, `onboarding`, `menu.js` |
| One `sync.js` with last-write-wins on `updatedAt` | One **sync core** for every Drive file (`data/syncCore.js`: queue, single-flight, meta patches, find/create/read/write, status) with a pluggable merge rule per file (`data/syncRules.js`). See §5. |
| Model picker (Haiku default) | Model IDs per action in `src/ai/`; see ROADMAP-V2 Q1 for the planned single config |
| — | Shopping list in Drive (`einkaufsliste.json`, item merge + tombstones, partner sharing via Picker) and a Supabase friends inbox (`data/friendInbox.js`, I3) — both outside the recipe file |
| — | Canonical German: `rezepte.json` is always German; EN/DA/ES are display overlays from bundled snapshots (`data/baseLang.js`, `store.js`). The edit form always edits the German original. |

**Recipe sync (v2.15.1).** Every read and every save runs the same step inside the core's queue:
read `rezepte.json` → `checkInbound` (refuse structurally broken files, rescue id-less / duplicate
entries) → three-way merge per recipe and per field against the **base** (the last state this device
agreed on with Drive, kept in IndexedDB `kv.collectionBase`) → ask before a mass delete (≥ 5 recipes
or ≥ 20 %) → write only if the result differs from Drive → replace local only if it differs from
local (old local copy kept in `kv.recipesBackup`). Same field changed on both sides → the app wins.
A save during a running sync is detected by a synchronous revision counter in `sync.js`; the running
sync then leaves local data and the base alone and the queued save merges again. Pure logic:
`data/recipeMerge.js` (tests: `tests/test-recipe-merge.js`, two-device and project-Claude scenarios
in `tests/test-sync-core.js`, browser flows in `e2e/tests/08-*` and `12-*`). Syncs run on sign-in,
on every save, on `visibilitychange` back to visible and on `online`. There is no blind upload any more.

## 1. Tech stack

- **No bundler / no build step.** Use native ES modules (`<script type="module">`, `import`/`export`).
  The app must run by opening `index.html` and deploy unchanged to GitHub Pages.
- **Vanilla JS + Web Components** (`customElements`, Shadow DOM where helpful). No React/Vue/heavy
  framework. Small focused utility helpers are fine; keep dependencies near-zero.
- **CSS**: plain CSS with custom properties (design tokens) for theming (light/dark). No CSS framework.
- **Storage**: IndexedDB for the recipe store, plans, lists, and settings. `localStorage` only for
  tiny flags (e.g., theme). The API key is stored locally (see §6).
- **Offline**: a Service Worker with a cache-first strategy for the app shell and a stale-while-
  revalidate strategy for recipe data.
- **Sync**: Google Drive via the Drive REST/JS API, `drive.file` OAuth scope.
- **Hosting**: GitHub Pages, served from the **`/v2`** path. v1 stays at the repo root.

## 2. Folder structure (inside `/v2`)

```
/v2
  index.html              # app shell, registers SW, mounts root
  manifest.webmanifest    # PWA manifest (installable)
  sw.js                   # service worker
  /styles
    tokens.css            # design tokens (colors, spacing, type)
    base.css              # resets + base layout
  /src
    app.js                # bootstrap, router, mounts views
    router.js             # hash-based routing (offline + Pages friendly)
    /data
      db.js               # IndexedDB wrapper (recipes, plans, lists, settings)
      drive.js            # Google Drive auth + read/write rezepte.json
      sync.js             # local <-> Drive reconciliation
      schema.js           # schema constants, validation, ID generation
      migrate.js          # v1 rezepte.json -> v2 in-memory model (additive, lossless)
    /features
      /cookbook           # browse, search, filter, recipe detail, "zuletzt gekocht"
      /cooking-mode       # step-by-step, timers, portion scaler, wake lock
      /planner            # rule-based weekly plan generator
      /shopping           # aggregate -> subtract pantry -> grouped list
      /assistant          # AI chat (BYOK): suggest / leftover solver / generate->save
      /capture            # photo/URL -> recipe (BACKLOG; scaffold only)
      /settings           # API key, model picker, pantry staples, sync, theme
    /ai
      client.js           # Anthropic API client (BYOK); model-agnostic
      prompts.js          # prompt templates for assistant + capture
      gate.js             # isPremium() = has valid key; feature gating
    /ui                   # shared Web Components (buttons, cards, modal, list, timer)
  /tests                  # unit tests for deterministic logic (planner, shopping, schema)
```

> Component/file names are guidance, not law. Keep the **layering** (data / features / ai / ui) intact.

## 3. Application layers

- **Data layer** (`/src/data`): the only code that touches IndexedDB or Drive. Everything else
  reads/writes through it. Pure, testable functions where possible.
- **Feature modules** (`/src/features/*`): self-contained; each owns its view(s) and logic and
  depends only on the data layer, the ui kit, and (optionally) the ai layer.
- **AI layer** (`/src/ai`): the *only* place that calls the Anthropic API. Behind a single
  interface so AI can be swapped, disabled, or later moved to a backend without touching features.
- **UI kit** (`/src/ui`): shared presentational Web Components.

## 4. Data model & source of truth

- **Canonical schema**: the existing `SCHEMA.md` in the project is authoritative for the recipe
  object and the **16 fixed category strings**. Read it. `02_DATA_SCHEMA` documents the **additive**
  fields v2 introduces (tags + structured Tipps) — these must be backward-compatible.
- **rezepte.json** is the persisted recipe collection. v2 reads the existing file, migrates it
  in-memory (additive, lossless), and caches it in IndexedDB.
- **Offline behavior**: on launch, load recipes from IndexedDB immediately (instant, offline). If
  online and signed in, sync with Drive in the background and update the cache.

## 5. Google Drive integration

- Scope: **`drive.file`**. The app can read and write files **it created** — so in-app saving and
  updating of `rezepte.json` works normally.
- Existing identifiers to reuse:
  - `rezepte.json` file ID: `1t6KRviicPspYVj9oFjsUTJ6n8kZLHP1y`
  - Parent folder ID: `0AAY4rCSLDHjTUk9PVA`
- **Important distinction:** the "create-new-file, can't overwrite" limitation only applies to the
  Drive *MCP connector used in chat*. The **PWA using the Drive API can update the file in place**.
  Build proper in-place save (update existing file content), not create-duplicate.
- Sync strategy: local-first. On save, write IndexedDB first (instant), then sync with Drive when
  online. *(Plan: last-write-wins on a timestamp. Built since v2.15.1: read-before-write with a
  three-way merge per recipe and field — see §0.)*
- Google sign-in is **optional**. Without it, the app runs fully on local data; sync is just off.

## 6. BYOK (Bring Your Own Key) & premium gating

- The app ships with **no API key**. AI features are hidden/disabled until the user adds a key in
  Settings.
- The key is stored **locally only** (IndexedDB/localStorage), never sent anywhere except directly
  to the Anthropic API from the user's own browser. Never logged, never synced to Drive.
- `gate.isPremium()` returns true iff a non-empty key is present. All AI entry points check this and
  otherwise show a friendly "add your key in Settings to enable AI" state.
- **Model picker** in Settings: default to the cheap **Haiku-tier** model; allow switching to Sonnet.
  Photo/URL capture requires a **vision-capable** model — validate the selected model supports vision
  before enabling capture. (Confirm exact current model IDs at build time.)
- Security note for the build: calling the Anthropic API directly from the browser may require the
  appropriate browser-access header/config; implement per current Anthropic API docs. Handle missing/
  invalid key and rate-limit errors gracefully.

## 7. Routing & state

- **Hash-based router** (`#/cookbook`, `#/cook/:id`, `#/planner`, `#/shopping`, `#/assistant`,
  `#/settings`). Hash routing works offline and on GitHub Pages subpaths without server config.
- State: simple, explicit. A small in-memory store hydrated from IndexedDB; no global framework.

## 8. Feature parity (MANDATORY)

Before building v2 features, **read the existing v1 app source** (the v1 `index.html` at the
repository root / in the project folder) and produce a written inventory of every feature, behavior,
and UI affordance it has. v2 must reproduce **all** of them (e.g., recipe display, category
navigation, add/edit recipe, Drive load/save, any search/filter, "zuletzt gekocht" tracking, the
recipe format/fields). Treat any v1 capability not explicitly superseded here as a hard requirement.
List anything ambiguous at the Phase 0 checkpoint rather than dropping it.

## 9. PWA requirements

- Installable: valid `manifest.webmanifest` (name, icons, theme color, `start_url` scoped to `/v2`,
  `display: standalone`).
- Service worker caches the app shell for offline launch; recipe data served stale-while-revalidate.
- Works when fully offline: launch, browse, cook, plan, build a shopping list — all without network.
