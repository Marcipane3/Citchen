# 1 · Scheduled tasks and pipeline

Background: `docs/process/AGENT-PIPELINE.md` §8 (measured costs) and §11 (what went wrong in the first
two weeks and what is already fixed in PR #58). The skill fixes are in the PR. The questions below are
the changes that touch your **live scheduled tasks**; I changed none of them.

**What the numbers say (27 Oct – 10 Nov).** 11 agent PRs built, reviewed and merged in 12 nights. A
builder night costs about $0.29 of API-equivalent usage, a refiner run $0.33, the Saturday release prep
$3.20 (of which $2.48 are the Opus review agents). A normal week is about $9–10. That is small; cost
is not your problem. Your problems were three stalls (broken CI, a week lost after a NO-GO, an answer
that got lost) and runs landing in your morning usage window.

---

### 1.1 Move the runs into the night and tighten the loop

Today: Builder 01:42 · Reviewer 06:58 · Refiner Mon + Thu 07:39 · Release prep Sat 08:17.
Scheduled runs use the same 5-hour usage window as your own sessions. The 06:58 reviewer opens a
window that lasts until noon, so your morning starts with a partly used window. And an answer you give
on Monday is built on Friday.

Proposed: **Refiner 00:20** (nights after Mon, Wed, Fri) → **Builder 00:50** (nightly) → **Reviewer
02:20** (nightly) → **Release prep Sat 05:40**. Everything nightly sits in one window that has reset
before you get up. An answer given by the evening is refined, built, reviewed and merged into `next`
by the next morning.

- **Recommended: yes.** Cost: one more refiner run per week (about $0.30).
- Trade-off: if you often work with Claude between 00:20 and 05:20, the runs share that window with you.

Answer:

### 1.2 Start every run on `next` instead of `main`

Scheduled sessions clone `main`. But the merged work and all pipeline fixes live on `next` until the
next release. Effect today: the skill fixes in PR #58 would not be used by the nightly runs until
v2.18 is released, and the refiner reads code that is weeks old. Proposed: each task prompt starts
with `git fetch origin && git switch --detach origin/next`. Safe, because only PRs you merge can
change the pipeline files on `next` (the `policy` check blocks agent PRs from touching them).

- **Recommended: yes.** New prompts are ready in `docs/process/SCHEDULED-TASKS.md`.

Answer:

### 1.3 Add a mid-week "release retry" task (Wed 05:40)

On Sat 7 Nov the release prep said NO-GO (a real data bug, #48). The fix was merged the next morning,
but the next release attempt is a week later. Proposed: a sixth task on Wednesday that runs release
prep **only if** the last attempt was a NO-GO and its blockers are merged. Otherwise it stops after two
cheap calls (about $0.10).

- **Recommended: yes.**
- Not recommended: running full release prep twice a week. You have one device-test slot per week.

Answer:

### 1.4 Check your real usage once, so we tune on facts

I can see what each run costs in tokens, but not how much of your Pro allowance that is. Two things I
could not verify from here:
- your **weekly usage** share: claude.ai → Settings → Usage, on a Sunday evening;
- the **daily cap on scheduled runs** for Pro: the launch documentation said 5 per day, the current
  page lists only hourly caps. The proposed schedule stays at 4 runs or fewer on any day (5 only on a
  Saturday that is the 1st of a month), so it holds either way.

If the weekly share of the scheduled runs is above roughly a third, the order of cuts is: builder on
weekdays only → review agents of patch releases on Sonnet instead of Opus → refiner twice a week.

- **Recommended:** send me the two numbers next Sunday (weekly %, and whether any run was rejected).

Answer:

---

**If you answer `ok`:** I update the five live tasks (new prompts, new times), create the "Release
retry" task, and set `SCHEDULED-TASKS.md` from "proposed" to "live". Takes one session, no device work.

**Considered and not proposed**
- *Releasing from a frozen `release/v2.x` branch* so the reviewer keeps merging while a release waits
  for your device test. With the new WIP limit of 2 the builder already keeps working for two nights
  during a freeze. Worth it only if release PRs regularly wait longer than that.
- *Bumping Playwright instead of pinning the CI runner.* The cloud sessions ship a Chromium that
  matches the pinned version; a bump has to be tested there first. Revisit in January.
- *Cheaper models for the roles.* The whole pipeline costs about $10 a week; a weaker reviewer would
  save cents and cost merges like the BH-12 catch.
