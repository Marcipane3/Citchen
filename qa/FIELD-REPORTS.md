# Field reports — what Marcel saw on a real device

Real-use observations that the fleet must root-cause. They outrank theoretical findings.
Agents read this file but never edit it; the orchestrator updates the status after each fleet run.

| ID | Reported | Area | Observation | Status |
|----|----------|------|-------------|--------|
| FR-01 | 2026-10-12 | Shopping list | "Ingwer" gets added to the shopping list **randomly and multiple times, without me selecting it**. | 🎯 root-caused 2026-10-12 — DG-04 (id-less Drive item multiplies per sync) + BH-04/05/06/07, DG-08/09. Needs device confirm + fix. See FLEET-REPORT.md. **Planned:** v2.15.2 (ROADMAP-V2 T4–T8, T10) — v2.15 (one sync core) did not change this code path |

---

## FR-01 — Ingwer appears in the shopping list on its own

**Observation (Marcel, 2026-10-12):** In the shopping list, the item "Ingwer" gets added randomly and
multiple times without selecting it.

**Unknowns to pin down with Marcel if the code can't decide it:** which device(s); whether it shows as
one row with a growing count/amount or as several separate rows; whether it happens right after using
"Plan → Einkaufsliste" / "Rezept → Zutaten auf die Liste", after opening the app, or after a
partner/friends-link sync; whether a partner list or the friends link is active.

**Orchestrator's leads (2026-10-12, verified by a node probe against `rezepte.json`):**
- "Ingwer" sits in **6 recipes, all with the 🛒 marker**, so every recipe/plan → list action pulls it in.
- The same ingredient produces **different merge keys**: `"1 Stück Ingwer, gerieben 🛒"` →
  `ingwer, gerieben|stück`; `"1 Stück Ingwer 🛒"` → `ingwer|stück`; the catalog tile → `ingwer|`
  (no unit). Three keys = up to three separate "Ingwer" rows that never merge
  (`features/shopping/logic.js` `itemKey` / `mergeItems`, `shopping.js` `shopAdd`).
- The catalog badge (`shopping.js` `catItemHTML`) matches by name only, so it can show a recipe row's
  `qty` while tapping the tile creates yet another row.
- Partner/friend merges (`listMerge.mergeList`, `friendMerge.applyFriendItems`) union by **id**, so the
  same item added independently on two devices stays duplicated.
- Not yet explained: the "randomly, without selecting" part. Candidates to rule in/out: a sync/inbox
  path re-applying items (`friendInbox.doSync` → `applyExternal`, `seen`/`fl_ack` ordering,
  `trimSeen`), tombstone revival in `mergeItems`/`shopAdd`, a background `listSync` merge reviving a
  deleted item with an older/newer `updated`, or an unintended tap target (catalog grid shifting under
  the finger when `paintList` re-renders above it).
