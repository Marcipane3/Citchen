# Citchen (Koch) — project guide for Claude

Read this first, every session. It is short on purpose; details live in the files it points to.
If this file and the code disagree, the code wins. Note the drift in your final message.

## What this is
A personal cooking PWA ("Koch v2", becoming **Citchen** in V3) for Marcel, his partner and friends.
Live at `https://marcipane3.github.io/Citchen/v2/`. The root `index.html` is the legacy v1 app; leave
it alone unless asked.
Plans: `ROADMAP.md` (what's next, index) → `ROADMAP-V2.md` (v2.x line) · `ROADMAP-V3.md` (V3 line) ·
`docs/v3/` (decisions, ADRs). Data contract: `SCHEMA.md`.

## Stack (no build step, by design)
- Vanilla JS ES modules in `v2/src/`. No framework, no bundler, no npm for the app, no third-party scripts.
- Local-first: IndexedDB (`data/db.js`), cache-first service worker (`v2/sw.js`, `CACHE` + `SHELL`).
- Sync: Google Drive, scope `drive.file`: `rezepte.json` (recipes) and `einkaufsliste.json` (shopping
  list), through one engine (`data/syncCore.js` + `syncRules.js`; config in `sync.js` / `listSync.js`).
- Supabase: friends inbox only, token-checked RPCs, no table access (`data/friendInbox.js`,
  `supabase/migrations/`).
- AI: Anthropic API from the browser with the user's own key (BYOK). Model IDs live **only** in
  `v2/src/ai/models.js` (a test enforces this).
- i18n: DE/EN/ES/DA in `v2/src/i18n.js`. Stored data is canonical German; translations are display only.

## Map
`v2/src/app.js` (boot) · `router.js` · `store.js` · `data/` (persistence, sync, schema, merge) ·
`features/<area>/` (cookbook, cooking, shopping, planner, lager, capture, assistant, settings, …) ·
`ai/` · `ui/` · `v2/tests/` (unit, `run.js` lists every file) · `v2/e2e/` (Playwright) ·
`supabase/` (migrations + tests) · `qa/` (QA fleet) · `.claude/agents/` (the `koch-*` reviewers) ·
`.claude/skills/` (pipeline roles).
Ignore unless asked: `00_`–`05_*.md`, `Projektwissen1.md`, `files.zip`, `.planning/` (old tools and handoffs).

## Commands
```bash
node v2/tests/run.js                         # unit, offline, ~seconds — must stay green
node v2/tools/check-snapshots.mjs            # language snapshots valid
npm --prefix v2/e2e ci && npm --prefix v2/e2e test   # Playwright e2e (Chromium preinstalled in cloud)
bash supabase/tests/run.sh                   # migrations on a throwaway Postgres (needs Postgres ≥ 15)
python -m http.server 8011 --directory v2    # run the app locally
```

## Rules that are never broken
1. `rezepte.json` stays flat-v3 per `SCHEMA.md`; **additive fields only**. A format change is `risk:needs-human`.
2. Canonical German in stored data; `category` stays the German enum (`test-canonical.js`).
3. Shopping list: every edit calls `touch()`; deletes are tombstones.
4. Everything rendered from files or users goes through `esc()`. No `innerHTML` with raw data.
5. Every new `v2/src/**/*.js` module is added to `SHELL` in `v2/sw.js` (`test-sw-shell.js`).
6. New UI text in all four languages, with curly inner quotes.
7. No secrets in the repo. The Supabase publishable key is public by design; nothing else is.
8. Never call production Drive, Supabase or Anthropic from tests or scripts.
9. A test that fails is a bug to fix, never a test to skip or delete.

## Definition of Done (a PR into `next`)
- Each acceptance criterion of the issue is proven by a named test that fails without the change.
- Unit + e2e (+ supabase if touched) green locally and in CI.
- Rules above hold; diff stays inside the issue's scope; no debris (logs, temp files, commented code).
- **Not** in feature PRs: `BUILD`/`APP_VERSION`/`CHANGELOG` (`v2/src/version.js`), `CACHE` (`v2/sw.js`),
  any `ROADMAP*.md`. Release-prep does those once per release.

## How work flows (details: `docs/process/AGENT-PIPELINE.md`)
- Work queue = GitHub Issues with `status:*` labels; versions = milestones. Roadmaps are the plan, not the queue.
- Branches: `build/<issue>-<slug>` → PR into **`next`** (integration). `next` → **`main`** only through a
  weekly release PR that Marcel merges. `main` = production (GitHub Pages). Never push to `main` or `next`.
- Pipeline roles are skills: `/refine`, `/build-next`, `/review-pr`, `/release-prep`, `/propose` (monthly).
  While a `release` PR into `main` is open, nothing is merged into `next` (release freeze).
- **GitHub from Claude Code: REST only.** `gh api repos/Marcipane3/Citchen/...`. `gh pr list`,
  `gh issue list` and Projects use GraphQL and fail in cloud sessions.
- Agent PRs never touch `supabase/`, `.github/`, `.claude/`, `CLAUDE.md` (`.github/workflows/policy.yml` enforces it).
  Those changes happen with Marcel in an interactive session.

## Working with Marcel
- Marcel is an industrial engineer, not a full-time developer. Explain trade-offs in plain words and recommend one option.
- He writes German or English; answer in his language. Code comments may be German; docs are English.
- Device checks are his scarce resource. Bundle them into the release checklist, 2–3 h max per release.
