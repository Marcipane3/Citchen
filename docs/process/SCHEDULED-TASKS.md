# The scheduled tasks

All logic lives in the repo (`.claude/skills/*`). The scheduled task prompt only starts the role and
adds what an unattended run needs. Each task: **no connectors**, model = default (Sonnet 5.5), push
notification on. **Allowed tools:** Bash, Read, Write, Edit, Glob, Grep, plus **`Task`** for Reviewer,
Release prep and Proposer digest (they spawn the `koch-*` agents; without it the guard pass silently
can't run). WebFetch/WebSearch are not needed.

> **Status 2026-11-18.** Live check of all six tasks:
> - **Times** of Refiner, Builder and Reviewer were changed by Marcel on 12 Nov and run (Reviewer at :10,
>   not :20; both work). **Prompts are still the 27 Oct versions**: they run on `main`, so the pipeline
>   fixes and the release-prep retry mode on `next` are not used, and the Refiner still aims for 3.
>   Copy the prompts below into each task.
> - **Release prep failed on Sat 14 Nov** with "usage limit reached" at 07:51, about an hour before the
>   weekly allowance resets (Saturday 09:00, as Marcel reported on 10 Nov). A week of three-round nights plus
>   evening sessions most likely used up the weekly allowance. It now runs **Saturday 09:23**, after the reset.
> - **Release retry**, created from an agent session on 16 Nov, **failed on Wed 18 Nov: no repo access**
>   (`gh api` 403; `add_repo` is not available inside scheduled runs). That confirms the 11 Nov test: a task
>   created by an agent session cannot work. It was deleted; **Marcel creates it** at
>   claude.ai/code/routines with the repo attached, `Task` allowed and the prompt below.
>
> - **Planned change (Marcel, 18 Nov): two releases a week.** The Wednesday 07:50 run becomes a full release
>   prep (not retry-only), so releases go out Wednesday + Saturday. Marcel edits the task at
>   claude.ai/code/routines; the `/release-prep` skill's retry-mode wording is updated in the same interactive
>   session. Until then releases stay weekly. Watch the weekly allowance: release prep is the heavy run.
>
> Every task: repository `Marcipane3/Citchen`, no connectors, model Sonnet 5.5, push notification on.
> Reasons for every change: `AGENT-PIPELINE.md` §8 and §11.

| Task | Schedule (Europe/Berlin) | Cron | `Task` tool |
|------|--------------------------|------|-------------|
| Citchen · Refiner | every night 01:30 | `CRON_TZ=Europe/Berlin 30 1 * * *` | no |
| Citchen · Builder | 02:10, 04:10, 06:10 | `CRON_TZ=Europe/Berlin 10 2,4,6 * * *` | no |
| Citchen · Reviewer | 03:10, 05:10, 07:10 | `CRON_TZ=Europe/Berlin 10 3,5,7 * * *` | **yes** |
| Citchen · Release prep | Saturday 09:23 | `CRON_TZ=Europe/Berlin 23 9 * * 6` | **yes** |
| Citchen · Release retry | Wednesday 07:50 | `CRON_TZ=Europe/Berlin 50 7 * * 3` | **yes** |
| Citchen · Proposer digest | 1st of the month 10:17 | `CRON_TZ=Europe/Berlin 17 10 1 * *` | **yes** |

The Refiner prompt below already says "Target: 5": three builder runs a night empty a buffer of three.

**Why these times.** Refiner → Builder → Reviewer, three rounds a night: an answer given during the
day is refined at 01:30, built at 02:10 and merged at 03:10; up to three issues a night instead of one.
Scheduled runs and your own sessions share one 5-hour usage window, and on 10 Nov a long evening
session used it up, so the 01:42 builder was rejected ("usage limit reached"). A window you open at
21:00 has reset by 02:00, which is why nothing starts before 01:30. The last reviewer at 07:20 leaves
you a window that is already running when you start and resets at 12:10. Release prep (the one heavy
run, Opus review agents) runs on Saturday right after the weekly allowance resets.

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
exactly. Target: 5 ready issues (replaces the 3 in the skill). No code, no roadmap edits, never promote status:proposed.
If the skill file is missing, stop and report "pipeline skills missing".

Final message: ready issues, open questions for Marcel (with issue links), buffer k/5.
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
