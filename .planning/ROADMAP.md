# Roadmap: Koch v2 — Shopping List Sharing

## Overview

Single-phase roadmap to deliver I2 + I3 path A: a two-way shared shopping list persisted
to Google Drive with item-level merge semantics and Google Picker cross-account handshake.
Prereq I1 (share as plain text) shipped in v2.8. Multi-party-ready from day one.

## Phases

- [ ] **Phase 1: Shared Shopping List** - Persist list to Drive, item-level merge, Google Picker handshake, multi-party-ready (I2 + I3 path A)

## Phase Details

### Phase 1: Shared Shopping List
**Goal**: The shopping list is persisted to its own `einkaufsliste.json` on Google Drive with an item-level merge model. A second person (partner/friend with the app + Google account) can link to the same file once via the Google Picker and then both parties see each other's additions after a manual refresh. Design is multi-party-ready from day one (author field, union-merge semantics).
**Depends on**: Nothing (I1 already shipped as v2.8)
**Requirements**: [REQ-I2, REQ-I3A]
**Success Criteria** (what must be TRUE):
  1. Shopping list survives a full page reload (persisted to Drive, loaded on start)
  2. Adding an item on device A and refreshing on device B (same account) shows the item
  3. Partner on a different Google account can link to the shared list once via Picker; after relinking, their added items appear on the owner's list after a manual refresh
  4. Two concurrent adds (one per device/account) both survive — no item is lost
  5. Going offline queues changes; they push when back online
  6. `mergeList(local, remote)` is a pure function, unit-tested (at least 4 cases)
  7. The Drive recipe file (`rezepte.json`) is NOT affected by this change
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Item-level merge model + Drive persistence for shopping list (Wave 1)
- [ ] 01-02-PLAN.md — Google Picker handshake + cross-account sync UX (Wave 2)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Shopping List | 0/2 | Planned | - |
