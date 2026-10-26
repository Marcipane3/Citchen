# 🍳 Koch — Roadmap index

> Start here. This page says **what is next** and where everything else lives.
> **Last updated: 2026-10-26** (v2.15.2 merged · v2.15.3 one item = one row + Lager beats 🛒 built) · Live: **v2.15.2** (v2.15.3 goes live on merge)

## The two roadmaps

| File | Covers | Boundary |
|------|--------|----------|
| **[ROADMAP-V2.md](ROADMAP-V2.md)** | The **v2.x line**: features + the foundation V3 needs, until V3 launches and v2 becomes the fallback | Ships on today's address and architecture, carries over into V3 unchanged |
| **[ROADMAP-V3.md](ROADMAP-V3.md)** | The **V3 line**: v3.0 infrastructure release (domain, Play Store, production backend, clean-up, onboarding), then v3.1, v3.x, v3.5/v4, someday | Needs the new domain, the Play build or the clean-up, or Marcel scheduled it after v3.0 |

Background and reasoning for V3: [`docs/v3/`](docs/v3/README.md). New idea after the scope freeze
(31 Dec 2026)? → `ROADMAP-V3.md`, tagged v3.x.

---

## The road to V3 at a glance

| When | V2 line | V3 line |
|------|---------|---------|
| **Oct 2026** | ✅ v2.14 friends link live (4 Oct) · ✅ e2e tests (12 Oct) + v2.14.1 hotfix · ✅ **v2.15** one sync core (19 Oct) · ✅ **v2.15.1** safe recipe sync · ✅ **v2.15.2** list data safety · ✅ **v2.15.3** list identity + Lager rules (built) · two-account sharing proof | ✅ Decisions D8, A10, D9, A11, E6, G7 answered (4 Oct) · open: D10, C7 availability |
| **Nov 2026** | **v2.15b** backend hardening · **v2.16** AI housekeeping · **v2.16b** shopping clarity · **v2.17** find recipes faster · **v2.18** export/import · ★ **R1 data-model spike** (ingredient model, format 4) | Long-lead: domain (Citchen), Play account, 12 testers |
| **Dec 2026** | **v2.19** ingredient master + calories | Spikes (TWA, sign-in, photos, **backend + hosting**) · ADRs · V3 plan · **scope freeze 31 Dec** |
| **Jan–Mar 2027** | **v2.19b** structured recipe editor + capture · **v2.20** assistant edits recipes + editable instructions · **v2.21** move helper + English format/UI (before the domain switch) · v2.22+ small wins if time | **v3.0-a1 … a9** = slices 1, **1b backend**, 2–7, 9 (slice 8 moved to v3.x) · closed test from slice 3 |
| **Apr 2027** | Fixes only | **v3.0 launch, target 30 Apr** |
| **May 2027** | 30-day read-only fallback | Buffer · **hard cutoff 31 May** → leftovers to v3.1 |
| **H2 2027** | Retired | v3.1 · v3.x (shared cookbook, spend display, longevity cards …) |

---

## ▶ Recommended next

The queue always holds the next **5** items across both lines, in order. Re-ranked with the flow
below every time an item is crossed off.

| # | Item | Line | Owner | Why now | Effort | Unblocks |
|---|------|------|-------|---------|--------|----------|
| 1 | **Merge + check v2.15.3 live** (one item = one row, Lager beats 🛒; includes v2.15.1/v2.15.2) | V2 | Marcel | Live beats new (rule 1). On the phone: build line shows v2.15.3 · Einkauf: tap 🔄 → one Ingwer row · a recipe with Ingwer → list, then tap the Ingwer tile → the same row counts up, the tile number matches · put Ingwer in the Kühlschrank → Thai curry → list has no Ingwer | 15 min | FR-01 closed |
| 2 | **Live friend test** (V2 P4) — PR #8 merged 2026-10-04 | V2 | Marcel | The backend piece should be proven with a real friend before it is hardened (P7). Now unblocked: the list code it writes into is fixed (v2.15.2) | 15 min | P7, closes I3 |
| 3 | **Two-account sharing proof** (V2 P3): Picker API key, partner as test user, run the test in `v2/docs/SHARING.md` | V2 | Marcel (Claude guides) | **Last open V3 gate item** (P1 ✅, P2 ✅). The e2e suite proves the flow with fake accounts; this is the real-phone proof — now on a clean list | ~45 min | V3 gate, US-06 |
| 4 | **v2.16b — shopping list clarity** (V2 T9) | V2 | Claude | Next list item after the identity rule: show why an item is on the list, undo for every list action, "+1 Ingwer → 3" feedback. **Live check on a phone first** (UX-12) | S–M | — |
| 5 | **v2.15b — backend hardening** (V2 P7) | V2 | Claude | After the live friend test (#2): migrations in the repo, advisor check, pause/backup plan | S–M | V3 slice 1b |

**Waiting on Marcel — from the QA fleet (2026-10-12), each a yes/no:**
*All answered:* T5 ✅ yes and T6 ✅ yes (26 Oct, built in v2.15.3) · T3 and T12 settled by v2.15.1 without a decision.

**Waiting on Marcel — 5-minute answers that unblock the queue** (details in `ROADMAP-V3.md` §6):
**D10** timing: accounts + recipe sharing in v3.0 or first in v3.x (recommended: v3.x) · **D11** sharing = send/invite, not public (recommended) · **R1** sign-off on the ingredient/unit spec (Nov) · **L1 nutrition** now resolved by R2, please confirm ·
**C7** check `citchen.app` / `citchen.de` availability, then buy. *Answered 2026-10-04 and now unblocked:*
G7 → v2.17 · E6 + A11 → v2.20 · D8 English → v2.21 · A10 → v3.x · D9 → P7 + slice 1b · C-20 same repo.

---

## How the next item is chosen (recommendation flow)

```mermaid
flowchart TD
    S([An item was crossed off]) --> A{Anything shipped but not live,<br/>or a P0 bug in the live app?}
    A -- yes --> A1[Do that first:<br/>merge, deploy, live test, hotfix]
    A -- no --> B{Open gate item for the<br/>next V3 gate?}
    B -- yes --> B1[Take the gate item<br/>that unblocks the most]
    B -- no --> C{Is the next item blocked<br/>by a Marcel decision?}
    C -- yes --> C1[Put the question in<br/>'Waiting on Marcel',<br/>take the next unblocked item]
    C -- no --> D{Core tier?<br/>recipes · shopping · AI capture/chat}
    D -- yes --> D1[Take it]
    D -- no --> E{Fits before the scope freeze<br/>or the cutoff?}
    E -- yes --> E1[Take it]
    E -- no --> E2[Move it to v3.x / v3.1<br/>in ROADMAP-V3.md]
```

**The rules behind it, in priority order**
1. **Live beats new.** Something built but not deployed or not verified on a real device comes first.
2. **Gates beat features.** Items that gate the next V3 gate (currently V2 P1–P3) come before anything else.
3. **Decisions are cheap, waiting is expensive.** A blocked item is never "next"; its question goes to Marcel instead, and the next unblocked item moves up.
4. **Core tier first.** Recipes + cooking mode, shopping list, AI capture and chat beat plan, stock and extras (usage tiers in `docs/v3/00-INTENT-AND-USER-STORIES.md`).
5. **Fits the week.** One release = one 2–3 h test session for Marcel. Split anything bigger.
6. **Dates win.** What can't make the scope freeze (31 Dec 2026) or the cutoff (31 May 2027) moves out, it doesn't stretch the date.

---

## Update rule — when an item is crossed off

Part of every release's definition of done (Claude Code does this; the release-captain agent checks it):

1. **Roadmap file:** mark the item ✅ with version + date. V2: move it to the shipped log. V3: set the status in its table.
2. **Version plan:** set that version's status to ✅; re-date later rows if something slipped.
3. **This page:** remove the item from **Recommended next**, run the flow, refill the queue to 5, update "Last updated" and the "at a glance" table if dates moved.
4. **docs/v3:** if the item closes a check (C-x) or story (US-x), tick it in `docs/v3/03-QUESTIONS.md`.
5. **Marcel answered a question:** record the answer in the roadmap row and in `docs/v3/03-QUESTIONS.md` Part 3, then unblock the dependent item.

---

## Other planning files

| File | What it is |
|------|------------|
| [`docs/v3/`](docs/v3/README.md) | V3 preparation package: intent, user stories, decisions D1–D10, questions, risks, learning track |
| [`v2/docs/SHARING.md`](v2/docs/SHARING.md) | How partner sharing and the friends link work + test steps |
| [`qa/FLEET-REPORT.md`](qa/FLEET-REPORT.md) | QA agent findings; promoted into a roadmap by hand (2026-10-12 run → V2 Epic T) |
| [`qa/FIELD-REPORTS.md`](qa/FIELD-REPORTS.md) | What you saw on a real device (`FR-NN`); the QA fleet root-causes these first |
| `.planning/ROADMAP.md` | Working file of the planning tool for the finished shared-list phase (v2.10). Not a product roadmap. |
| `SCHEMA.md` | The `rezepte.json` contract |