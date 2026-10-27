# Koch v2 — Architecture

> Originally the build brief for v2 (June 2026). Sections 2 and 5 were refreshed for v2.15.1
> (2026-10): they describe the code as it is. The rest is still the brief's intent; the code wins
> where they differ. Planning: `ROADMAP.md`. Data contract: `SCHEMA.md`.

## 1. Tech stack

- **No bundler / no build step.** Use native ES modules (`<script type="module">`, `import`/`export`).
  The app must run by opening `index.html` and deploy unchanged to GitHub Pages.
- **Vanilla JS + Web Components** (`customElements`, Shadow DOM where helpful). No React/Vue/heavy
  framework. Small focused utility helpers are fine; keep dependencies near-zero.
- **CSS**: plain CSS with custom properties (design tokens) for theming (light/dark). No CSS framework.
- **Storage**: IndexedDB for the recipe store, plans, lists, and settings. `localStorage` only for
  tiny flags (e.g., theme). The API key is stored locally (see §6).
- **Offline**: a Service Worker with a cache-first strategy for the app shell (served only from
  the active worker's own cache; a new build arrives as a whole with the next worker, so every
  release bumps `CACHE`) and network-first for `index.html`.
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
      db.js               # IndexedDB wrapper (recipes, plans, lists, kv); atomic kvUpdate
      drive.js            # Google auth (GIS) + Drive REST + Picker — the only Google code
      syncCore.js         # ONE sync engine for every Drive file: queue, single-flight, meta patches
      syncRules.js        # pluggable merge rules: recipeSync (rezepte.json), itemMerge (einkaufsliste.json)
      recipeMerge.js      # pure: validate inbound rezepte.json + per-recipe three-way merge
      sync.js             # recipes: config of the engine + snapshot seeding + saveChange()
      listSync.js         # shopping list: config of the engine + partner link/unlink
      decideSync.js       # old file-level rule, now only used once when upgrading without a base
      friendInbox.js      # friends link (Supabase) — its own channel, not the sync core
      schema.js           # schema constants, validation, ID generation
      migrate.js          # load/serialize rezepte.json (additive, lossless)
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
- Sync strategy (v2.15.1): local-first, and **never write without reading**. Every save is a queued
  change on the current IndexedDB state, followed by a sync in the one engine (`syncCore.js`):
  read Drive → validate (`recipeMerge.inspectRemote`: refuse non-objects, missing `recipes`, newer
  format; rescue missing/duplicate ids) → three-way merge per recipe against the stored base (last
  state agreed with Drive) → write Drive only if something changed → replace local only if
  something changed (one backup kept). Recipes also re-sync when the app returns to the foreground
  or comes back online. A merge that would delete many recipes asks first. The shopping list uses
  the same engine with an item-level rule (union by id, newest `updated` wins, tombstones).
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
- Service worker caches the app shell for offline launch; updates arrive atomically with the next worker (v2.16.1).
- Works when fully offline: launch, browse, cook, plan, build a shopping list — all without network.
