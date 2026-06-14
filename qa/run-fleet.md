# Runbook: run the Koch QA fleet

This is the script the orchestrating Claude (or a scheduled routine) follows to run all five agents
and synthesise their output. Read-only on app code; writes only under `qa/`.

## Steps

1. **Baseline.** Run `node v2/tests/run.js` and note `pass/total` and the `BUILD` from
   `v2/src/version.js`. Pass both to every agent so reports are stamped consistently.

2. **Spawn all five agents in parallel** (one message, five `Agent` calls). Give each the same
   preamble plus its lens:
   - `koch-bug-hunter`, `koch-architect`, `koch-simplifier`, `koch-ux-curator`, `koch-test-warden`.
   - Each agent already knows its job from `.claude/agents/koch-*.md`; the spawn prompt only needs:
     *"Audit the Koch v2 app under `v2/` per your definition. Build `<BUILD>`, suite `<pass>/<total>`.
     Overwrite your `qa/findings/<name>.md` with a fresh timestamped report. Read-only on app code."*

3. **Synthesise.** After all five return, write `qa/FLEET-REPORT.md`:
   - `# Koch Fleet Report — <UTC timestamp>` · build + suite line.
   - **Top issues across the fleet** — dedupe overlapping findings (e.g. bug-hunter + simplifier both
     pointing at the duplicated header), rank by severity×impact, keep `file:line` and the one-line fix.
   - **By agent** — a 2–3 line digest + link to each `qa/findings/*.md`.
   - **Promotable to ROADMAP** — a shortlist already shaped as roadmap rows (item · why · pri · eff).
     Do NOT edit `ROADMAP.md` — leave promotion to Marcel.

4. **Report back** to the user: counts by severity, the single highest-value finding, and whether the
   suite is green. Keep it short.

## Ready-made overnight schedule (activate only on Marcel's OK)

Cloud nightly (true unattended, consumes usage) — via the `/schedule` skill:

```
/schedule create
  name: koch-qa-fleet-nightly
  cron: 17 3 * * 2,5        # ~03:17 local, Tue & Fri (off-peak minute, twice a week)
  prompt: |
    Run the Koch QA fleet following qa/run-fleet.md in the Koch_Project repo.
    First check `git status`/`git log` — if nothing changed since the last
    qa/FLEET-REPORT.md, skip the run and exit to save tokens. Otherwise run all
    five agents, regenerate qa/findings/*.md, and write qa/FLEET-REPORT.md.
    Do not edit app code or ROADMAP.md.
```

Local durable cron alternative (laptop on, session open) — `CronCreate`, `durable:true`,
`cron: "17 3 * * 2,5"`, same prompt. Auto-expires after 7 days; re-create to continue.

> Twice a week, not nightly, on purpose: a one-developer app rarely changes enough in 24h to justify
> a full fleet run, and the `git`-diff guard means an unchanged tree costs almost nothing.
