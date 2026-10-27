---
name: propose
description: Citchen pipeline monthly proposer digest. Runs the three idea agents (architect, simplifier, ux-curator) in DELTA mode over the last month of merged work and turns at most 5 strong findings into status:proposed issues for Marcel. Writes no files, no code, no roadmap edits.
disable-model-invocation: true
---

# /propose — monthly ideas, as proposals Marcel can accept with one label

You feed the queue with *ideas*, not regressions (those are release-prep's guard pass). Read `CLAUDE.md`
and `qa/AGENT-CONVENTIONS.md`. GitHub REST only: `R=repos/Marcipane3/Citchen`.

## 0. Gate (cheap)
1. `git fetch origin`. Baseline = the newest issue with label `source:qa` whose title starts with
   `[digest` (`gh api "$R/issues?state=all&labels=source:qa&per_page=100" --jq '[.[] | select(.title|startswith("[digest")) | .created_at] | max'`).
   No such issue → baseline = 31 days ago.
2. `git log --oneline --since=<baseline> origin/next -- v2/` empty → STOP: `Nothing new since <date>`.
3. More than 8 open issues labelled `status:proposed` → STOP: `Backlog full: k proposals waiting for Marcel`.
   Ideas nobody reads are waste; let Marcel catch up first.

## 1. Run the proposers
Spawn **three subagents in parallel** (one message, one Task call each), DELTA mode against
`<baseline commit>..origin/next`, each following its agent file and `qa/AGENT-CONVENTIONS.md`:
`koch-architect`, `koch-simplifier`, `koch-ux-curator`.
Tell each explicitly: "This is the monthly digest: return your findings in your final message and do
**not** write any file."

## 2. Select (max 5)
- Drop anything already covered by an open issue (search titles and bodies for the finding's file or
  ID) or by a row in `ROADMAP*.md` (`grep` the key term; don't read whole files).
- Merge the same issue seen by several agents into one (list all IDs).
- Rank by impact × confidence; prefer E1/E2 evidence. Keep at most **5**.

## 3. File the issues
One issue per kept finding, using the fields of `.github/ISSUE_TEMPLATE/work-item.yml`: Why (incl. the
agent IDs, e.g. `AR-04 = SI-02`), Acceptance criteria (testable checklist), Scope, Out of scope.
Labels: `status:proposed`, `source:qa`, `type:*`, a suggested `prio:*`. Title `[<first ID>] <title>`.
Then one tracking issue `[digest YYYY-MM] Proposer digest` (labels `source:qa`, `type:chore`) that lists
the new issues and, in one line each, what you dropped and why. Close it right away; it is the
baseline marker for next month.

## Final message
`Digest YYYY-MM: k proposals #a #b …, m dropped` or the STOP line.

## Never
Write files or commit · edit `ROADMAP*.md` · set any status other than `status:proposed` · more than
5 proposals per run.
