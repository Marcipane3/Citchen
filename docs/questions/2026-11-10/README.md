# Open questions — 10 Nov 2026

> **All four files were answered on 10 Nov.** The answers and what was done with them: [ANSWERS.md](ANSWERS.md).

Four files, independent of each other. Take them in any order, or hand each to its own Claude session.
Every question has a recommended answer; **`ok` accepts all recommendations in that file.**

| File | Topic | Questions | Your time | What it unblocks |
|------|-------|-----------|-----------|------------------|
| [1-pipeline.md](1-pipeline.md) | Scheduled tasks and build pipeline | 4 | 5 min | Faster nightly loop, runs outside your usage window |
| [2-open-work.md](2-open-work.md) | PR #58, stuck PR #57, issue triage, v2.18 release | 6 | 10 min | The pipeline (stalled since 10 Nov) and the v2.18 release |
| [3-data-model-R1.md](3-data-model-R1.md) | Ingredient model, ownership, file format 4 | 7 | 20 min incl. reading the spec | v2.19 (ingredient master + calories) and format 4 |
| [4-what-next.md](4-what-next.md) | What the pipeline builds while R1 waits; V3 long-lead items | 5 | 10 min | Two to three weeks of queued work |

**How to answer.** Any of these works:
- In a Claude Code session: "1-pipeline: ok" or "2-open-work: 2.1 ok, 2.3 no, 2.4 b".
- Edit the file: put your answer on the `Answer:` line and commit, or just paste the lines into a session.

**Order if you only have 10 minutes:** file 2 first (question 2.1 restarts the nightly builds), then file 1.

Where each answer is recorded afterwards: pipeline answers in `docs/process/`, product answers in the
roadmap row and `docs/v3/03-QUESTIONS.md` Part 3 (the roadmap update rule), R1 answers in the ADR.
