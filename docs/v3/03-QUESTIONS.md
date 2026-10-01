# 03 · Questions and checks

Two lists. **Part 1** is for Marcel: decisions only the owner can make. **Part 2** is for Claude
Code: facts to verify before anything is built. Tick as you go; write the answer next to the
question. Unanswered is fine. Unknown is information too.

## Part 1 · Questions for Marcel

### A. Why and for whom (decides everything else)

- [ ] **A1.** In one sentence: what should V3 let you (or others) do that v2 cannot?
- [ ] **A2.** Who is V3 for? *Only me + partner* · *friends & family (≤ 100)* · *anyone (public)*.
- [ ] **A3.** If it is for others: what do they get from it that Paprika, Mealime or Samsung Food do not
      give them? (Candidates: privacy — data stays in their own Drive; pantry-aware AI; DE/DA/EN/ES.)
- [ ] **A4.** What does success look like 3 months after launch? Pick one measurable thing
      (e.g. "partner and I plan every week in the app", "20 weekly active users").
- [ ] **A5.** What is explicitly **not** part of V3? (Write 3–5 no-gos.)

### B. Time and energy

- [ ] **B1.** How many hours per week can you give V3 for testing and decisions, Oct 2026 – Mar 2027?
      (Your contract ends Dec 2026; Q4 is likely busy.)
- [ ] **B2.** Is there a date V3 must be ready for, or is "when it's good" fine?
- [ ] **B3.** Would you rather ship small v2.x improvements now (calories, sharing) and start V3 in
      2027, or pause v2.x and focus on V3?

### C. Distribution

- [ ] **C1.** Is the Google Play Store a real goal, or is "install from the browser" enough?
- [ ] **C2.** Do you or your partner use an iPhone? (iOS App Store is the expensive, uncertain part.)
- [ ] **C3.** Are you OK buying a custom domain (~€10–15/year)? It is needed for a clean Play build
      and makes the app independent of the GitHub username.
- [ ] **C4.** Can v1 (the old app at the repo root) be retired?

### D. Money and AI

- [ ] **D1.** Should V3 ever earn money? *No* · *cover my costs* · *side income*.
- [ ] **D2.** Who pays for AI? *Each user brings a key (BYOK, today)* · *I pay for friends & family
      up to a cap* · *paid subscription*.
- [ ] **D3.** Monthly AI budget you would accept if you paid for others (e.g. €10 / €25 / €50)?
- [ ] **D4.** Would a subscription (e.g. €2.99/month) feel right for this app? Would *you* pay it?

### E. Data and privacy

- [ ] **E1.** Must every user's data stay in their own Google Drive (today's privacy promise)?
- [ ] **E2.** Would you accept a backend database (Supabase/Firebase) if it made sharing and
      accounts easier? Who would be the data controller under GDPR then? (You.)
- [ ] **E3.** Must project-Claude keep editing `rezepte.json` directly? (Yes today. It fixes the schema.)
- [ ] **E4.** Should recipes be shareable as public links?

### F. Features and content

- [ ] **F1.** Which v2 screens do you actually use weekly? Which never? (Candidates to drop.)
- [ ] **F2.** Default food photos for the base recipes: AI-generated, licensed stock, or your own?
- [ ] **F3.** Calories and macros (Epic L): part of V3, or a v2.x release first?
- [ ] **F4.** "Gesund & Langlebig" (Epic N): in V3 or later?
- [ ] **F5.** Anything from competitors you envy? (voice cooking mode, social-video import, …)

### G. Quality bar

- [ ] **G1.** What would make you stop using the app? (Data loss, slowness, sync confusion, …)
- [ ] **G2.** Is it OK for V3 to launch with fewer features than v2 if it is more solid?
- [ ] **G3.** Who besides you and your partner will test? (Play needs a closed-test group.)

## Part 2 · Checks Claude Code runs before building

### Platform and store

- [ ] **C-1.** TWA verification: Digital Asset Links must be served from the domain root
      (`/.well-known/assetlinks.json`). On `marcipane3.github.io/Citchen/` the root belongs to the
      user-site repo, not this repo → confirm custom domain or user-site repo approach.
- [ ] **C-2.** Current Play requirements at enrolment time: target API level, closed-testing rule for
      new personal developer accounts (testers × days), Data-safety form fields.
- [ ] **C-3.** Lighthouse ≥ 80 on the v2/v3 start page (TWA quality bar); offline start returns
      HTTP 200 (not a 404) for the start URL.
- [ ] **C-4.** iOS: confirm the PWA path still works (home-screen install, IndexedDB persistence,
      storage eviction rules) on a current iOS.

### Data and sync

- [ ] **C-5.** v1, v2 and a v3 path share the origin `marcipane3.github.io` → shared IndexedDB and
      service-worker scope. Confirm DB names and SW scopes cannot collide.
- [ ] **C-6.** Round-trip test: v3 reads the real `rezepte.json` (copy), writes it back unchanged.
- [ ] **C-7.** Extract the sync core; prove both instances (recipes LWW, list item-merge) pass the
      existing 206 tests plus two-instance tests.
- [ ] **C-8.** Google OAuth: limits in Testing mode (test-user cap, consent re-prompts) and what
      production verification needs for the `drive.file` scope (non-sensitive) and the Picker.

### AI and cost

- [ ] **C-9.** Model IDs current; `claude-sonnet-4-6` (vision/URL capture) → `claude-sonnet-5-5`
      supports image input and `web_fetch_20260209`; re-run a capture eval on 10 real photos/URLs.
- [ ] **C-10.** Measure real token usage per action (photo scan, URL import, chat) from
      `response.usage`, replace the estimates in the report.
- [ ] **C-11.** Prompt caching on the assistant system prompt (it repeats the full recipe list).
- [ ] **C-12.** If a shared key is ever used: proxy design with per-user quotas; key never in client code.

### Quality and safety

- [ ] **C-13.** E2E suite covers: first run, language switch, add/edit recipe, capture review,
      cooking mode, planner → shopping, partner sync, offline start, update from v2.
- [ ] **C-14.** Security pass: no new third-party scripts; CSP header possible on the new host?
- [ ] **C-15.** Accessibility spot check (focus order, contrast in both themes, screen-reader labels).
- [ ] **C-16.** Run the QA fleet (architect, bug-hunter, data-guardian, release-captain) at G5.

### Legal

- [ ] **C-17.** Privacy policy draft covering: Google Drive data (stays with user), Anthropic API
      (BYOK: user's own contract), local storage, no tracking.
- [ ] **C-18.** Image licences for default photos; attribution text for nutrition data (Frida/USDA).
- [ ] **C-19.** If monetised in the EU: DSA trader declaration and contact details on the listing.
