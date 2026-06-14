# 🛡️ Koch QA Fleet

A small fleet of **reusable, read-only Claude Code sub-agents** that continuously audit the Koch v2
PWA from five different angles and write their findings into this folder. They **propose**; they never
edit app code or the roadmap. Marcel reads the reports and promotes what's worth doing into
`ROADMAP.md` by hand.

> Design principle (inherited from ROADMAP §9): **read-only proposers, human-in-the-loop.**
> An agent that silently rewrites the app is a liability, not a feature.

---

## The roster

| Agent | Lens | Model | Writes to |
|-------|------|-------|-----------|
| `koch-bug-hunter` | Real defects: state leaks, async/error gaps, offline & Drive-sync edge cases, i18n drift, listener/timer leaks | **opus** (depth) | `qa/findings/bug-hunter.md` |
| `koch-architect` | Decisions going forward: data model, sync design, `drive.file` scope, security, V3 readiness | **opus** (depth) | `qa/findings/architect.md` |
| `koch-simplifier` | Reuse, dead code, duplication, over-engineering | sonnet | `qa/findings/simplifier.md` |
| `koch-ux-curator` | A11y, navigation, touch targets, empty/error states, copy — **plus creative ideas** | sonnet | `qa/findings/ux-curator.md` |
| `koch-test-warden` | Coverage gaps, missing edge cases, forward tests for upcoming work | sonnet | `qa/findings/test-warden.md` |

**Why two models?** Defect-hunting and architecture reward deeper reasoning → Opus. Simplicity,
UX and coverage are more pattern-driven → Sonnet, which keeps a full fleet run cheap. That routing
lives in each agent's `model:` frontmatter — change it there.

The definitions are plain markdown in **`.claude/agents/koch-*.md`** — version-controlled, editable,
and reusable from any session.

---

## Running the fleet

### Manually, on demand (from a `claude` session in this repo)
Ask Claude:

> "Run the Koch QA fleet — follow `qa/run-fleet.md`."

Claude spawns all five agents (in parallel), each regenerates its `qa/findings/*.md`, then synthesises
`qa/FLEET-REPORT.md`. A full run is read-only and safe to repeat.

You can also run a single lens: *"Run the koch-bug-hunter agent."*

### Overnight / unattended — pick one (honest trade-offs)
There is no magic "runs while my laptop is off and free" button. Three real options:

1. **Cloud scheduled agent (recommended for true overnight).** Use the `/schedule` skill to create a
   routine that runs `qa/run-fleet.md` on a cron (e.g. nightly). It executes in Anthropic's cloud, so
   your machine can be off. **It consumes plan usage on every run** — that's the cost of unattended.
   Set it to run a few nights a week, not hourly, and gate it on "only if `git` shows changes since
   the last run" to avoid burning tokens on an unchanged tree.
2. **Local durable cron (laptop must be on).** A `CronCreate` job with `durable:true` fires only while
   a `claude` REPL is running and idle, and auto-expires after 7 days. Fine if you leave a session
   open on a desktop overnight; useless if the laptop sleeps.
3. **Manual (zero cost, full control).** Just run it before a planning session. Honestly, for a
   one-developer app this is often the right cadence — run the fleet when you're about to pick the next
   batch of work, not every night.

**Recommendation:** start with **(3) manual** + the ready-made `/schedule` config in `run-fleet.md`,
and only promote to **(1) cloud nightly** once you're actively in a build cycle and want the backlog
to refill itself while you sleep.

---

## Reading the output
- `qa/findings/<agent>.md` — each agent's latest report, regenerated per run, timestamped.
- `qa/FLEET-REPORT.md` — a synthesis: the cross-agent top issues, deduped, ranked, ready to skim.
- Findings use a shared shape (severity/impact · `file:line` · why · suggested fix · effort) so they
  drop cleanly into `ROADMAP.md` as new rows.

## Future agents worth adding (ranked by value for "a perfect app")

The current five cover *quality, structure, simplicity, UX, tests*. The biggest gaps are **the data
and the deploy** — the two places where this app can actually hurt itself. In rough priority:

1. **`koch-release-captain`** *(highest value)* — a **pre-release gate**, not an auditor. Verifies the
   things this project repeatedly trips on: `BUILD` in `version.js` bumped, `CACHE` in `sw.js` bumped,
   **every `src/**/*.js` present in the SHELL list**, changelog updated, full fleet green. Run it before
   every push. Directly attacks the recurring "stale service worker serves old modules" pain.
2. **`koch-data-guardian`** — guards the most precious asset: the Drive `rezepte.json`. Round-trips the
   file through `migrate.js`, asserts no field loss, unique ids, the **canonical-German invariant**, and
   that a malformed *external* write (v1 or project-Claude share this file) can't corrupt the store.
3. **`koch-i18n-sentinel`** — the app is DE/EN/ES/DA; this is a recurring failure class. Catches
   hardcoded strings that bypass `t()` (the K5 leak), key-parity drift, and snapshot length/marker
   integrity. Cheap to run, prevents whole categories of regressions.
4. **`koch-security-auditor`** — enforces the "no backend, no tracking" promise: BYOK key never logged
   or synced to Drive, `drive.file` scope stays minimal, all user-supplied content is `esc()`-d before
   render (XSS), nothing leaves the device except to Anthropic/Drive.
5. **`koch-perf-scout`** *(save for V3)* — measures the "no-bundler tax": module/request count, cache
   weight, first paint as the recipe count grows. Feeds the V3 "is no-build still right?" decision.

`release-captain` + `data-guardian` are the two I'd build next — they protect the deploy and the data,
which the current five don't. Each is a new `.claude/agents/koch-*.md` in the same read-only mould.

## Boundaries (do not relax without asking Marcel)
- Agents are **read-only on app code and the roadmap**. They write only under `qa/findings/`.
- Findings are **proposals**. Nothing ships from a fleet run without Marcel promoting it.
- A clean report is a valid result. Agents are told **not to invent issues to fill space.**
