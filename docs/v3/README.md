# Koch V3 — Preparation package

> Status: **preparation, nothing decided yet** · Prepared 2026-10-01 against v2.13 (live)
> Owner: Marcel · Working docs for Marcel + Claude Code

V3 is the next major version of the Koch app. This folder does **not** start V3. It prepares
the decisions that have to be made before a single line of V3 code makes sense.

## What is in here

| File | What it answers | Read when |
|------|-----------------|-----------|
| [`V3-REPORT.html`](V3-REPORT.html) | The full report (~10 pages): baseline, decisions, scope, costs, risks, plan, recommendation | First — the overview |
| [`01-PROCESS.md`](01-PROCESS.md) | How a major version usually runs: phases, gates, deliverables | Before planning dates |
| [`02-SCOPE.md`](02-SCOPE.md) | Scope of work by workstream: what is in, what is out, sizes | When deciding what V3 *is* |
| [`03-QUESTIONS.md`](03-QUESTIONS.md) | Questions Marcel answers + checks Claude runs | The working checklist — fill it in |
| [`04-OPTIONS.md`](04-OPTIONS.md) | The 7 big decisions with options, trade-offs, a recommendation | When answering the decision questions |
| [`05-RISKS-MIGRATION.md`](05-RISKS-MIGRATION.md) | Risk register, data migration, rollback, legal checklist | Before the build phase |

## The one-paragraph version

v2 is healthy (206 tests, 4 languages, offline-first, Drive sync, partner list). A V3 only makes
sense if something **outside the code** changes: who the app is for, where it is distributed, or
how AI is paid for. Decide that first (Decision D1 "audience"). The recommended default is
**"V3 Personal Pro"**: stay a PWA, add an Android Play Store build via a Trusted Web Activity on a
custom domain, keep each user's data in their own Google Drive, keep BYOK AI, add default food
photos, and pay down the two structural debts (one sync core, end-to-end tests). Move to a
"product" path (accounts, backend, payments) only after a measured validation gate.

## How to use this folder

1. Read the report.
2. Work through `03-QUESTIONS.md`. Tick what you can answer; mark the rest "open".
3. Tell Claude Code your answers to **D1–D7**. Claude records each as an ADR in `docs/v3/adr/`.
4. Only then: Claude writes the V3 phase plan (see `01-PROCESS.md`, Phase 4).

## Ground rules that carry over from v2 (do not break in V3)

- `rezepte.json` stays the **flat-v3 schema** in `SCHEMA.md` — it is a contract with v1 and
  project-Claude. Additive fields only.
- **Canonical German** recipe data; translations are display overlays.
- **Near-zero third-party scripts** — this is a security control (the BYOK key lives in
  `localStorage`), not just a style choice.
- Every release bumps `BUILD` and the service-worker `CACHE`.
