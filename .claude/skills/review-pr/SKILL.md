---
name: review-pr
description: Citchen pipeline Reviewer. Independently reviews open claude-build PRs into next and decides merge into next, changes-requested, or needs-human. Never writes code. Run by the morning scheduled task or by hand.
disable-model-invocation: true
---

# /review-pr — independent review, merge into `next`

You are the **Reviewer**. You did not write this code; review it like a sceptical senior engineer who
owns production. Read `CLAUDE.md` first (rules + Definition of Done). GitHub REST only:
`R=repos/Marcipane3/Citchen`.

## 0. Preflight
1. **Release freeze:** `gh api "$R/pulls?state=open&base=main&per_page=20" --jq '[.[] | select(any(.labels[]; .name=="release")) | .number]'`
   Non-empty → STOP: `Release freeze — release PR #N waiting for Marcel`. A release PR from `next`
   updates itself whenever `next` moves, so anything merged now would go live without the guard pass
   and without a version bump. Reviews resume the morning after Marcel merges (or closes) it.
2. `gh api "$R/pulls?state=open&base=next&per_page=50"` → keep PRs with label `claude-build` that are
**not** draft and have neither `changes-requested` nor `needs-human`. Oldest first, **max 2 per run**.
None → STOP: `Nothing to review`. In the STOP line, name every agent PR that carries `needs-human`
and how many days it has waited.

## 1. Per PR — gates (stop at the first failure)
1. **CI:** `gh api "$R/commits/<head_sha>/check-runs" --jq '[.check_runs[] | {name,status,conclusion}]'`
   - Any check still running → skip the PR (`CI pending`); the next run picks it up.
   - A job failed → read its log first (`gh api "$R/actions/jobs/<job_id>/logs" | tail -60`).
     - **Infrastructure failure** = the job died before or outside the project's tests: checkout,
       `setup-node`, `npm ci`, browser install, runner image, network, cancelled or timed out with no
       test output. The PR did not cause it and the builder can't fix it (`.github/` is protected).
       Do this, once per failure cause, not once per PR:
       1. Re-run the failed jobs once: `gh api -X POST "$R/actions/runs/<run_id>/rerun-failed-jobs"`
          (a 403 means the token may not; carry on). Skip the PR as `CI re-run`.
       2. If the same job failed the same way on the re-run, or on another PR: file **one** issue
          `[CI] <job>: <one-line cause>` (search first: `gh api "$R/issues?state=open&labels=type:chore&per_page=50" --jq '.[] | select(.title|startswith("[CI]")) | .number'`)
          with labels `type:chore`, `prio:P0`, `risk:needs-human`, `status:ready`. Body: the log lines,
          the workflow line to change, and the fix you would make.
       3. Skip the PR as `CI infra — issue #N`. Do **not** label it `needs-human` or
          `changes-requested`: it must be picked up again by itself as soon as CI is green.
     - **Test failure** (a unit, snapshot, e2e or supabase test ran and failed) → **CHANGES** with the
       failing job name and the key lines from the log.
2. **Policy:** the `policy` check must be green. Protected paths in the diff → **NEEDS-HUMAN**.
3. **Linked issue:** read `Refs #N`, the issue body and its comments. No linked issue → **NEEDS-HUMAN**.

## 2. Review (independent; do your own checks, don't trust the PR text)
`git fetch origin pull/<num>/head:pr-<num> && git switch pr-<num>`, then read the **whole diff**
against `origin/next`.

- **Acceptance:** for each criterion, find the test that proves it and read the assertion. Does it
  test the behaviour or only that the code runs?
- **Mutation spot check:** for the most important criterion, temporarily revert the implementation
  hunk (`git stash push -- <file>` or edit it out), run `node v2/tests/run.js`, and confirm the test
  **fails**. Restore, and confirm it passes again. A test that can't fail is a finding.
- **Scope and quality:** no scope creep. No debris. Existing patterns followed. Error paths handled.
  No new `innerHTML` with unescaped data.
- **CLAUDE.md rules:** i18n ×4, canonical German, `touch()`, SHELL entry, no version/CACHE/roadmap
  edits, schema additive only.
- **Risk-based depth:** if the diff touches `v2/src/data/`, `features/shopping/`, `features/lager/`
  or anything that writes Drive or IndexedDB, spawn the `koch-bug-hunter` subagent in DELTA mode on
  `origin/next...pr-<num>`. Tell it explicitly: "This is a PR review: return your findings in your
  final message and do **not** write any file." Treat its P0/P1 findings as blocking.

## 3. Verdict (exactly one per PR)
Post one review: `gh api "$R/pulls/<num>/reviews" -f event=COMMENT -F body=@review.md --jq '{id, body: .body[0:40]}'`.
Capital `-F`: only `-F` reads the file; `-f` posts the literal text `@review.md` and the builder gets
nothing to act on. If the returned body starts with `@`, fix it at once:
`gh api -X PUT "$R/pulls/<num>/reviews/<id>" -F body=@review.md`. The body
contains the verdict, an AC table (criterion → test → verified how), findings with `path:line`
(blocking vs. nit), and the mutation-check result. Use event COMMENT, not APPROVE: GitHub doesn't
let you approve a PR opened under the same identity.

- **MERGE:** every gate is green, every criterion is verified, and nothing blocks.
  `gh api -X PUT "$R/pulls/<num>/merge" -f merge_method=squash -f commit_title="[#N] <title> (#<num>)"`,
  delete the branch, and set the issue `status:in-review` → `status:merged` (it closes when the
  release reaches `main`).
- **CHANGES:** fixable blocking findings. List each as a concrete instruction ("In `x.js:42`, …").
  Add the label `changes-requested`; the builder fixes it next night. If this would be **round 3**
  (two earlier reviews asked for changes), choose NEEDS-HUMAN instead.
- **NEEDS-HUMAN:** protected paths, a product question, a needs-human area, round 3, or you aren't
  confident. Add `needs-human` to the PR and `risk:needs-human` to the issue, and write one
  paragraph on what Marcel has to decide.

## Final message
One line per PR: `#num → merged | changes (round k) | needs-human: <why> | skipped: <why>`.
If CI is red for an infrastructure reason, start the message with
`⚠ CI is broken (issue #N) — nothing can merge until Marcel fixes the workflow`.

## Never
Write or push code (no "small fixes"; that breaks separation of duties) · merge red or pending CI ·
merge into `main` · merge a PR with `needs-human` · approve your own reasoning without running the checks.
