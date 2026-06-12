# Koch v2 — Personal Cookbook PWA

A personal, offline-first cookbook app with optional AI features via Bring Your Own Key (BYOK).
Lives at the `/v2` path of this repo (v1 stays live at the repo root).

## Features
- 📖 **Recipe browser** with search (name/ingredient), category/cuisine/season filters, favorites & ratings
- ✏️ **Recipe capture**: manual entry, photo scan (AI vision), URL import (AI via web_fetch)
- 👨‍🍳 **Cooking mode**: full-screen steps, live portion scaler, per-step timers, screen wake-lock
- 🗓️ **Weekly meal planner**: deterministic generator (everyday/weekend slots, rotation, lock a day,
  reroll, pick from cookbook, leftover days) — plus an optional AI tweak
- 🛒 **Shopping list**: auto-generated from the meal plan or any recipe; in-stock items subtracted
- 📦 **Lager**: always-on pantry (on/off toggles) + fridge fresh items with AI photo scan
- 🔥 **Koch-Match**: Tinder-style swipe discovery
- 🌍 **Multilingual**: German (default), English, Spanish — switch any time, no reload
- 🤖 **AI features** powered by your own Anthropic API key (stored locally, sent only to Anthropic)

## AI Features (BYOK)
All AI features require an Anthropic API key:
1. Settings → enter your API key from [console.anthropic.com](https://console.anthropic.com)
2. The key is stored only in your browser's `localStorage` — never synced to Drive, never logged
3. Unlocks: recipe photo scan, URL recipe import, fridge photo scan, AI recipe suggestions & plan tweaks

The free tier (cookbook, cooking mode, planner, shopping list, Lager) works fully offline with **no key**.

## No backend, no account, no tracking
This app has no server. Recipe data lives in your browser (IndexedDB) and, when you sign in,
syncs to a single `rezepte.json` in your Google Drive (`drive.file` scope, in-place update).
AI calls go directly from your browser to the Anthropic API.

## Tech
- Vanilla JS + Web Components, **native ES modules, no bundler / no build step**
- PWA: installable, offline-capable (service worker + IndexedDB)
- Data: IndexedDB (recipes/plans/lists/settings); small flags in `localStorage`
- AI: Anthropic API direct from the browser — `claude-sonnet-4-6` for vision (photo/fridge scan,
  URL import via the `web_fetch` server tool), `claude-haiku-4-5` (default) / `claude-sonnet-4-6`
  for text generation. Model picker in Settings.
- Schema: flat v3 (`SCHEMA.md`) — string ingredients, single `tips` string, 16 fixed categories;
  fully compatible with v1 so both apps share the same Drive file.

## Run locally
No build needed — serve the repo and open `/v2/`:
```
python -m http.server 8010
# → http://localhost:8010/v2/
```
Tests (no deps, offline): `node v2/tests/run.js`

## Deploy
Push to `main`; GitHub Pages serves `/v2` automatically. Bump `CACHE` in `sw.js` and `BUILD`
in `src/version.js` on each release so installed clients update on the next load.
