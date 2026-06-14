# 🌙 Koch dev routine — the "nightly guard pass"

A scheduled routine tuned for **maximum signal per token**. It does *not* re-audit the whole app every
night. It runs only the two **guard agents** (`koch-bug-hunter`, `koch-test-warden`) in **DELTA mode**,
and only when code actually changed since the last run. On a quiet night it costs almost nothing.

> Why only the two guards, not all five? The three *proposers* (architect, simplifier, ux-curator)
> generate ideas and options — that's worth your attention live, in a session, where you can push back.
> Automating idea-generation produces reports nobody reads. The guards catch *regressions* — things you
> broke without noticing — which is exactly the work worth doing while you sleep.

---

## The prompt (paste into `/schedule`, or CronCreate)

```text
You are orchestrating the Koch QA "nightly guard pass" in the Koch_Project repo
(C:\Claude_files\Koch_Project). Be frugal: this runs unattended on a schedule.

1. Find the last run's baseline: read the date stamp at the top of
   qa/findings/bug-hunter.md (and test-warden.md). Determine the git ref/commit
   that report was written against. Run `git status` and
   `git diff --name-only <that-ref>..HEAD`.

2. GATE — if nothing under v2/ changed since the last report AND
   `node v2/tests/run.js` is green: write nothing, make no commits, and stop with
   a one-line note "guard pass: no changes since <date> — skipped". Do not spawn
   any agents. This is the common case and must be cheap.

3. Otherwise, run `node v2/tests/run.js` and spawn exactly TWO agents in parallel,
   each in DELTA mode against <that-ref>..HEAD:
     - koch-bug-hunter  (read .claude/agents/koch-bug-hunter.md, follow it, DELTA mode)
     - koch-test-warden (read .claude/agents/koch-test-warden.md, follow it, DELTA mode)
   They are READ-ONLY on app code and overwrite only their own qa/findings/*.md.

4. If either agent reports a NEW P0/P1 (bug-hunter) or a NEW high-risk coverage gap
   on the persistence/sync path (test-warden), append a short dated entry to the TOP
   of qa/FLEET-REPORT.md under a "## ⚠ Guard pass <date>" heading, linking the two
   findings files. If everything is clean, just refresh the two findings files.

5. Do NOT edit ROADMAP.md or any app code. Do NOT commit. End with a 3-line summary:
   suite result, new-findings count by severity, and whether anything needs my eyes.
```

### Cron (twice a week, off-peak, jittered minute)
```
17 3 * * 2,5     # ~03:17 local, Tuesday & Friday
```
Twice a week — not nightly — because a one-developer app rarely changes enough in 24h to justify a run,
and the git-gate makes an unchanged tree nearly free anyway. Tue/Fri catches both mid-week and
end-of-week work. The `:17` minute avoids the `:00` stampede when everyone's jobs fire at once.

---

## Where the value/cost actually is

| Choice | Why it saves money | What it costs you |
|--------|--------------------|-------------------|
| **Git-gate first** | Unchanged tree → 1 cheap `git` + test run, **zero agent tokens.** This is the single biggest lever. | A run is skipped if you only changed docs — fine, guards care about `v2/`. |
| **DELTA mode** (changed files only) | A guard reads ~2–5 files, not ~40. ~5–10× cheaper than a full sweep. | Won't re-find a latent bug in untouched code — that's the *manual* full fleet's job. |
| **2 agents, not 5** | Skips the 3 proposers (the Opus-heavy architect + two Sonnets). | No fresh ideas from the routine — by design; run proposers manually. |
| **Twice weekly, not nightly** | ~⅓ the run attempts. | Up to ~3 days of lag catching a regression. Acceptable for a personal app. |
| **Model routing** | bug-hunter=Opus (depth where it pays), test-warden=Sonnet (mechanical). | — |

**Rough order-of-magnitude:** a full 5-agent FULL run is the expensive thing (what you saw in this
session — five agents, two on Opus). The nightly guard pass on a *changed* tree is a small fraction of
that (two agents, delta-scoped); on an *unchanged* tree it's a rounding error. Over a week, the routine
should cost far less than a single full fleet run.

---

## Risks (and the mitigation already built in)

1. **Alert fatigue / reports nobody reads.** → The routine only *escalates* (touches FLEET-REPORT.md)
   on a **new** P0/P1 or high-risk gap. A clean night is silent. Proposer noise is excluded entirely.
2. **False sense of safety.** DELTA mode only sees what changed; it will not catch a bug in code you
   didn't touch, or anything the browser-only paths (DOM, real Drive, real AI) hide. → Treat the routine
   as a *regression tripwire*, not a guarantee. Run the **full** fleet manually before any release.
3. **Cost creep.** A recurring cloud job bills every fire. → The git-gate + twice-weekly + 7-day
   auto-expire (CronCreate) bound it. Re-create the schedule deliberately rather than letting an
   open-ended nightly job run for months.
4. **Stale baseline / wrong diff.** If the last report's ref can't be resolved, the agent could
   re-scan everything (expensive) or nothing (blind). → The prompt pins the baseline to the report's
   own date stamp and falls back to FULL only on the first run.
5. **Acting on stale code.** A scheduled agent reasons about whatever is on disk at fire time, including
   uncommitted work. → It's read-only and never commits, so the worst case is a findings file you ignore.

## Improvements you could add later
- **Trigger on push instead of cron** (a git hook or CI step that runs the guard pass on `main`) —
  strictly better signal/cost than time-based, since it runs exactly when something changed.
- **A weekly proposer digest** (Sunday): one architect run in delta mode summarising structural drift —
  low frequency keeps idea-noise down.
- **Budget cap**: have the routine stop after N tool calls and report partial, so a pathological run
  can't burn an unbounded amount.

---

## Activate, or keep manual? — recommendation
- **In an active build sprint** (you're committing most days): **activate the cloud schedule.** The
  regression tripwire pays for itself when you're moving fast. Cost stays low via the git-gate.
- **Between sprints / idle weeks:** **keep it manual.** Run the full fleet (`qa/run-fleet.md`) when
  you sit down to plan the next batch. For a solo app this is often the honest right answer — you don't
  need a robot watching a repo that isn't changing.
- **Never** run the *full five-agent* fleet on a nightly cron. That's the expensive operation; reserve
  it for manual, pre-release, or a low-frequency (e.g. monthly) deliberate audit.
