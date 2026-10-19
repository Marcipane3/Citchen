# Koch QA fleet — shared conventions (every `koch-*` agent reads this first)

These rules apply to all seven agents. Each agent file adds its own lens on top. If an agent file and
this file disagree, the agent file wins for its lens; this file wins for **safety and format**.

---

## 1. Hard boundaries (non-negotiable)

- **Write exactly one file:** your own `qa/findings/<name>.md`. Nothing else — not app code, not tests,
  not `ROADMAP*.md`, not `SCHEMA.md`, not `rezepte.json`, not other agents' reports.
- **No state-changing git.** Allowed: `git status`, `git log`, `git diff`, `git show`, `git ls-files`,
  `git blame`. Forbidden: `checkout`, `switch`, `stash`, `reset`, `commit`, `add`, `restore`, `clean`,
  `push`, `pull`, `merge`, `rebase`. The working tree contains Marcel's uncommitted work — never touch it.
- **Scratch scripts go outside the repo.** If you write a probe script, put it in the OS temp dir
  (`$TEMP` / `/tmp`), never under the repo. Import app modules with `file:///` URLs on Windows
  (`node` rejects `C:\…` paths in `import()`), e.g.
  `import("file:///C:/Claude_files/Koch_Project/v2/src/features/shopping/logic.js")`.
- **No network writes.** Never call Drive, Supabase or Anthropic. Reading public docs is fine if your
  tools allow it; no production data access.

## 2. Ground truth before opinions (the reliability rules)

1. **Discover the current state; don't trust this file's or your own definition's snapshot of it.**
   Run `node v2/tests/run.js` (record `pass/total`), read `BUILD` from `v2/src/version.js` and `CACHE`
   from `v2/sw.js`, run `git log --oneline -10` and `git status --short`. Facts in agent definitions
   (test counts, file names, which features exist) can be stale — if they disagree with the tree, the
   tree wins and you note the drift in your report's `## Definition drift` line.
2. **Read your previous report first** (`qa/findings/<name>.md`, if it exists). Every old finding gets a
   status in the new report: `✅ fixed` (cite the commit/line that fixed it), `⏳ still open`
   (re-verified at the current line numbers), or `🗑 obsolete` (code removed / premise changed).
   Never silently drop an old finding and never re-report a fixed one as new.
3. **Evidence standard.** A finding needs at least one of:
   - **E1 executed** — you ran a probe (node script against the pure modules, a test, a grep count)
     and quote the output. Strongest.
   - **E2 traced** — you read the full code path end-to-end and cite every hop as `path:line`.
   - **E3 inferred** — plausible from partial reading. Allowed only with `confidence: low` and a
     concrete "how to confirm" step.
   Prefer E1 whenever the code is pure (most of `data/` and `features/*/logic.js`, `listMerge.js`,
   `friendMerge.js`, `derive.js`, `catalog.js`, `i18n.js` are).
4. **Try to refute yourself before writing a finding.** Look for the guard you might have missed
   (a caller that filters, a test that covers it, a comment explaining the intent). Record discarded
   hypotheses in `## Checked and refuted` — that saves the next run the same detour.
5. **Line numbers must be current.** Cite `path:line` from the tree you just read, not from a prior
   report.
6. **No padding.** A clean area is reported as clean in one line. Inventing issues to fill space is the
   worst failure mode of this fleet.

## 3. Field reports from Marcel (highest priority input)

Marcel's real-device observations live in `qa/FIELD-REPORTS.md` (IDs `FR-NN`) and may also be passed in
the spawn prompt. They beat any theoretical finding:
- Every agent checks whether any **open** field report touches its lens. If yes, it gets its own section
  `## Field reports` at the top of your report with: root-cause hypothesis(es) ranked, evidence level,
  the probe you ran, and what would confirm it on a device.
- If you can't reproduce it, say exactly what you tried and what you'd need (device, steps, data).
- Don't edit `FIELD-REPORTS.md` — the orchestrator updates statuses from your reports.

## 4. Finding IDs and format

- IDs are stable and prefixed per agent: `BH` bug-hunter · `AR` architect · `SI` simplifier ·
  `UX` ux-curator · `TW` test-warden · `RC` release-captain · `DG` data-guardian. Number sequentially
  (`BH-01`, `BH-02` …). **An ID never changes meaning** — carried-forward findings keep their old ID;
  new findings get the next free number (look at the previous report). Reports written before
  2026-10-12 had no IDs: assign IDs to their still-open items when you carry them forward.
- Every finding states: severity/impact · `confidence` · evidence level (E1/E2/E3) · `path:line` ·
  the concrete failure (input → wrong output, or user action → symptom) · suggested fix (direction
  only, never applied) · effort S/M/L.
- Severity scale (shared): **P0** data loss / app unusable · **P1** wrong behaviour a user will hit in
  normal use · **P2** wrong behaviour in an edge case, or a trap for the next change · **P3** polish.

## 5. Report skeleton (keep the order)

```
# <Agent> — findings (<UTC timestamp>)
_Build <BUILD> · CACHE <cache> · tests <pass>/<total> · HEAD <short-sha> · mode FULL|DELTA_

## Field reports            (only if one touches your lens)
## Status of previous findings   (table: ID · title · ✅/⏳/🗑 · note)
## New findings            (agent-specific format, highest severity first)
## Checked and refuted
## Verified clean          (areas you checked this run — so the next run can skip them)
## Definition drift        (one line: facts in your agent file that no longer match the tree, or "none")
## Summary                 (counts by severity + the single most valuable item)
```

## 6. Lens discipline

Stay in your lens; if you notice something squarely in another agent's lens, add one line to
`## Cross-lens notes` (e.g. "→ test-warden: `friendMerge.trimSeen` untested") instead of investigating
it fully. The orchestrator dedupes across agents, so a short pointer is enough.

## 7. Budget

Be thorough on the paths that matter (persistence, sync, anything touching `rezepte.json`, the shopping
list, the friends inbox), quick everywhere else. Stop when your lens is covered; don't re-read the whole
tree to pad confidence.
