---
name: release-prep
description: Citchen pipeline release preparation. Twice-weekly (Wed + Sat) guard pass on next, version bump, roadmap update rule, release-captain GO/NO-GO, then opens the next→main release PR with a device-test checklist. Never merges to main.
disable-model-invocation: true
---

# /release-prep — release candidate (twice a week)

Runs **Wednesday and Saturday** (since 2026-11-19, Marcel: 4–6 h/week). Each run is a full release
prep sized to **one ~1 h device check**. There is no separate retry mode any more: after a NO-GO the
next run (3–4 days later) simply tries again.

You prepare what Marcel will put live. Read `CLAUDE.md`, `qa/AGENT-CONVENTIONS.md` and `ROADMAP.md`
(the "update rule" and the recommendation flow). GitHub REST only: `R=repos/Marcipane3/Citchen`.

## 0. Gate (cheap)
`git fetch origin` and `git log --oneline origin/main..origin/next`.
- Empty → STOP: `Nothing to release`.
- An open PR `next → main` labelled `release` already exists → STOP: `Release PR #N waiting for Marcel`.
- `git log --no-merges --oneline origin/next..origin/main` is non-empty (a hotfix landed on `main`) →
  STOP and report: "Open a PR main → next first." Use `--no-merges`: every release you merge leaves a
  merge commit on `main` that `next` never gets, and that one is expected.
- Any open PR into `next` labelled `claude-build` with green CI and no `changes-requested` →
  continue anyway. It rides the next release.
- **After a NO-GO:** check the newest merged PR from a `release-bump/*` branch:
  `gh api "$R/pulls?state=closed&base=next&sort=updated&direction=desc&per_page=30" --jq '[.[] | select(.merged_at and (.head.ref|startswith("release-bump/")))][0] | {title, body}'`.
  If its title contains `NO-GO` and a blocker issue it names is still open without `status:merged` →
  STOP: `Release waits for #N`. Otherwise continue as usual. (An older task prompt that says `retry`
  means the same as a normal run.)

## 1. Scope of the release
**First reconcile the labels.** PRs that Marcel merged by hand (interactive sessions, branches other
than `build/*`) never pass the Reviewer, so their issues keep an old status. For every PR merged into
`next` since the last release
(`gh api "$R/pulls?state=closed&base=next&sort=updated&direction=desc&per_page=50" --jq '[.[] | select(.merged_at) | {number, merged_at, body}]'`,
newer than the last release merge on `main`), read `Refs #N` (may list several) and set each of those
issues that is still open to `status:merged` (replace its old status label).

Then collect the issues merged since the last release: issues labelled `status:merged`, cross-checked
with `git log origin/main..origin/next` (`[#N]` or `#N` in commit titles). **Version** = their milestone (lowest if
mixed). Only fixes → patch `v2.N.1`. More than about **1 h** of device checks → include only the oldest
issues, leave the rest for the next run (Wednesday or Saturday), and say so (rule 5 "fits the slot").
Version names follow `ROADMAP-V3.md` §3: `v2.N` until the scope freeze, `v3.0-aN` / `v3.0-bN` for V3
slices and closed-test fixes (`BUILD` = `YYYY-MM-DD-v<version>`, `CACHE` = `koch-v<version>-1`).

## 2. Guard pass (QA on what is about to ship)
`git switch -c release-bump/<version> origin/next`. Run `node v2/tests/run.js`. Then spawn the
**gate subagents in parallel** (one message, one Task call each), in DELTA mode against
`origin/main..HEAD`, following their agent files and `qa/AGENT-CONVENTIONS.md`:
- `koch-bug-hunter`
- `koch-test-warden`
- `koch-data-guardian` — **only if** `git diff --name-only origin/main..HEAD` touches `v2/src/data/`,
  `v2/src/store.js`, `features/shopping/`, `SCHEMA.md` or `supabase/`. The recipe file and the shopping
  list are irreplaceable; this agent replays real input shapes, which the bug-hunter doesn't.

Treat a data-guardian P0/P1 exactly like a bug-hunter one. They may update their own `qa/findings/*.md` (that is their contract). **A new P0/P1 = NO-GO:** create
one issue per finding (`[BH-xx] …` or `[DG-xx] …`, labels `type:bug`, `source:qa`, `prio:P0|P1`, `status:ready`,
milestone = this version). That is the only case where an agent creates a ready issue directly: it is a
regression in unreleased code. Commit the findings files, open the bump PR anyway (step 4) without
the version bump, and STOP with a report. Title of that PR: `Release v<version> guard pass: findings
only (NO-GO, #a, #b)`; the next run keys on it (step 0). P2/P3 findings → issues with `status:proposed`.

## 3. Bump and docs (only if the guard pass is clean)
- `v2/src/version.js`: `BUILD` = `YYYY-MM-DD-v<version>`, `APP_VERSION`, and a `CHANGELOG` entry in
  plain user language (German, like the existing ones).
- `v2/sw.js`: `CACHE` = `koch-v<version>-1`.
- Apply the **update rule from ROADMAP.md** to `ROADMAP.md`, `ROADMAP-V2.md` (and `ROADMAP-V3.md`
  if touched): mark the items ✅ with version + date + issue numbers, add them to the shipped log,
  re-run the recommendation flow and refill "Recommended next" to 5, update "Last updated". Tick
  closed checks/stories in `docs/v3/03-QUESTIONS.md`.
- Spawn `koch-release-captain`. Its baseline is the last release on `main` and the candidate is this
  branch. **NO-GO** → fix purely mechanical blockers (a missing SHELL entry, a bump) once, then re-run
  it. Still NO-GO → STOP and report.

## 4. Two PRs
1. **Bump PR:** commit (`chore(release): v<version>`), push, open a PR `release-bump/<version>` →
   `next`. Wait for CI (poll check-runs every 60 s, max 20 min). If green, squash-merge it.
   (Agent-merging a bump PR is allowed: it contains only version, docs and findings files.)
2. **Release PR:** open a PR `next` → `main`, title `Release v<version> — <theme>`, label `release`.
   Body:
   - `Closes #a, #b, …` (every included issue; GitHub closes them when this merges into `main`)
   - Changelog (user language) and the release-captain verdict (GO + the check table)
   - **Device test checklist** for Marcel's phone, built from each issue's acceptance criteria as
     concrete taps (`Open … → tap … → expect …`), grouped by screen, with a total time estimate
   - Manual steps, if any (for example "apply migration X in Supabase before merging")
   - **How to merge:** "Create a merge commit" (not squash). **Rollback:** "Revert" on this PR;
     Pages redeploys the previous version in about 1 min.
   - **Merge before the next run:** while this PR is open nothing is merged into `next` (release
     freeze), and the next run (Wednesday or Saturday) stops at step 0. Merge, or close it, within ~3 days.

## Final message
`Release PR #N v<version> ready: k issues, ~X min device test` or `NO-GO: <reasons, issue links>` or
`Release waits for #N` or `Nothing to release`.

## Never
Merge into `main` · release with red CI or a NO-GO · include work that isn't on `next` · edit app
code beyond the version bump.
