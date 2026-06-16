# Tech Stack

**Analysis Date:** 2026-06-16

## Languages

**Primary:**
- JavaScript (ES2022+, native ES modules) — all app logic, service worker, tests
- CSS (custom properties / design tokens) — styling via three split files
- HTML5 — single entry point `v2/index.html`

**Secondary:**
- JSON — data format for `rezepte.json` (Drive backend) and `manifest.webmanifest`

## Frameworks & Libraries

**Core:**
- None — pure Vanilla JS, no frontend framework (React/Vue/Svelte explicitly avoided)
- Native ES module imports (`type="module"`) throughout `v2/src/`

**Build/Dev:**
- None — zero build step. Files are served as-is. No npm, no bundler, no transpiler.
- Local dev: `python3 -m http.server` or equivalent static server

**PWA:**
- Service Worker (`v2/sw.js`) — cache version `koch-v2.7-3`, network-first for `index.html`, cache-first for static assets
- Web App Manifest (`v2/manifest.webmanifest`) — standalone display, portrait orientation

## Runtime Environment

**Browser APIs used:**
- `IndexedDB` (`v2/src/data/db.js`) — local-first storage (stores: `recipes`, `plans`, `lists`, `kv`)
- `localStorage` — token persistence (`kochv2_token`, `kochv2_connected`, `kochv2_apikey`, `kochv2_model`)
- `Service Worker API` — offline shell caching
- `fetch` — Drive REST calls and Anthropic API calls (no axios, no SDK)
- `FormData` / `Blob` — multipart uploads to Drive

**Node.js (tests only):**
- Tests run via `node v2/tests/run.js` — no test framework dependency, custom runner at `v2/tests/runner.js`
- Node version: not pinned (no `.nvmrc` or `package.json` detected)

## Key Dependencies

**External scripts (loaded at runtime, not installed):**
- `https://accounts.google.com/gsi/client` — Google Identity Services (GIS), dynamically injected by `v2/src/data/drive.js`

**Fonts (CDN):**
- `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Karla:wght@400;500;600;700` — display and body typefaces
- Cached at runtime by service worker (cache-first)

**No npm dependencies** — `package.json` not present in `v2/`

## App Version

- Build stamp: `2026-06-14-v2.7` (defined in `v2/src/version.js`)
- App version: `2.7`

## File Structure (key files)

```
v2/
├── index.html               # Entry point — loads ES module src/app.js
├── manifest.webmanifest     # PWA manifest
├── sw.js                    # Service Worker (cache shell)
├── icon-192.png             # PWA icon
├── icon-512.png             # PWA icon
├── styles/
│   ├── tokens.css           # Design tokens (CSS custom properties)
│   ├── base.css             # Resets and global base styles
│   └── app.css              # Component and layout styles
├── src/
│   ├── app.js               # Bootstrap: SW registration, routing, data load
│   ├── router.js            # Client-side hash router
│   ├── store.js             # Global reactive state
│   ├── i18n.js              # i18n: DE/EN/ES/DA language switching
│   ├── flags.js             # Feature flags
│   ├── version.js           # Build stamp + changelog
│   ├── ai/
│   │   ├── gate.js          # BYOK key management + model selection
│   │   ├── client.js        # Anthropic API fetch wrapper (no SDK)
│   │   ├── parse.js         # AI response parsing
│   │   └── prompts.js       # Prompt templates
│   ├── data/
│   │   ├── db.js            # IndexedDB wrapper
│   │   ├── drive.js         # Google Drive API + GIS auth
│   │   ├── sync.js          # Sync orchestration (local ↔ Drive)
│   │   ├── decideSync.js    # Pure sync-conflict resolution logic
│   │   ├── schema.js        # Recipe schema + validation
│   │   ├── derive.js        # Derived data (filters, sorting)
│   │   ├── migrate.js       # Schema migrations
│   │   ├── baseLang.js      # Base recipe language overlays
│   │   ├── lager.js         # Pantry/fridge data logic
│   │   └── settings.js      # Theme and app settings
│   ├── features/
│   │   ├── cookbook/        # Recipe list, detail, form, export
│   │   ├── cooking/         # Cook mode (step-by-step, wake lock)
│   │   ├── match/           # Recipe matching / suggestions
│   │   ├── shopping/        # Shopping list (catalog, logic, UI)
│   │   ├── planner/         # Weekly meal planner
│   │   ├── assistant/       # AI assistant chat UI
│   │   ├── capture/         # Photo/URL recipe import (AI)
│   │   ├── lager/           # Pantry/fridge UI
│   │   ├── guide/           # In-app help/changelog
│   │   ├── settings/        # Settings screen
│   │   └── onboarding/      # Language selection modal
│   └── ui/
│       ├── sheet.js         # Bottom-sheet component
│       └── helpers.js       # DOM utility helpers (esc, etc.)
└── tests/
    ├── run.js               # Test entry point: node v2/tests/run.js
    ├── runner.js            # Custom assertion runner (no external deps)
    ├── test-schema.js
    ├── test-derive.js
    ├── test-migrate.js
    ├── test-filter.js
    ├── test-planner.js
    ├── test-shopping.js
    ├── test-ai.js
    ├── test-capture.js
    ├── test-lager.js
    ├── test-i18n.js
    ├── test-baselang.js
    ├── test-sw-shell.js
    ├── test-decide-sync.js
    └── test-canonical.js
```

---

*Stack analysis: 2026-06-16*
