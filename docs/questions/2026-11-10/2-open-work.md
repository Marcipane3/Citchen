# 2 · Open work: PR #58, PR #57, issue triage, v2.18

### 2.1 Merge PR #58 into `next` — this restarts the pipeline

[PR #58](https://github.com/Marcipane3/Citchen/pull/58) contains, as separate commits:
1. **CI fix.** GitHub moved `ubuntu-latest` to Ubuntu 26; the pinned Playwright cannot install its
   browser there. Every PR has been red since 10 Nov and the builder stops each night behind PR #57.
   The e2e job is pinned to `ubuntu-24.04`.
2. **The last v2.18 items:** #36 (import file treated as untrusted, your three `ok` defaults), #50
   (newer formats refused, ids trimmed, export file documented in `SCHEMA.md`), #49 (two different
   recipes with the same id no longer replace each other on Drive sync), #52 (round-trip tests), #39
   (undo button and tab badge readable in daylight).
3. **Pipeline skill fixes** and docs (file 1).
4. **R1 spec draft** and these question files.

Tests: 427 unit + 53 end-to-end, green locally; each new rule was checked by switching it off and
watching its test fail. One thing to know: #49 changes the recipe merge (`recipeMerge.js`), the most
sensitive code in the app. It only acts in a case that lost a recipe before; details under "Risks" in
the PR.

- **Recommended: merge with "Squash and merge"** once CI is green.
- After the merge I do the rest (this session is watching the PR): re-run CI on PR #57, remove its
  `needs-human` label, and set the five issues to `status:merged`. The reviewer then merges #57 on its
  next run.

Answer:

### 2.2 Close #37 as delivered

[#37](https://github.com/Marcipane3/Citchen/issues/37) "Whole-cookbook import duplicates all shared
base recipes" is what #48 fixed (merged 8 Nov: identical recipes are skipped). The refiner noticed but
may not close issues.

- **Recommended: close it** (reason "completed"). Say `ok` and I close it.

Answer:

### 2.3 Promote #53 (import/export polish)?

[#53](https://github.com/Marcipane3/Citchen/issues/53), proposed by the release guard pass, three small
things: the import result sheet shows German error reasons in every language · no download fallback
when sharing fails for a reason other than "cancelled" · a guard that stops translated text from being
exported can be bypassed by a copied recipe object.

- **Recommended: yes, `status:planned`**, size S. The first point got more visible with #36, which
  adds more reasons (size caps, removed image address). English is the default language since #43.

Answer:

### 2.4 Roll the contrast fix out to the other orange buttons?

#39 fixed the two elements the audit named. Nine more places put white text on the same orange (FAB,
save button, segmented control, step numbers, running timer, add button, tile badge, your chat bubble,
primary button). Large bold text passes at the old values; small text does not.

- **(a) Recommended:** apply the new pair to the **small-text** spots only (add button, tile badge,
  chat bubble, segmented control). Light theme: a slightly darker orange behind white text. Dark
  theme: dark text on orange.
- (b) Apply it everywhere, for one consistent look. Visible change to the main buttons.
- (c) Leave it.

Look at the new undo button on your phone first (it is in PR #58); it shows exactly what (a) and (b)
would look like.

Answer:

### 2.5 v2.18 release

Everything planned for v2.18 is built once #58 and #57 are merged: export file, readable Markdown
share, import with result sheet, English as default, the import hardening, two sort fixes, contrast.
The next scheduled release prep is **Saturday 14 Nov**; it runs the guard pass, bumps the version and
opens the release PR with the device checklist.

- **Recommended: wait for Saturday.** Nothing in v2.18 is urgent.
- Alternative: say "release now" after 2.1 and I run `/release-prep` in a session (about $3 of usage).

Answer:

### 2.6 Chat model (Q5 from the roadmap) — needs your usage numbers

v2.16 has been live for two weeks, so the usage log on your phone now has real numbers. Settings → KI →
"Verbrauch" → "Als JSON kopieren", paste it into a session. With that I can (1) answer Q5 with facts
(move the chat from Haiku 4.5 to the 5.5 generation; roadmap says about 10× cheaper and the prompt
cache would work for every cookbook size) and (2) replace the cost estimates in the V3 report.

- **Recommended: yes to Q5**, switch after I have checked 10 real assistant answers on the new model.

Answer:

---

**Still open on your side from the roadmap** (not new, listed so they are in one place; details in
`ROADMAP.md` → "Recommended next" items 1–3):
- v2.16 capture check on 10 real recipes (6 photos, 4 URLs) — 20 min
- Live friend test of the friends link (P4) — 15 min
- Two-account sharing proof with your partner (P3) — 45 min, last open V3 gate item
- GitHub → Actions → "Supabase keep-alive" → Run workflow once — 1 min
