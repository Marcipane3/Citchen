# Koch V3 — Preparation package

> Status: **intent, dates and no-go list confirmed (2026-10-02, two answer rounds)** · 3 blocking questions left ·
> prepared 2026-10-01 against v2.13 (live)
> Owner: Marcel · Working docs for Marcel + Claude Code

V3 is the next major version of the Koch app. This folder does **not** start V3. It prepares
the decisions that have to be made before a single line of V3 code makes sense.

## What is in here

| File | What it answers | Read when |
|------|-----------------|-----------|
| [`../../ROADMAP-V3.md`](../../ROADMAP-V3.md) | **New 2026-10-04.** The V3 plan view: version plan, slices with targets, gates, v3.x backlog, open decisions. Wins over this folder on *when*; this folder explains *why* | To see what is planned for when |
| [`00-INTENT-AND-USER-STORIES.md`](00-INTENT-AND-USER-STORIES.md) | **New 2026-10-02.** Summary of what V3 is, success criteria, version ladder, user stories with acceptance criteria | First — the current state |
| [`V3-REPORT.html`](V3-REPORT.html) | The full report (~10 pages): baseline, decisions, scope, costs, risks, plan, recommendation | Background (written before Marcel's answers) |
| [`01-PROCESS.md`](01-PROCESS.md) | How a major version usually runs: phases, gates, deliverables | Before planning dates |
| [`02-SCOPE.md`](02-SCOPE.md) | Scope of work by workstream: what is in, what is out, sizes | When deciding what V3 *is* |
| [`03-QUESTIONS.md`](03-QUESTIONS.md) | Questions Marcel answers + checks Claude runs | The working checklist — fill it in |
| [`04-OPTIONS.md`](04-OPTIONS.md) | The 7 big decisions with options, trade-offs, a recommendation | When answering the decision questions |
| [`06-LEARNING-TRACK.md`](06-LEARNING-TRACK.md) | **New.** How Marcel learns along the way: challenges, notes, retros, AI working playbook | Before each slice |
| [`05-RISKS-MIGRATION.md`](05-RISKS-MIGRATION.md) | Risk register, data migration, rollback, legal checklist | Before the build phase |

## The one-paragraph version

v2 is healthy (206 tests, 4 languages, offline-first, Drive sync, partner list). **V3 is an
infrastructure release for friends and family with a public Play Store listing.** It stays a PWA,
moves to a custom domain with a landing page, gets an Android build via a Trusted Web Activity,
keeps each user's data in their own Google Drive, and keeps BYOK AI. The code is cleaned up, not
rebuilt (decided). New in V3: a guided onboarding tour with key setup, photo capture from camera
or gallery plus sharing a photo into the app, default photos, a "Gesund & Langlebig" hub, a
feedback button; cook match is removed. Features keep shipping in v2.x (calories, export/import,
easier recipe finding). Deferred: shared cookbook and backend (v3.x), AI spend display (v3.x),
payments (v3.5/v4). Dates: scope freeze 31 Dec 2026, launch target 30 Apr 2027, hard cutoff
31 May 2027. Budget: 2–3 hours a week, no revenue.

## How to use this folder

1. ~~Read the report.~~ Done.
2. ~~Work through `03-QUESTIONS.md`.~~ First round answered 2026-10-02 (log in Part 3 there).
3. ~~Second round~~ answered 2026-10-02: dates, no-go list, architecture, testers and more.
4. **Plan view:** since 2026-10-04 the dates, slices and backlog live in [`ROADMAP-V3.md`](../../ROADMAP-V3.md); what to do next across v2.x and V3 is in [`ROADMAP.md`](../../ROADMAP.md) → "Recommended next".
5. **Next:** three blocking questions in `03-QUESTIONS.md` Part 1: L1 (English as main language),
   A10 (shared weekly plan in or out), C7 (name and domain). Plus Marcel's task list there.
   Then Claude records D1–D8 as ADRs in `docs/v3/adr/`.
6. Only then: Claude writes the V3 phase plan (see `01-PROCESS.md`, Phase 4).

## Ground rules that carry over from v2 (do not break in V3)

- `rezepte.json` stays the **flat-v3 schema** in `SCHEMA.md`, additive fields only — **until
  decision D8 says otherwise.** The contract with v1 and project-Claude is dropped (v1 retires;
  only the in-app assistant edits recipes); what remains is the 30-day v2 fallback.
- **Canonical German** recipe data; translations are display overlays — **under review (D8)**:
  Marcel proposes English as the main language.
- **Near-zero third-party scripts** — this is a security control (the BYOK key lives in
  `localStorage`), not just a style choice.
- Every release bumps `BUILD` and the service-worker `CACHE`.
