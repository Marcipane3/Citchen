# 06 · Learning track

> Added 2026-10-02 from Marcel's answer to H2. V3 is also a learning project: he wants to be
> **challenged**, not only informed, and the main subject is **how to work well with AI**.

## What Marcel wants to be able to do or explain afterwards

| Topic | "I can…" |
|-------|----------|
| Domain and DNS | …buy a domain, point it at a host, and explain what a DNS record does |
| Hosting | …explain where the app's files live, how a release reaches users, and how to move hosts |
| App development | …read the project structure, explain what a PWA and a TWA are, and follow a change from idea to release |
| Google sign-in | …explain what the app may access in a user's Drive, and what "verification" checks |
| Play Store | …run a release through the Play Console: tracks, closed test, review, rollout |
| **Working with AI** | …brief an AI coding agent well, check its work, and know when it is wrong |

## Format: every slice has three small parts

Each fits inside the 2–3 h weekly session and costs about 20 minutes in total.

1. **Challenge (before the slice, 5 min).** Claude asks one or two questions that Marcel answers
   *before* seeing the solution. Example for the domain slice: "The Play app must prove it belongs
   to the website. Where would you put the proof, and why can't it live at
   `marcipane3.github.io/Citchen/`?" A wrong answer is fine; the point is to have a guess to compare.
2. **Note (with the slice).** One page in `docs/v3/learn/NN-topic.md`: what was done, why, the
   three terms worth knowing, and what could go wrong. Plain language, no code walls.
3. **Retro (after the slice, 10 min).** Three lines in `docs/v3/learn/RETRO.md`: what the brief to
   Claude was, what came back that was wrong or too much, what Marcel would brief differently.

Marcel does some steps **himself** with Claude guiding instead of doing: buying the domain,
setting the DNS records, the Play Console forms, the Google sign-in consent screen. These are the
steps worth having done once by hand.

## Planned notes

| # | Note | Slice |
|---|------|-------|
| 01 | Domain, DNS and HTTPS | 1 |
| 02 | Hosting and how a release reaches a phone (service worker, cache, build number) | 1 |
| 03 | Where data lives: browser storage, Google Drive, and why a new address starts empty | 2 |
| 04 | PWA and TWA: what the Play app really is, and asset links | 3 |
| 05 | Play Console: tracks, closed test, review | 3 |
| 06 | Google sign-in: scopes, consent screen, verification | 3–4 |
| 07 | How the app talks to the AI: key, model, prompt, cost per call | 4–5 |
| 08 | Reading the code base: modules, tests, what the clean-up changed | 6 |

## AI working playbook

A single growing file, `docs/v3/learn/AI-PLAYBOOK.md`, fed by the retros. It answers "how do I
build properly with AI" from this project's own evidence. Starting outline:

1. **Decide before building.** Intent, no-go list, decisions on paper first (this folder is the example).
2. **Brief in slices.** One outcome, acceptance criteria, what must not change.
3. **Make "done" checkable.** Tests and a definition of done, so the AI's claim can be verified.
4. **Review with a second pair of eyes.** The QA agent fleet; what each agent caught.
5. **Watch for long-but-not-smart.** How to ask for less code: measure first, simplify, report.
6. **Keep the AI's memory outside the AI.** Roadmap, ADRs, changelog; why chats are not a record.
7. **Know the failure modes.** Confident wrong answers, scope drift, unverified facts. One real
   example each, taken from the retros.
8. **Compare with how others work.** Once per month Marcel tries one technique from outside
   (a different way of briefing, planning or reviewing) on a small task and records the result.

## What this costs

About 20 minutes per slice plus the hands-on steps. If the cutoff gets tight, notes are shortened
before any feature is cut; the retro lines are kept because they are the cheapest part.
