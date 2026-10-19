# Runbook: run the Koch QA fleet

This is the script the orchestrating Claude (or a scheduled routine) follows to run the fleet and
synthesise its output. Read-only on app code; writes only under `qa/`.
All agents follow `qa/AGENT-CONVENTIONS.md` (boundaries, evidence levels, finding IDs, report skeleton).

## Steps

1. **Baseline.** Run `node v2/tests/run.js` (note `pass/total`), read `BUILD` from `v2/src/version.js`,
   `CACHE` from `v2/sw.js`, `git log --oneline -1` (HEAD) and `git status --short`.

2. **Field reports.** Add any new observation from Marcel to `qa/FIELD-REPORTS.md` as `FR-NN`
   (date, area, observation in his words, unknowns). These are the top priority of the run.

3. **Spawn the agents in parallel** (one message, one `Agent` call each):
   - Full audit: `koch-bug-hunter`, `koch-architect`, `koch-simplifier`, `koch-ux-curator`,
     `koch-test-warden`, plus `koch-data-guardian` when the data layer / sync / list / SCHEMA changed
     or a field report touches data, plus `koch-release-captain` before a push or merge.
   - Spawn prompt (same preamble for all, plus the agent's name):
     *"Run your Koch QA audit per your definition and `qa/AGENT-CONVENTIONS.md`. Mode FULL. Build
     `<BUILD>`, CACHE `<CACHE>`, suite `<pass>/<total>`, HEAD `<sha>`. Open field reports: `<FR ids +
     one-line each>` — see `qa/FIELD-REPORTS.md`. Overwrite only `qa/findings/<name>.md`. Read-only on
     everything else. Return a 5-line summary: counts by severity, field-report verdicts, top item."*

4. **Synthesise `qa/FLEET-REPORT.md`** after all return (overwrite; keep it skimmable):
   - `# Koch Fleet Report — <UTC date>` · build + suite + HEAD line · which agents ran.
   - **Field reports** — per FR: the fleet's root-cause verdict (which agents agree, evidence level),
     the proposed fix, and the open question for Marcel if unresolved.
   - **Top issues across the fleet** — dedupe the same issue seen from several lenses into one entry
     listing all IDs (e.g. `BH-03 = DG-02 = SI-01`), rank by severity × impact, keep `file:line` + fix.
   - **Status of previous findings** — what got fixed since the last report, what's still open.
   - **By agent** — 2–3 lines + link to each `qa/findings/*.md`.
   - **Promotable to ROADMAP** — shortlist shaped as roadmap rows (item · why · pri · eff · IDs).
     Do NOT edit any `ROADMAP*.md` — promotion is Marcel's call.
   - **Agent definition feedback** — any `Definition drift` lines the agents reported, so the
     definitions get fixed before the next run.

5. **Update `qa/FIELD-REPORTS.md` statuses** (🔍 investigating → 🎯 root-caused / ❓ needs Marcel /
   ✅ fixed in vX) with a one-line pointer to the finding IDs.

6. **Report back** to Marcel: counts by severity, field-report verdicts, the single highest-value
   finding, suite status. Short.

## Ready-made overnight schedule (activate only on Marcel's OK)

Cloud nightly (true unattended, consumes usage) — via the `/schedule` skill:

```
/schedule create
  name: koch-qa-fleet-nightly
  cron: 17 3 * * 2,5        # ~03:17 local, Tue & Fri (off-peak minute, twice a week)
  prompt: |
    Run the Koch QA fleet following qa/run-fleet.md in the Koch_Project repo.
    First check `git status`/`git log` — if nothing changed since the last
    qa/FLEET-REPORT.md and there is no open field report, skip the run and exit
    to save tokens. Otherwise run the five auditors, regenerate qa/findings/*.md,
    and write qa/FLEET-REPORT.md. Do not edit app code or any ROADMAP*.md.
```

Local durable cron alternative (laptop on, session open) — `CronCreate`, `durable:true`,
`cron: "17 3 * * 2,5"`, same prompt. Auto-expires after 7 days; re-create to continue.

> Twice a week, not nightly, on purpose: a one-developer app rarely changes enough in 24h to justify
> a full fleet run, and the `git`-diff guard means an unchanged tree costs almost nothing.
