# Koch v2 — End-to-end tests (P2)

Browser tests that click through the real app the way Marcel uses it, in Chromium, with
[Playwright](https://playwright.dev). **Dev-only:** nothing in this folder is loaded by the app or
shipped to users. The unit suite (`node v2/tests/run.js`) stays the fast, dependency-free check;
this suite proves the flows work end to end in a browser.

## Run it

One-time setup (needs Node ≥ 18):

```bash
npm --prefix v2/e2e install
npx --prefix v2/e2e playwright install chromium   # skip in the Claude Code cloud: Chromium is preinstalled
```

Then, every time — **one command**:

```bash
npm --prefix v2/e2e test
```

About 30–60 s. It starts its own local server (port 4173; `E2E_PORT` changes it), needs **no
internet, no Google account and no API key**, and never touches real data.

Handy extras: `npm --prefix v2/e2e run test:headed` (watch the browser),
`npx --prefix v2/e2e playwright test tests/07` (one file), `npm --prefix v2/e2e run report`
(HTML report with screenshots + traces of failures).

## What it covers

| # | File | Flow |
|---|------|------|
| 1 | `01-first-run` | Fresh device: language picker, base recipes from the snapshot, tab bar, build stamp |
| 2 | `02-language` | DE → ES → DE: UI and base recipes switch live; stored data stays canonical German |
| 3 | `03-recipe-edit` | Add (with validation), search, edit, survive restart, delete; favourite / rating / cooked |
| 4 | `04-capture` | URL → AI draft → review form → save; what is sent to Anthropic; errors; no-key lock; bulk |
| 5 | `05-cooking` | Cooking mode: scale portions, tick steps (persisted), step-by-step, timer (fake clock) |
| 6 | `06-shopping` | Custom + catalog items, quantities, done, clear + undo, badge, restart; recipe → list |
| 7 | `07-partner-sync` | Two Google accounts share one list (I2): merge, adds, deletes, both offline, unlink |
| 8 | `08-recipe-sync` | `rezepte.json` across two devices: first upload, push, pull, conflict, last-write-wins |
| 9 | `09-offline` | Offline start from the service-worker cache: every view, data, language switch |
| 10 | `10-update` | Update from the **previous release** (from git history): new build arrives, old cache gone, data kept |
| 11 | `11-planner` | Weekly plan → lock / pick a day → restart → shopping list (lower priority) |

Every test also fails on any uncaught browser error (the v2.10 "blank app" class of bug).

## How it works

- `support/server.js` — tiny static server for the repo (the app runs at `/v2/` like on GitHub
  Pages). The service-worker tests get their own instance so they can "deploy" a different build
  (`setRoot`) and pull the plug (`setDown`).
- `support/fake-google.js` — in-memory Google: sign-in (GIS) hands out a token for the test user,
  `FakeDrive` implements the Drive REST calls the app makes (with the `drive.file` rule: an app
  only sees files it created or that were picked in the Picker), and a fake Picker. One
  `FakeDrive` per test is shared by all devices of that test → real multi-device / partner tests.
- `support/fake-anthropic.js` — answers `api.anthropic.com` with canned text and records each
  request so tests can check headers, model and prompt.
- `support/fixtures.js` — `device({ user, lang, server })` opens a fresh "phone" (own
  IndexedDB/localStorage). All other network traffic is blocked. `alert/confirm/prompt` are
  accepted and recorded in `device.dialogs`.
- `support/app.js` — all selectors and UI steps in one place. **When the UI changes, fix it here.**

**Offline, honestly.** Playwright's `setOffline()` does not reach faked responses or requests
made by the service worker. The fixtures therefore also fail the fakes and take the device's own
server down, so "offline" in these tests really means no network. One gap: in specs 09/10 (service
worker on) the worker may fetch the Google Fonts stylesheet itself, which Playwright cannot
intercept — harmless (fonts only, no data); without internet it simply fails and the app falls
back to system fonts.

## When to run / extend

- Before every release (the release-captain agent should see it green) and **before and after
  the P1 sync-core refactor** — specs 07 and 08 pin today's sync behaviour, including the known
  limits (file-level last-write-wins for recipes, conflict keeps the local change).
- New feature → add or extend a spec; keep selectors in `support/app.js`.
- **Known bugs are pinned, not skipped:** a test that shows a real, not-yet-fixed bug is marked
  `test.fail(true, "<why>")`. The suite stays green while the bug exists and reports
  "unexpectedly passed" the moment it is fixed → then delete the `test.fail` line.
  Currently one: linking the partner list while a push is in flight loses the link
  (`07-partner-sync`, fix belongs to P1).
- Not covered yet: the friends link (I3, Supabase), the AI assistant chat, Lager photo scan,
  swipe match. Add them the same way (fake the endpoint, drive the UI).
