# 01 · How a major version works

A major version (v2 → v3) is different from a feature release. A feature release adds to a
structure that stays. A major version is allowed to change the structure: the platform, the data
model, the distribution channel, the business model. That freedom is what makes it risky. The
usual failure is not bad code, it is **rebuilding everything without a reason**, then carrying the
old problems into the new structure.

The standard answer is a **stage-gate** process, the same idea as product development or
capital projects: short phases, each ending in a gate with explicit exit criteria. You only pay for
the next phase once the previous one has produced its evidence.

## The phases

| # | Phase | Purpose | Main deliverables | Typical length (part-time) |
|---|-------|---------|-------------------|-----------------------------|
| 0 | **Intent** | Why a V3 at all? What changes in the world, not just in the code? | One-page intent: purpose, audience, success metric, time budget, no-go list | ~1 week |
| 1 | **Discovery** | Learn what actually matters. Use real usage, not assumptions. | Usage review of v2 (what is used, what not), partner interview, pain list ranked, 3–5 competitor notes | 1–2 weeks |
| 2 | **Decisions** | Settle the structural questions on paper | ADRs for D1–D7 (`04-OPTIONS.md`), each with context, options, decision, consequences | ~1 week |
| 3 | **Spikes** | Prove or kill the risky assumptions with throwaway prototypes | E.g. TWA build passes Play checks; sync-core extraction; photo pipeline size; payment proxy (only if needed) | 1–2 weeks |
| 4 | **Plan** | Turn decisions into a buildable plan | Milestones, MVP slice, test plan, migration plan, release plan | a few days |
| 5 | **Build** | Implement in vertical slices, behind flags, parallel to v2 | Working increments in `/v3`, weekly test builds, docs | 4–8 weeks |
| 6 | **Beta** | Real users, real devices, real data | Closed testing track (Play), partner + testers, bug triage, migration rehearsal | 2–4 weeks |
| 7 | **Launch** | Switch the default, keep a way back | Store listing, privacy policy, v2 kept read-only as fallback, announcement | ~1 week |
| 8 | **Operate** | Keep it healthy | Monthly cost check, quarterly QA fleet run, backlog grooming | ongoing |

Realistic total for a part-time, single-owner project with Claude Code doing the implementation:
**3–5 months** from Intent to Launch. Phases 0–4 are cheap (mostly thinking). Phase 5 is where
time and risk concentrate.

## The gates

Each gate is a yes/no question with evidence. If the answer is no, you loop back, you do not
push forward.

| Gate | Question | Evidence required |
|------|----------|-------------------|
| **G0** after Intent | Is there a reason for V3 that v2.x releases cannot deliver? | Written intent; at least one item that needs a structural change |
| **G1** after Discovery | Do we know which problems matter most? | Ranked pain list backed by usage or interviews |
| **G2** after Decisions | Are D1–D7 decided and recorded? | ADRs merged; open questions listed with owners |
| **G3** after Spikes | Is every high-risk assumption proven? | Spike results: works / does not work / cost |
| **G4** after Plan | Is the MVP small enough to finish in ≤ 8 weeks? | Plan with slices, each slice independently shippable |
| **G5** after Build | Feature-complete and safe to put in front of users? | All tests green, e2e suite, migration rehearsed on a copy of real data |
| **G6** after Beta | Ready for everyone? | Exit criteria met: no data loss, sync verified across 2 accounts, crash-free, cost within budget |
| **G7** after Launch | Is the switch reversible for 30 days? | v2 fallback works; backups exist |

## Ways of working during the build

- **Parallel run.** v3 lives in `/v3` (or on a new domain) while v2 stays live. Nobody is forced to
  switch until G6. This is how v2 was built next to v1, and it worked.
- **Vertical slices.** Each slice goes end to end (UI + data + test + docs) and could ship alone.
  No "backend first, UI later" phases.
- **Feature flags** for anything half-done (`flags.js` already exists).
- **Definition of Ready** for a slice: acceptance criteria written, data impact known, test idea
  known. **Definition of Done:** tests green, i18n in all 4 languages, dark + light checked, phone
  width checked, changelog line, roadmap updated.
- **One decision log.** Every structural choice gets an ADR. Re-opening a decision means writing a
  new ADR that supersedes the old one, not quietly changing course.
- **Weekly demo.** A short check of the running build on a phone. Catches the "works in tests,
  feels wrong in the hand" class of problem early.

## What usually goes wrong (and the counter-measure)

| Failure pattern | Counter-measure |
|-----------------|-----------------|
| "While we're at it" scope creep | No-go list in the Intent; G4 caps the MVP at 8 weeks |
| Big-bang rewrite that never ships | Parallel run + vertical slices; v2 stays the product until G6 |
| Data migration treated as an afterthought | Migration is its own workstream with a rehearsal at G5 |
| New stack chosen for fashion | ADR must name the problem the stack solves |
| Store/legal work discovered at launch | Legal + store checklist starts in Phase 3, not Phase 7 |
| Old bugs carried forward | Every v2 regression test runs against v3 from day one |
| Owner runs out of time | Time budget stated in the Intent; phases sized to it |

## Roles

| Role | Who | Responsibility |
|------|-----|----------------|
| Product owner / decider | Marcel | Intent, decisions D1–D7, priorities, acceptance at every gate |
| Implementer / architect | Claude Code | Spikes, ADR drafts, code, tests, docs, release mechanics |
| Reviewers | QA agent fleet (`.claude/agents/koch-*`) | Architecture, bugs, data integrity, UX, release gate before each beta build |
| Testers | Marcel, partner, (Play closed-test group) | Real-device testing, feedback |
