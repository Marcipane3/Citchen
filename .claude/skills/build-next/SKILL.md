---
name: build-next
description: Citchen pipeline Builder. Fixes an agent PR marked changes-requested, otherwise builds exactly one status:ready issue test-first and opens a PR into next. Run by the nightly scheduled task or by hand.
disable-model-invocation: true
---

# /build-next — one issue → one PR into `next`

You are the **Builder**. Read `CLAUDE.md` first: rules, commands and the Definition of Done are there
and are binding. Repo: `Marcipane3/Citchen`. Use **GitHub REST only**: `gh api repos/Marcipane3/Citchen/...`.
Never use `gh pr list` or `gh issue list`; they use GraphQL, which fails here.
`R=repos/Marcipane3/Citchen` below.

## 0. Preflight (cheap; stop early)

1. **Open agent PRs into `next`:**
   `gh api "$R/pulls?state=open&base=next&per_page=50" --jq '[.[] | select(any(.labels[]; .name=="claude-build")) | {number, draft, labels:[.labels[].name], head:.head.ref}]'`
   - One has `changes-requested` and not `needs-human` → **Fix mode** (§F). Do only that tonight.
   - Any other open `claude-build` PR → STOP: `WIP limit — PR #N waiting for review`.
2. **Ready issues:**
   `gh api "$R/issues?state=open&labels=status:ready&per_page=50" --jq '[.[] | select(.pull_request|not) | {number,title,labels:[.labels[].name],milestone:.milestone.due_on}]'`
   Drop issues labelled `risk:needs-human` (they are built with Marcel, interactively).
   None left → STOP, with one line of queue health: the counts of `status:planned`,
   `status:needs-input` and `status:proposed`, plus the numbers of needs-input issues waiting for Marcel.
3. **Pick one:** earliest milestone `due_on` (no milestone = last) → `prio:P0` < P1 < P2 < P3 → lowest number.
4. **Re-check the Definition of Ready** (docs/process/AGENT-PIPELINE.md §4). Acceptance criteria must be
   a testable checklist, size must be S/M, and every `Depends on #N` must be closed or `status:merged`.
   If it fails: set `status:planned`, comment exactly what is missing, and try the next candidate
   (at most one fallback), then STOP.

## 1. Claim
- Labels: remove `status:ready`, add `status:in-progress`
  (`gh api -X DELETE "$R/issues/N/labels/status:ready"`; `gh api "$R/issues/N/labels" -f "labels[]=status:in-progress"`).
- `git fetch origin && git switch -c build/<N>-<short-slug> origin/next`

## 2. Understand (read narrowly)
Read the issue body and its comments, the files named under *Scope*, their tests, and only what those
files import. Don't read the roadmaps. Note in your head which test proves which acceptance criterion.

## 3. Test first
For each acceptance criterion, write the test first and watch it fail. Use unit tests in
`v2/tests/test-*.js` (register them in `v2/tests/run.js`). Add or extend an e2e spec only if the
criterion is a UI flow. Prefer testing pure modules (`data/`, `features/*/logic.js`).

## 4. Implement
Smallest change that makes the tests pass, inside scope, following existing patterns. Apply the
CLAUDE.md rules (i18n ×4, canonical German, `esc()`, `touch()`, SHELL entry for new modules).
Do **not** touch `version.js`, `CACHE`, `ROADMAP*.md`, `supabase/`, `.github/`, `.claude/` or `CLAUDE.md`.

## 5. Verify (max 3 fix cycles)
`node v2/tests/run.js` → `node v2/tools/check-snapshots.mjs` → `npm --prefix v2/e2e ci` (once) →
`npm --prefix v2/e2e test`. Then self-review `git diff origin/next...HEAD` against each criterion and
the scope. Remove debris.
Still red after 3 cycles → go to §6 with a **draft** PR, label the issue `status:blocked` and comment
on what blocks you.

## 6. Pull request
- Commit: `feat(#N): <what>` (or `fix(#N)` / `chore(#N)`). End with the attribution lines your
  environment provides.
- `git push -u origin HEAD`
- Create the PR: `gh api "$R/pulls" -f base=next -f head=<branch> -f title="[#N] <issue title>" -F draft=<true|false> -f body=@body.md`
  Body follows `.github/pull_request_template.md`: `Refs #N` (not "Closes", which only works on `main`),
  an AC table (criterion → test name → result), what changed and why, risks, anything left out of scope.
- Labels: PR gets `claude-build`; issue goes `status:in-progress` → `status:in-review`.

## F. Fix mode (PR with `changes-requested`)
Check out its branch, read every review comment since the last push, and fix only those points
(same verify loop). Push, reply to the review summarizing each fix, and remove the
`changes-requested` label. If the review asks for something outside the issue's scope, don't build
it. Say so in your reply.

## Final message (always)
One of: `Built #N → PR #M (green)` · `Draft PR #M for #N — blocked: <why>` · `Fixed PR #M (round k)` ·
`Stopped: <reason>`, plus queue health.

## Never
Merge anything · push to `next`/`main` · work on two issues · skip, weaken or delete a test ·
add an app dependency or third-party script · call production Drive/Supabase/Anthropic.
