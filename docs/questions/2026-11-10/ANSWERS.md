# Answers — Marcel, 10 Nov 2026 (evening)

Recorded from the session. The roadmap rows and `docs/v3/03-QUESTIONS.md` Part 3 are updated with the
next release bump (they are being rewritten by release prep for v2.18, so they are not touched here).

## 1 · Pipeline
| # | Answer | Done |
|---|--------|------|
| 1.1 | Yes, and more: runs mainly at night, evening and morning are fine too. A window that is already running when Marcel starts is welcome (it resets earlier). | Partly, see "What Claude could not do" |
| 1.2 | Yes: every run starts on `next`. | New prompts in `docs/process/SCHEDULED-TASKS.md`; live only in tasks created by an agent |
| 1.3 | Yes: add the mid-week release retry. | Pending |
| 1.4 | Weekly usage 23 % (all models), 24 % of the separate Fable allowance, on Tue 10 Nov 23:45 with a reset on Saturday 09:00. | — |

**What Claude could not do.** An agent session can neither edit nor start the five scheduled tasks
Marcel created (the platform allows that only for tasks an agent created itself). Marcel changes
those five by hand (times and prompts are in `SCHEDULED-TASKS.md`). Extra tasks created by an agent
session are no alternative: tested on 11 Nov, their runs have no GitHub API access to the repo and run
on the session's model (Fable) instead of Sonnet. The test task was deleted.

**What the night showed.** The long interactive session of 10 Nov used up the 5-hour usage window.
The 01:42 builder run was rejected with "usage limit reached", and the 03:05 continuation of the session
only started at 07:46. A heavy evening session and nightly runs compete for the same window.

## 2 · Open work
| # | Answer | Done |
|---|--------|------|
| 2.1 | Merge PR #58 | Merged 10 Nov 23:22 |
| 2.2 | Close #37 | Closed |
| 2.3 | #53 → planned | Done |
| 2.4 | **b**: new contrast pair on every filled orange control | Built, PR open |
| 2.5 | Release v2.18 now | Waiting: release prep has to be started by Marcel ("Run now" on the task) or by an agent-created task |
| 2.6 | Usage export (5 assistant calls in two weeks, all Haiku 4.5, prompt cache hits on the second turn of a chat) | Showed a bug: every call was "unpriced" and cost 0 $ because the API reports dated model ids. Fixed, PR open. Real cost of the 5 calls: about 4 US cents. |

**Q5 (chat on the 5.5 generation):** yes in principle. With 5 chats in two weeks at under one cent
each, price is no argument either way; the reason to switch is answer quality and the cache working for
small cookbooks. The check on 10 real answers needs Marcel's key on his device, so the switch ships as
a selectable option first.

## 3 · Data model R1
All seven recommendations accepted (R1-Q1 … R1-Q7). `docs/v3/adr/ADR-R1-ingredient-model.md` is
**accepted**. L1 (nutrition model) is thereby settled: bundled table, USDA as the source.
v2.19 = ingredient master + structured lines; v2.19a = calories.

## 4 · What next
| # | Answer | Done |
|---|--------|------|
| 4.1 | Build the R1 work first, then Q4 (#59) and G3 (#60) | #61 R2.1 and #62 R3.1 are ready (milestone v2.19, built before the v2.20 items) |
| 4.2 | QW-8 yes · QW-2 yes · QW-4 yes · QW-6 no · QW-7 no, the header is right as it is · E3 after V3 | #63 QW-2 ready · #64 QW-8 ready · #65 QW-4 planned |
| 4.3 | Close F1 | Roadmap row with the next bump |
| 4.4 | D10 = accounts and recipe sharing in **v3.x**, v3.0 gets a schema ready for it · D11 = **send/invite only**, no public browsing | Roadmap + `03-QUESTIONS.md` with the next bump |
| 4.5 | Domain, Play account, testers: Marcel is on it | — |
