# External Integrations

**Analysis Date:** 2026-06-16

## Authentication

**Provider:** Google Identity Services (GIS)

- SDK URL: `https://accounts.google.com/gsi/client` (loaded dynamically at runtime)
- Auth flow: OAuth 2.0 implicit / token flow (no authorization code, no backend)
- Implementation: `v2/src/data/drive.js` — `initAuth()`, `login()`, `loadGis()`
- Scope: `https://www.googleapis.com/auth/drive.file` (minimal — only files created by the app)
- Client ID: `977952120262-lht1tbbinnj8kmehmvqe1dpu5gp7k8d8.apps.googleusercontent.com` (hardcoded in `v2/src/data/drive.js`)
- Token storage: `localStorage` under key `kochv2_token` (JSON: `{ t, e }` — access token + expiry)
- Silent renewal: attempted on app start only if device has connected before (`kochv2_connected` flag)
- Sign-in is optional — app runs fully offline without a token

**Token lifecycle:**
- Short-lived access token (TTL from GIS response, minus 60s buffer)
- No refresh token — user must re-authenticate after expiry (GIS popup)
- `logout()` in `v2/src/data/drive.js` clears token and `kochv2_connected` flag

## Storage / Backend

**Primary data store:** Google Drive (user's own Drive account)

- File: `rezepte.json` — single JSON file, the app's sole source of truth
- Known file ID: `1t6KRviicPspYVj9oFjsUTJ6n8kZLHP1y` (hardcoded in `v2/src/data/drive.js` as `KNOWN_FILE_ID`)
- Lookup strategy: known ID checked first; falls back to name search (`name='rezepte.json' and trashed=false`) if ID fails (404/403)
- Create-only-on-first-run: `createFile()` in `v2/src/data/drive.js` — never creates duplicates
- Update: PATCH in-place via `updateFile()` — same file ID always

**Local cache:** IndexedDB

- Database: `koch-v2` (version 1), managed by `v2/src/data/db.js`
- Stores: `recipes` (keyPath: `id`), `plans` (keyPath: `id`), `lists` (keyPath: `id`), `kv` (keyPath: `key`)
- Offline reads come from IndexedDB; Drive sync is opportunistic

**Sync logic:** `v2/src/data/sync.js` + `v2/src/data/decideSync.js`

- App boots from IndexedDB (instant, offline-safe)
- After auth, Drive is read and `decideSync()` resolves conflicts (pure function, tested in `test-decide-sync.js`)
- Conflict detection: local offline edits are not silently overwritten if Drive has also changed (v2.7 behaviour)

**Image files:** Also stored in Google Drive

- Upload: `uploadImage()` in `v2/src/data/drive.js` — multipart POST to Drive
- Retrieve: `imageUrl()` — fetches blob, creates object URL, cached in memory Map (`imgCache`)
- Delete: `deleteFile()` — Drive DELETE + cache eviction

## APIs

**Google Drive API v3**

- Base URL: `https://www.googleapis.com/drive/v3/files`
- Upload URL: `https://www.googleapis.com/upload/drive/v3/files`
- Auth: Bearer token in `Authorization` header
- Operations used:
  - `GET /files/{id}?fields=id,name,trashed` — check file exists
  - `GET /files?q=...&spaces=drive&fields=files(id,name)` — name search fallback
  - `GET /files/{id}?alt=media` — download JSON or image blob
  - `PATCH /upload/drive/v3/files/{id}?uploadType=media` — update file in-place
  - `POST /upload/drive/v3/files?uploadType=multipart` — create new file
  - `DELETE /files/{id}` — delete image
- Error handling: 401 clears token and re-throws; other errors throw `DriveError` with status code
- Never cached by service worker (`www.googleapis.com` and `accounts.google.com` are excluded)

**Anthropic Messages API (BYOK)**

- URL: `https://api.anthropic.com/v1/messages`
- API version header: `anthropic-version: 2023-06-01`
- CORS opt-in header: `anthropic-dangerous-direct-browser-access: true`
- Auth: user-supplied API key, stored in `localStorage` under `kochv2_apikey`, never sent to Drive
- Implementation: `v2/src/ai/client.js` — plain `fetch`, no Anthropic SDK
- Models available (defined in `v2/src/ai/gate.js`):
  - `claude-haiku-4-5` — default (fast, cheap)
  - `claude-sonnet-4-6` — optional (stronger, more expensive)
- Vision model (fixed): `claude-sonnet-4-6` — used for photo/fridge scan regardless of user model selection
- Server tool: `web_fetch_20260209` (max 3 uses) — used for URL recipe import (server-side fetch, avoids CORS)
- Feature gate: `isPremium()` in `v2/src/ai/gate.js` — AI features hidden if no key present
- Use cases: recipe capture from photo/URL (`v2/src/features/capture/`), AI assistant chat (`v2/src/features/assistant/`), pantry-based suggestions, meal planning help

## CDN / External Resources

**Google Fonts**

- Preconnect: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
- Stylesheet: `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Karla:wght@400;500;600;700&display=swap`
- Fonts: Fraunces (display headings), Karla (body/UI)
- Cached at runtime by service worker (cache-first) so they work offline after first load

## Deployment

**Hosting:** GitHub Pages (inferred from PWA HTTPS requirement and project setup)

- Required for: PWA install (`Add to Home Screen`), OAuth redirect origin validation, Service Worker registration
- No server-side logic — purely static file serving

## Environment Configuration

**No `.env` file** — all config is either hardcoded or user-supplied at runtime:

| Config | Location | Notes |
|--------|----------|-------|
| Google Client ID | `v2/src/data/drive.js` line 8 | Hardcoded constant `GOOGLE_CLIENT_ID` |
| Known Drive file ID | `v2/src/data/drive.js` line 11 | `KNOWN_FILE_ID` — fallback to name search if stale |
| Anthropic API key | `localStorage: kochv2_apikey` | User enters in Settings screen; never synced |
| Selected AI model | `localStorage: kochv2_model` | Defaults to `claude-haiku-4-5` |
| OAuth access token | `localStorage: kochv2_token` | Short-lived, auto-cleared on expiry |

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None (all integration is request/response, no event-driven webhooks)

---

*Integration audit: 2026-06-16*
