# Release-Captain — VERDICT: GO ✅
_2026-11-28 (UTC) · baseline ed0a8b3 (v2.19 release commit on origin/main, BUILD 2026-11-21-v2.19, CACHE koch-v2.19-1) → candidate HEAD e39acc6 + uncommitted v2/src/version.js and v2/sw.js · BUILD 2026-11-28-v2.20 · CACHE koch-v2.20-1 · tests 718/718_

Compared `git diff origin/main -- v2/` (HEAD, 37 files) plus the uncommitted bump. Branch: release-bump/2.20-r2.

## Gate
- [✅] 1. Suite green: `node v2/tests/run.js` 718 passed, 0 failed. e2e not run: `v2/e2e/node_modules` is missing (see warnings).
- [✅] 2. BUILD bumped: `2026-11-21-v2.19` to `2026-11-28-v2.20` (v2/src/version.js:2). `APP_VERSION "2.20"` (:3) is consistent. CHANGELOG has a v2.20 entry at the top (:8).
- [✅] 3. SW cache bumped: `koch-v2.19-1` to `koch-v2.20-1` (v2/sw.js:21).
- [✅] 4. Shell completeness: a loop over every tracked `v2/src/**/*.js` against the literal SHELL strings found 0 missing. The three new modules (`data/moveFile.js`, `features/settings/move.js`, `data/nutritionGoal.js`) are in SHELL. `data/ingredients.json`, the snapshots and styles are listed. `add.html` stays deliberately excluded and documented (v2/sw.js:23-25).
- [✅] 5. Manifest & icons: manifest parses. `start_url "./"`, `scope "./"`. `icon-192.png` and `icon-512.png` exist.
- [✅] 6. Paper trail: CHANGELOG v2.20 is present. ROADMAP.md and ROADMAP-V2.md mark v2.20 shipped, with the release PR open. The queue is refilled.
- [✅] 7. Secrets / debris: the diff has no `service_role`, `client_secret`, `eyJ`, `console.log` or `debugger`. There are two `sk-ant-` hits, both test fixtures: `sk-ant-e2e-not-a-real-key` in the e2e spec, and `sk-ant-api03-GEHEIM-nicht-in-die-datei` in `v2/tests/test-move-file.js`. The second is a fake value that checks the move file excludes keys.
- [✅] 8. Uncommitted noise: under `v2/` only version.js and sw.js, both intended bump files. No untracked files. Changes outside `v2/` (ROADMAP*.md, qa/findings/*) don't affect the deploy.

## Blocking (fix before push)
none

## Warnings (won't block)
- e2e not run: `v2/e2e/node_modules` is missing. Run `npm --prefix v2/e2e ci && npm --prefix v2/e2e test`, or confirm CI is green on the release PR. This release adds the specs 16-assistant-edit, 17-move and 18-nutrition-goal, and extends 14-import-file.
- The SW activate step now only deletes caches whose names start with `koch-v2` (v2/sw.js, around the `retired` filter). This looks deliberate, since the move helper shares an origin, but it is unusual. Check that it is intended.
- `test-sw-shell.js` still doesn't guard `data/*.json` (carried over from RC-02, optional, effort S).

## Definition drift
none
