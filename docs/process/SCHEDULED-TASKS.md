# The scheduled tasks

All logic lives in the repo (`.claude/skills/*`). The scheduled task prompt only starts the role and
adds what an unattended run needs. Each task: **no connectors**, model = default (Sonnet 5.5), push
notification on. **Allowed tools:** Bash, Read, Write, Edit, Glob, Grep, plus **`Task`** for Reviewer,
Release prep and Proposer digest (they spawn the `koch-*` agents; without it the guard pass silently
can't run). WebFetch/WebSearch are not needed.

> **Status 2026-11-10:** this page describes the **proposed** setup (second version). The live tasks
> still run the 27 Oct prompts and times shown in the last column until Marcel confirms
> (`docs/questions/2026-11-10/1-pipeline.md`). Reasons for every change: `AGENT-PIPELINE.md` §8 and §11.

| Task | Schedule (Europe/Berlin) | Cron | Live today |
|------|--------------------------|------|------------|
| Citchen · Refiner | Mon, Wed, Fri night 00:20 | `CRON_TZ=Europe/Berlin 20 0 * * 2,4,6` | Mon + Thu 07:39 |
| Citchen · Builder | every night 00:50 | `CRON_TZ=Europe/Berlin 50 0 * * *` | 01:42 |
| Citchen · Reviewer | every night 02:20 | `CRON_TZ=Europe/Berlin 20 2 * * *` | 06:58 |
| Citchen · Release prep | Saturday 05:40 | `CRON_TZ=Europe/Berlin 40 5 * * 6` | Sat 08:17 |
| Citchen · Release retry *(new)* | Wednesday 05:40 | `CRON_TZ=Europe/Berlin 40 5 * * 3` | — |
| Citchen · Proposer digest | 1st of the month 10:17 | `CRON_TZ=Europe/Berlin 17 10 1 * *` | same |

Cron days: `2,4,6` at 00:20 are the nights *after* Monday, Wednesday and Friday.

**Why this order.** Refiner → Builder → Reviewer, all in one night: an answer you give during the day
is turned into a ready issue at 00:20, built at 00:50 and (CI takes about 6 minutes) reviewed and
merged at 02:20. Before, the same path took up to four days. All three run inside one 5-hour usage
window that has reset before you get up, so your own sessions start with a full window. Release prep
is the one heavy run (Opus subagents) and gets its own window early on Saturday; the release PR is
waiting when you have time for the device test.

**Every prompt starts on `next`.** Scheduled sessions clone `main`, but merged work and pipeline fixes
live on `next`. Only PRs that Marcel merges can change `.claude/` there (the `policy` check blocks
agent PRs), so this is as safe as reading from `main` and removes the wait for the next release.

---

## Citchen · Builder
```text
Unattended nightly run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask:
decide, and record your reasoning in the PR or issue.

First: git fetch origin && git switch --detach origin/next
Then run the project skill /build-next: read .claude/skills/build-next/SKILL.md from this checkout and
follow it exactly. If that file does not exist, stop and report "pipeline skills missing".

Constraints for this run: GitHub via REST only (gh api repos/Marcipane3/Citchen/...). One issue or one
fix at most. If you are still red after 3 fix cycles, open a draft PR and stop. Your final message is the
one-line result from the skill plus queue health.
```

## Citchen · Reviewer
```text
Unattended night run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

First: git fetch origin && git switch --detach origin/next
Then run the project skill /review-pr: read .claude/skills/review-pr/SKILL.md from this checkout and
follow it exactly. You only ever merge into `next`, never into `main`. You never write or push code.
If the skill file is missing, stop and report "pipeline skills missing".

Final message: one line per PR (merged / changes / needs-human / skipped + reason).
```

## Citchen · Refiner
```text
Unattended run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask:
questions for Marcel go into the issue as described in the skill.

First: git fetch origin && git switch --detach origin/next
Then run the project skill /refine: read .claude/skills/refine/SKILL.md from this checkout and follow it
exactly. Target: 3 ready issues. No code, no roadmap edits, never promote status:proposed.
If the skill file is missing, stop and report "pipeline skills missing".

Final message: ready issues, open questions for Marcel (with issue links), buffer k/3.
```

## Citchen · Release prep
```text
Unattended weekly run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

First: git fetch origin && git switch --detach origin/next
Then run the project skill /release-prep: read .claude/skills/release-prep/SKILL.md from this checkout
and follow it exactly. You prepare the release; you never merge into main. Marcel merges the release
PR, which deploys. If the skill file is missing, stop and report "pipeline skills missing".

Final message: "Release PR #N v2.x ready: k issues, ~X min device test", or the NO-GO reasons
with issue links, or "Nothing to release".
```

## Citchen · Release retry
Same task settings as Release prep (it needs `Task`).
```text
Unattended mid-week run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

First: git fetch origin && git switch --detach origin/next
Then run the project skill /release-prep in retry mode: read .claude/skills/release-prep/SKILL.md from
this checkout and follow it exactly, including the "Retry mode" gate in step 0. You never merge into main.
If the skill file is missing, stop and report "pipeline skills missing".

Final message: "No retry needed", "Retry waits for #N", or the normal release-prep result.
```

## Citchen · Proposer digest
```text
Unattended monthly run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

First: git fetch origin && git switch --detach origin/next
Then run the project skill /propose: read .claude/skills/propose/SKILL.md from this checkout and follow
it exactly. You only create status:proposed issues; you write no files and edit no roadmap.
If the skill file is missing, stop and report "pipeline skills missing".

Final message: "Digest YYYY-MM: k proposals #a #b …, m dropped", or the STOP line.
```

> Why the 1st of the month and not "first Saturday": cron ORs day-of-month and day-of-week, so
> `1-7 * 6` would fire on days 1–7 *and* on every Saturday.
