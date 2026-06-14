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
| `koch-release-captain` | **Pre-release gate (GO/NO-GO):** BUILD bumped, SW cache bumped, every `src` module in the SW shell, suite green, no committed secrets | sonnet | `qa/findings/release-captain.md` |
| `koch-data-guardian` | The Drive `rezepte.json`: round-trip / field-loss, id integrity, the canonical-German invariant, malformed-external-write resistance | **opus** (data is irreplaceable) | `qa/findings/data-guardian.md` |

> **The last two are gates, not nightly auditors.** `release-captain` runs **before a push/deploy** (it
> answers one question — safe to ship?); `data-guardian` runs **when the data layer or `SCHEMA.md`
> changes**, or before a release. Keep them out of the nightly routine — they earn their cost at the
> moments data or the deploy is actually at risk. On 2026-06-14 `release-captain`'s shell-completeness
> check already paid for itself: `data/baseLang.js` was missing from `sw.js` (would 404 offline) — fixed.

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

## Toward full orchestration — the next agents

Seven agents exist (five auditors + two gates). To make this a *full orchestration* that costs **less**
per run and produces **better, less noisy** output, the next additions split into two buckets: a thin
**control layer** (the biggest token lever) and a few **specialist auditors**.

### Build next — the control layer (this is where the token savings live)

1. **`koch-conductor`** *(highest leverage for cost)* — a cheap **router/meta-agent**, model `sonnet`,
   that runs first and decides *who else runs*. It reads `git diff --name-only <last>..HEAD` and maps
   changed paths → relevant agents (touched `i18n.js` → i18n-sentinel; touched `data/` or `SCHEMA.md`
   → data-guardian; touched a view → ux + simplifier; touched `sync.js` → bug-hunter + test-warden).
   Nothing relevant changed → it spawns **nobody** and writes one line. This is the difference between
   "always run 5–7 agents" and "run the 1–2 that the diff actually implicates" — easily a 3–5× cost cut
   on a typical change, and it means you can schedule the *whole* fleet because it self-prunes.
2. **`koch-curator`** *(highest leverage for output quality)* — runs **last**, model `sonnet`. Reads all
   fresh `qa/findings/*.md`, **dedups** items the same issue raised from three angles (the header dup hit
   3 agents — you want *one* roadmap row, not three), ranks by severity×effort, **suppresses anything
   already marked "verified clean" or already in `ROADMAP.md`**, and emits a single deduped, roadmap-ready
   `FLEET-REPORT.md`. Turns five raw reports into one decision list — less to read, nothing double-counted.

> Together these are the orchestration: **conductor** decides *what runs* (saves tokens up front),
> **curator** decides *what you read* (saves your attention at the end). The five auditors become
> interchangeable workers the conductor schedules — that's "full orchestration" rather than a fixed batch.

### Build when the matching surface grows — specialist auditors

3. **`koch-i18n-sentinel`** *(cheap, schedulable)* — DE/EN/ES/DA is a recurring failure class. Catches
   hardcoded strings bypassing `t()` (the K5 leak), key-parity drift, snapshot length/marker integrity.
   Small scope = small cost; ideal for the conductor to fire whenever `i18n.js` or a view changes.
4. **`koch-security-auditor`** — enforces the "no backend, no tracking" promise: BYOK key never logged or
   synced to Drive, `drive.file` scope stays minimal, all user content `esc()`-d before render (XSS),
   nothing leaves the device except to Anthropic/Drive. Run on changes to `ai/*`, `data/drive.js`, or any
   new `innerHTML` sink.
5. **`koch-perf-scout`** *(defer to V3)* — measures the "no-bundler tax": module/request count, cache
   weight, first paint as recipes grow. Feeds the V3 "is no-build still right?" decision. Low value until
   the catalog is much larger.

Each is a new `.claude/agents/koch-*.md` in the same read-only mould. **Recommended order:** `conductor`
+ `curator` first (they make every future run cheaper and clearer), then `i18n-sentinel`, then
`security-auditor`. `perf-scout` waits for V3.

## Boundaries (do not relax without asking Marcel)
- Agents are **read-only on app code and the roadmap**. They write only under `qa/findings/`.
- Findings are **proposals**. Nothing ships from a fleet run without Marcel promoting it.
- A clean report is a valid result. Agents are told **not to invent issues to fill space.**
