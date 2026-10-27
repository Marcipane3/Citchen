# The five scheduled tasks (new version)

All logic lives in the repo (`.claude/skills/*`). The scheduled task prompt only starts the role and
adds what an unattended run needs. Each task: **no connectors** (remove Gmail, Google Drive, Indeed,
Supabase, Claude Docs, visualize), model = default (Sonnet 5.5), push notification on.
**Allowed tools:** Bash, Read, Write, Edit, Glob, Grep, plus **`Task`** for Reviewer, Release prep and
Proposer digest (they spawn the `koch-*` agents; without it the guard pass silently can't run).
WebFetch/WebSearch are not needed.

| Task (existing) | New name | Schedule | Change |
|-----------------|----------|----------|--------|
| Builder Citchen | Citchen · Builder | `CRON_TZ=Europe/Berlin 42 1 * * *` (nightly 01:42) | prompt, schedule daily |
| Citchen Reviewer / Merger | Citchen · Reviewer | `CRON_TZ=Europe/Berlin 58 6 * * *` (daily 06:58) | prompt, merges into `next` only |
| Citchen Refiner | Citchen · Refiner | `CRON_TZ=Europe/Berlin 39 7 * * 1,4` (Mon + Thu 07:39) | prompt, twice a week |
| QA Auditor | Citchen · Release prep | `CRON_TZ=Europe/Berlin 17 8 * * 6` (Sat 08:17) | becomes guard pass + release candidate |
| (new) | Citchen · Proposer digest | `CRON_TZ=Europe/Berlin 17 10 1 * *` (1st of month 10:17) | architect + simplifier + ux-curator → ≤ 5 proposals |

Why this order: the reviewer merges at 06:58, so the refiner at 07:39 sees the freed slots, the builder
has fresh ready issues that night, and on Saturday morning the release PR is waiting when you have time
for the device test.

---

## Citchen · Builder
```text
Unattended nightly run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask:
decide, and record your reasoning in the PR or issue.

Run the project skill /build-next and follow .claude/skills/build-next/SKILL.md exactly.
If that file does not exist in this checkout, stop and report "pipeline skills missing".

Constraints for this run: GitHub via REST only (gh api repos/Marcipane3/Citchen/...). One issue or one
fix at most. If you are still red after 3 fix cycles, open a draft PR and stop. Your final message is the
one-line result from the skill plus queue health.
```

## Citchen · Reviewer
```text
Unattended morning run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

Run the project skill /review-pr and follow .claude/skills/review-pr/SKILL.md exactly.
You only ever merge into `next`, never into `main`. You never write or push code.
If the skill file is missing in this checkout, stop and report "pipeline skills missing".

Final message: one line per PR (merged / changes / needs-human / skipped + reason).
```

## Citchen · Refiner
```text
Unattended run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask:
questions for Marcel go into the issue as described in the skill.

Run the project skill /refine and follow .claude/skills/refine/SKILL.md exactly.
Target: 3 ready issues. No code, no roadmap edits, never promote status:proposed.
If the skill file is missing in this checkout, stop and report "pipeline skills missing".

Final message: ready issues, open questions for Marcel (with issue links), buffer k/3.
```

## Citchen · Release prep
```text
Unattended weekly run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

Run the project skill /release-prep and follow .claude/skills/release-prep/SKILL.md exactly.
You prepare the release; you never merge into main. Marcel merges the release PR, which deploys.
If the skill file is missing in this checkout, stop and report "pipeline skills missing".

Final message: "Release PR #N v2.x ready: k issues, ~X min device test", or the NO-GO reasons
with issue links, or "Nothing to release".
```

## Citchen · Proposer digest
```text
Unattended monthly run in the Citchen repo (Marcipane3/Citchen). Nobody is watching, so never stop to ask.

Run the project skill /propose and follow .claude/skills/propose/SKILL.md exactly.
You only create status:proposed issues; you write no files and edit no roadmap.
If the skill file is missing in this checkout, stop and report "pipeline skills missing".

Final message: "Digest YYYY-MM: k proposals #a #b …, m dropped", or the STOP line.
```

> Why the 1st of the month and not "first Saturday": cron ORs day-of-month and day-of-week, so
> `1-7 * 6` would fire on days 1–7 *and* on every Saturday.

