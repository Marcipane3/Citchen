# Citchen — autonomous build pipeline (v2 of the setup)

> Status: **adopted 2026-10-27** (setup PR `hotfix/pipeline-setup`). Replaces the four ad-hoc scheduled
> tasks created the same day. Amendments from the setup review are listed in §10.
> Owner: Marcel. Read this once; day to day you only touch the three things in §6.

---

## 1. Diagnosis — what is wrong with today's setup

Evidence comes from the repo, the four scheduled tasks and their first runs on 27 Oct (PRs #21, #22,
branch `build/G2.1-recipe-import-core`, branch `qa/audit-2026-10-27`).

| # | Problem | Evidence | Why it matters |
|---|---------|----------|----------------|
| 1 | **Merge = deploy, with no gate.** GitHub Pages serves `main`. The Reviewer merges to `main` every morning. | `koch-release-captain.md`: "Deploy = push to `main` → GitHub Pages". The Reviewer prompt squash-merges to `main`. | Every agent PR goes straight to your phone and your friends. That breaks your own rules: one release = one 2–3 h device test, and live beats new. |
| 2 | **No CI.** "Merge only if CI is green" checks nothing. | `.github/workflows/` holds only `supabase-keepalive.yml`. The QA run found the same thing (QA-01). | The merge gate is just the agent's word. 358 unit + 46 e2e tests exist but never run on a PR. |
| 3 | **Tomorrow's auto-merge would ship a NO-GO release.** | G2.1 adds a module to the SW `SHELL` but leaves `CACHE` and `BUILD` alone. `koch-release-captain` rule 3: precached assets changed but `CACHE` unchanged → NO-GO. | The pipeline breaks the project's own release checklist on its first item. |
| 4 | **State lives in prose inside 80 KB of Markdown.** `*(status=ready)*`, ✅, "planned · G2.1 ready" sit inside table cells across three files. | ROADMAP-V2.md is 52 KB; all roadmaps together are about 81 KB. | Each agent reads ~20k tokens just to find its work. Parsing is fragile, and parallel agents editing the same 52 KB file will create merge conflicts. |
| 5 | **The generic prompts ignore what the repo already has.** | 7 agents in `.claude/agents/`, `qa/AGENT-CONVENTIONS.md` (evidence levels, IDs), `qa/ROUTINE.md` (git-gated guard pass), the release-captain GO/NO-GO, the "Recommended next" flow in ROADMAP.md. The QA run invented a fourth ID scheme (`QA-01`). | Two QA systems, two ID schemes, two sources of truth. |
| 6 | **CLAUDE.md is the wrong project.** | It is the May handoff: single-file `index.html` + Drive, "advise on hosting". | Every session, scheduled or interactive, starts from a wrong mental model. This is the cheapest high-impact fix. |
| 7 | **Prompts live in a web form, not in git.** | Trigger prompts are only in claude.ai. | They aren't versioned, reviewed or testable, and can't be run by hand with `/build-next`. |
| 8 | **Unattended runs carry production access they don't need.** | Every scheduled task has Gmail, Google Drive, Indeed, Supabase, Claude Docs and visualize attached. | An unattended agent with the Supabase MCP can change the production database. The tool definitions also cost tokens on every run. |
| 9 | **The cloud session can't use GraphQL.** | `gh pr list` returns HTTP 403 "GitHub GraphQL is not available from Claude Code sessions". | Prompts must use `gh api repos/...` (REST). GitHub Projects (v2) boards are GraphQL-only, so agents can't use them. |
| 10 | **Cloud runs couldn't see the pipeline files or spawn subagents.** | `.gitignore` had `.claude/*` with only `agents/` re-included, so `skills/`, `hooks/` and `settings.json` were never committed. The routines' allowed tools had no `Task`. | Every role would have stopped with "pipeline skills missing", and no `koch-*` agent could run unattended. |

What already works and should be kept: the roadmap *thinking* (version plan, gates, recommendation
flow, update rule), the QA fleet and its conventions, the test suites, and the refiner/builder idea.
Their first runs produced sensible output.

---

## 2. Design principles (how a professional team would run this)

1. **Separate planning from execution.** The roadmaps stay the *strategy* (why, which version,
   which order). **GitHub Issues** become the *work queue*: one issue per buildable item, state in
   labels, versions as milestones. Machines read labels, humans read the roadmap.
2. **Separate integration from release.** Agents integrate into a branch called `next` as often as
   they like. Production (`main` → Pages) changes only through a weekly **release PR** that you
   merge after the release-captain says GO. This is a classic release train, sized to one device test.
3. **Enforce policy in CI, not in prose.** Prompts can be ignored; a required status check can't.
   Agent PRs that touch `supabase/`, `.github/`, `.claude/` or `CLAUDE.md` fail a `policy` job.
4. **Prompts are code.** Each role is a project skill in `.claude/skills/<role>/SKILL.md`, reviewed
   in PRs. The scheduled task prompt shrinks to "run `/build-next`". The same command works when you
   sit down interactively.
5. **Separation of duties.** The builder never merges. The reviewer never writes code. Only you move
   work from *proposed* to *planned* and from `next` to production.
6. **Cheap when idle.** Every role starts with REST preflight checks that cost almost nothing and
   stops if there is no work. Expensive subagents (Opus bug-hunter) run only when the diff touches
   the data/sync path.
7. **Reuse the house rules.** Reviewers and release prep call the existing `koch-*` agents and
   follow `qa/AGENT-CONVENTIONS.md`. No parallel QA universe.

---

## 3. The flow

```
                 ┌──────────── planning (Markdown, Marcel + release-prep) ─────────────┐
                 │ ROADMAP.md "Recommended next" · ROADMAP-V2/V3 · docs/v3 decisions   │
                 └───────────────┬──────────────────────────────────────────────────────┘
                                 │ /refine (Mon + Thu) creates/splits issues
                                 ▼
 Marcel approves ─► status:planned ─► status:ready (DoR met, buffer of 3)
 (label)              ▲   │
                      │   └► status:needs-input ─► Marcel answers in a comment ─┘
 QA finding ─► status:proposed   (guard pass weekly · /propose digest monthly)
                                 │ /build-next (nightly) — 1 issue, WIP 2
                                 ▼
                 PR build/<N>-slug → next   [CI: unit · e2e · supabase · policy]
                                 │ /review-pr (every morning)
                     ┌───────────┼───────────────┐
              squash-merge   changes-requested   needs-human
              into next      (builder fixes      (Marcel)
              issue: status:merged   next night)
                                 │ /release-prep (Saturday) — reviews freeze while the release PR is open
                                 ▼
          guard pass (bug-hunter + test-warden [+ data-guardian], DELTA) → version bump + roadmap ✅
          → release-captain GO → PR next → main with device-test checklist
                                 │ Marcel merges = deploy (Pages) · rollback = revert
                                 ▼
                            live · issues closed by "Closes #…"
```

---

## 4. Work-item model

**Issue title:** `[<roadmap ID>] <title>`, for example `[G2.1] Recipe import core`. This keeps
the issue linked to the roadmap row and lets the refiner check whether an issue already exists.

**Labels** (created by `scripts/setup-github.sh`):

| Group | Labels | Who sets them |
|-------|--------|---------------|
| Status | `status:proposed` · `status:planned` · `status:needs-input` · `status:ready` · `status:in-progress` · `status:in-review` · `status:merged` · `status:blocked` (done = closed) | proposed: QA · planned: **Marcel only** · ready/needs-input: refiner · in-progress/in-review/blocked: builder · merged: reviewer · closed: release PR |
| Priority | `prio:P0` … `prio:P3` (same scale as ROADMAP-V2) | refiner, from the roadmap |
| Size | `size:S` · `size:M` (no L: L must be split) | refiner |
| Type | `type:feature` · `type:bug` · `type:chore` · `type:spike` · `type:epic` | refiner / QA |
| Risk | `risk:needs-human` (Supabase, auth, secrets, deleting data, file-format change) | refiner / reviewer |
| Source | `source:qa` · `source:marcel` · `source:field-report` | creator |
| PR | `claude-build` · `changes-requested` · `needs-human` · `release` | builder / reviewer / release-prep |

**Milestones = versions** (`v2.18`, `v2.19`, …) with the target dates from ROADMAP-V2 §2. The builder
picks the earliest milestone first, then priority, then the lowest number.

### Definition of Ready (refiner checks; builder re-checks)
1. Intent approved: you wrote it, it is in "Recommended next" with Owner = Claude, or you labelled it `status:planned`.
2. Every `Depends on #N` is closed or `status:merged`.
3. Acceptance criteria are a checklist, and each item can be verified by a named test or an observable behaviour.
4. Size S or M: fits one PR (about ≤ 300 changed lines excluding tests) and one nightly run.
5. No open product question. If two reasonable builders would build it differently → needs-input.
6. Scope lists the files/areas likely to change and the tests to add.
7. If it is a needs-human area, it carries `risk:needs-human`. The builder skips those; they are built with you in an interactive session.

### Definition of Done (for a PR into `next`; reviewer checks)
Everything in CLAUDE.md → "Definition of Done". In short: each AC proven by a test that fails without
the change · unit + e2e + supabase green in CI · i18n in DE/EN/ES/DA · canonical German data ·
new modules in the SW `SHELL` · **no** BUILD/CACHE/CHANGELOG/roadmap edits (release-prep does those).

---

## 5. Branches and releases

| Branch | Purpose | Who writes | Protection (GitHub → Settings → Rules → Rulesets) |
|--------|---------|------------|------------------|
| `main` | Production. Pages deploys it. | Release PRs from `next`, hotfix PRs from `hotfix/*` | PR required · status checks `unit`, `e2e`, `policy` required · no force push · no deletion · no required approvals (you and the agents share your GitHub identity) · bypass: you (emergency only) |
| `next` | Integration. Everything merged but not yet live. | Squash merges of `build/*` and `release-bump/*` PRs | Same rules as `main` |
| `build/<N>-<slug>` | One issue | Builder | — |
| `release-bump/v2.N` | Version bump + roadmap update | Release-prep | — |
| `hotfix/<slug>` | Urgent fix on live (you + Claude, interactive) | You | Afterwards open a PR `main → next` |

**Release** (weekly, sized to one 2–3 h device test): release-prep merges the bump into `next`, then
opens a PR `next → main`. Merge it with **"Create a merge commit"** (not squash), so `next` stays an
ancestor of `main` and never needs a sync. Rollback = "Revert" on that PR; Pages redeploys in about
a minute.

---

## 6. Roles

| Role | When | Does | Never |
|------|------|------|-------|
| **Refiner** `/refine` | Mon + Thu morning | Keeps 3 issues `status:ready`; splits big items; asks you 1–3 questions with a suggested default on needs-input issues | Promote proposed items, write code, change your priorities |
| **Builder** `/build-next` | Nightly | Fixes a `changes-requested` PR first, otherwise builds 1 ready issue test-first → PR into `next` | Merge, touch protected paths, build needs-human issues |
| **Reviewer** `/review-pr` | Every morning | Independent review of up to 2 agent PRs: CI, AC, mutation spot check, scope; bug-hunter subagent if the data/sync path is touched → merge into `next` / changes / needs-human | Write code, merge to `main`, merge red or pending CI |
| **Release-prep** `/release-prep` | Saturday morning | Guard pass (bug-hunter + test-warden; data-guardian when the data layer changed), version bump, roadmap update rule, release-captain GO, release PR with device checklist | Merge to `main` |
| **Proposer digest** `/propose` | 1st of the month | Architect + simplifier + ux-curator in DELTA mode over the month → at most 5 `status:proposed` issues; stops if more than 8 proposals are already waiting | Write files, set any status but proposed |
| **Marcel** | When you like | **(1)** label `status:planned` on proposals you want · **(2)** answer needs-input questions in the issue (reply `ok` = accept the defaults) · **(3)** merge the release PR and do the device test | — |

Interactive sessions stay the place for: needs-human issues (migrations, auth), spikes (R1),
the full QA fleet before a big release, and hotfixes.

---

## 7. Guardrails (defense in depth)

1. **CI** (`.github/workflows/ci.yml`): unit, snapshots, e2e, Supabase migration tests. **Policy** in its
   own `policy.yml`, so it re-runs on label and base-branch changes without re-running e2e.
2. **Rulesets** on `main` and `next` (§5). Nothing reaches production except through a PR you merge.
3. **Policy job:** an agent PR (`build/*`, `release-bump/*`, or any PR labelled `claude-build`) touching
   `supabase/`, `.github/`, `.claude/` or `CLAUDE.md` fails. A PR into `main` must come from `next` or
   `hotfix/*`. The label check matters because every agent acts under Marcel's GitHub identity.
4. **Release freeze:** while a `release` PR into `main` is open, the Reviewer merges nothing into
   `next`. A PR from `next` follows the branch, so a later merge would go live unchecked.
5. **`.claude/settings.json` + hook** (`.claude/hooks/guard.mjs`): blocks `git push` to main/next,
   force pushes, branch deletion of main/next and the `supabase` CLI, for every session.
6. **Scheduled tasks without connectors, with `Task`:** remove Gmail, Drive, Indeed, Supabase, Claude Docs and
   visualize from all five. They need only the repo, plus the `Task` tool where a role spawns `koch-*` agents.
7. **WIP limit 2 (one issue per run), max 2 review rounds,** then needs-human. No infinite loops.
   WIP was 1 until 10 Nov; one stuck PR then idled the whole queue (§11).

---

## 8. Budget on the Pro plan

Measured on the first two weeks (27 Oct – 10 Nov, from the run logs; cost = what the same tokens would
cost on the API, a yardstick for comparing runs, not a bill):

| Run | Model | Measured | Per week |
|-----|-------|----------|----------|
| Builder, one small issue incl. local e2e | Sonnet 5.5 | ≈ $0.29, 3 min | 7 × ≈ $0.3 |
| Refiner, buffer refill | Sonnet 5.5 | ≈ $0.33, 1.5 min | 2–3 × ≈ $0.3 |
| Reviewer | Sonnet 5.5 (+ Opus bug-hunter on data/sync diffs) | not measured, est. $0.3–1 | 7 × |
| Release prep with guard pass | Sonnet 5.5 + **Opus 5.5 subagents** | ≈ $3.20, of which $2.48 Opus | 1 × (2 × after a NO-GO) |
| Any run that stops in preflight | Sonnet 5.5 | ≈ $0.1 (the ~54k-token session start) | — |

So a normal week is about **$9–10 of API-equivalent usage**, and one third of it is the Saturday
guard pass. Nothing here needs tuning for cost; what the Pro plan is sensitive to is *when* it runs:

- **Scheduled runs draw from the same usage windows as your own sessions** (the 5-hour window and the
  weekly allowance). A run at 06:58 opens a 5-hour window that lasts until noon and has the reviewer's
  and refiner's usage already in it. All nightly roles therefore run between 00:20 and 02:30, inside
  one window that has reset long before you sit down (`SCHEDULED-TASKS.md`).
- **Saturday release prep runs at 05:40**, in its own window: it is the one heavy run (Opus), and a run
  that hits the window limit is cut off, not queued.
- **Daily run cap:** the launch documentation named 5 scheduled runs per day on Pro; today's page only
  lists hourly caps. The schedule stays at ≤ 4 runs on any day (5 on a Saturday the 1st), so it holds
  either way.
- **Models:** Sonnet 5.5 for all roles (the default). Opus only inside the `koch-*` agents pinned to it
  (bug-hunter, data-guardian, architect).
- **Context diet:** agents read CLAUDE.md (short) + the one issue + the files it names. Only
  release-prep reads the big roadmaps, once a week.
- **Throttle if needed** (in this order): builder to weekdays (`1-5`) · guard-pass agents on Sonnet for
  patch releases · refiner back to twice a week.

---

## 9. Rollout (in this order; about 1 hour, mostly one interactive Claude Code session)

1. **Pause the Reviewer/Merger now**, so G2.1 is not auto-deployed tomorrow at 06:58 (§1 #3).
2. Merge this proposal as one PR straight into `main` from a branch named `hotfix/pipeline-setup` (interactive session, before `next` exists): new `CLAUDE.md` (old one → `docs/archive/CLAUDE-2026-05-handoff.md`),
   `.claude/settings.json`, `.claude/hooks/guard.mjs`, `.claude/skills/*`, `.github/workflows/ci.yml`,
   `.github/ISSUE_TEMPLATE/work-item.yml`, `.github/pull_request_template.md`,
   `scripts/setup-github.sh`, this file, `.gitignore` (re-include `.claude/skills|hooks|settings.json`).
3. Run `bash scripts/setup-github.sh`: labels, milestones, `next` branch from `main`.
4. In GitHub, add the two rulesets (§5). Mark `unit`, `e2e` and `policy` as required after their
   first green run. Add `supabase` once it has been green on the runner.
5. Retarget the open G2.1 PR from `main` to `next` (Edit → base). Turn G2.1 and P8.1 into issues
   (`/refine` does this on its first run). Convert QA-01…03 into issues with `status:proposed`.
6. In each scheduled task: remove all connectors, add `Task` to the allowed tools, replace the prompt
   with the short one from `docs/process/SCHEDULED-TASKS.md`, adjust the schedule. Create the monthly
   proposer digest. Re-enable the Reviewer only after the rulesets are in.
7. First week: watch. Read the Reviewer's verdicts. If one merge looks wrong, tighten the skill in a
   PR. The release gate protects production in the meantime.

---

## 10. Amendments from the setup review (2026-10-27)

| # | Defect in the first draft | Fix |
|---|---------------------------|-----|
| 1 | `.gitignore` kept `.claude/skills`, `hooks`, `settings.json` out of git, so cloud runs never saw them | Re-included in `.gitignore` |
| 2 | Routines had no `Task` tool, so no `koch-*` subagent could run | `Task` added to the reviewer, release-prep and proposer routines |
| 3 | The release PR follows `next`; the daily Reviewer could merge unchecked work into it after the guard pass | Release freeze in `/review-pr` preflight |
| 4 | Release-prep's hotfix check counted the release merge commit itself, so it would stop every week | `git log --no-merges` |
| 5 | Policy keyed on branch name only; all agents share Marcel's identity | Also applies to PRs labelled `claude-build`; own workflow that re-runs on label/base changes |
| 6 | Guard hook blocked branch names ending in `-next` / `-main` and missed `+ref` force pushes | Ref-boundary matching, tested against 24 cases |
| 7 | Weekend QA ran only bug-hunter + test-warden | data-guardian joins when the data layer changed; proposers run monthly via `/propose` |

---

## 11. Amendments after two weeks of running (2026-11-10)

What the pipeline did: 11 agent PRs built, reviewed and merged into `next` in 12 nights (v2.18 scope
complete), 1 release attempt (NO-GO on a real data bug, BH-12 — the gate worked). What stalled it:

| # | What happened | Evidence | Fix |
|---|---------------|----------|-----|
| 1 | **CI broke for an infrastructure reason and stopped everything.** `ubuntu-latest` moved to Ubuntu 26.04; Playwright 1.56 can't install Chromium there. The Reviewer marked the PR `needs-human`, the Builder then hit WIP 1 every night. | PR #57, run 42730800080 | `e2e` pinned to `ubuntu-24.04` · Reviewer tells infra failures from test failures, re-runs once, files **one** `[CI]` issue, leaves the PR unlabelled so it resumes by itself · Builder WIP 2 |
| 2 | **A NO-GO cost a full week.** Release prep said NO-GO on Sat 7 Nov; the fix was merged Sun 8 Nov; the next attempt is Sat 14 Nov. | PR #54, #55 | Mid-week `retry` run of release prep that only proceeds after a NO-GO whose blockers are merged |
| 3 | **An answered question got lost.** Marcel answered #36 with `ok` and the status label went missing; the Refiner only looks at `status:needs-input`, so nobody picked it up for three days. | #36, refiner run 9 Nov | Refiner sweeps issues without a `status:*` label |
| 4 | **Roles run on `main`, the work lives on `next`.** Scheduled sessions clone the default branch. Skill fixes merged into `next` are not live until the next release, and the Refiner read month-old code. | refiner run 9 Nov: "this checkout's branch doesn't have it" | Task prompts start with `git switch --detach origin/next` (only Marcel-merged changes can touch `.claude/` there; policy blocks agent PRs) |
| 5 | **Hand-merged PRs leave stale labels.** Issues built in an interactive session never get `status:merged`, so release prep would miss them. | PR #58 | Release prep reconciles labels from `Refs #N` of every PR merged into `next` |
| 6 | **A delivered issue stayed open.** #37 was covered by #48; nobody may close issues. | refiner run 9 Nov | Refiner asks "delivered by #N — close?" as a normal question |
| 7 | **Runs sat in Marcel's morning usage window.** | schedule 06:58 / 07:39 / Sat 08:17 | Night schedule, §8 |
| 8 | **Lead time from an answer to a build was up to 4 days** (answer Mon → refiner Thu → builder Fri). | schedule | Refiner three nights a week, *before* the builder: answer by evening → merged into `next` next morning |

Still open, for Marcel to decide (see `docs/questions/2026-11-10/`): release from a frozen
`release/v2.x` branch so the freeze no longer idles the Reviewer while a release waits for the device test.
