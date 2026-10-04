# 03 · Questions and checks

> Updated **2026-10-02** after Marcel's **second** round of answers. Answered questions are in the
> log in Part 3. Part 1 holds only what is still open, plus Marcel's task list.

Three parts. **Part 1** is for Marcel: open questions. **Part 2** is for Claude Code: facts to
verify before anything is built (no input needed from Marcel). **Part 3** is the record of what
has been answered. Tick as you go; write the answer next to the question.

## Part 1 · Open questions for Marcel

### Blocking — needed before the V3 plan can be written

- [ ] **L1. English as the main language (decision D8).** You suggested switching the main
      language from German to English. "Main language" can mean three things; which do you want?
      *(a)* **Interface and store default:** a new user sees English first; German, Danish,
      Spanish stay selectable. Small. ·
      *(b)* **Stored recipe data:** the 105 base recipes are stored in English, German becomes a
      translation like the others; categories get language-neutral keys. Large: a new file-format
      version and a migration of your own Drive file. ·
      *(c)* **Code and docs:** already English, nothing to do.
      Recommendation: (a) + (b) in V3, done early, because it is far cheaper before strangers have
      data than after. Your own recipes stay in the language you wrote them in.
- [ ] **A10. Shared weekly plan.** You said include it, and you also confirmed the no-go "no new
      work on the weekly plan", and you rarely use the plan. It is medium to large work. Confirm
      one: *(a)* in v3.0 as an exception · *(b)* v3.x together with the shared cookbook
      (recommended). If (a): which is cut first at the cutoff, the shared plan or the
      "Gesund & Langlebig" hub?
- [ ] **C7. Name and domain.** Proposal: call the app **Citchen** everywhere (store, website,
      app), replacing "Koch". It matches the repository, it is your own joke, and "Koch" is a
      common word and surname that is hard to find in a store. Domain candidates, in order:
      `citchen.app` · `citchen.dk` · `citchen.de` · `citchen.kitchen` · `getcitchen.com`.
      Availability could not be checked from here; look them up at a registrar (2 minutes).
      Typical yearly prices: `.de` about €5–12, `.com` €10–15, `.dk` €10–15, `.app` €12–20,
      `.kitchen` €35–50. Recommendation: `citchen.app` (says "app", HTTPS is built in).

- [ ] **D9. Supabase from the friends link (new 2026-10-04).** v2.14 (I3) put a small Supabase
      backend into production: an inbox for friends' suggestions plus a view of your open items.
      No accounts, no recipe data. D4 and the no-go list say "no backend in v3.0". Confirm one:
      *(a)* carry it into v3.0 as a documented exception (recommended; the privacy policy and the
      Play data-safety form must then mention it) · *(b)* switch the friends link off for v3.0 and
      bring it back in v3.x with the backend option.

### Important — shape the scope

- [ ] **A11. "The prompt should be changed or adjusted."** Which prompt do you mean? *(a)* the
      assistant's built-in instructions should be reworked by us · *(b)* users should be able to
      edit the assistant's instructions themselves · *(c)* the tour should teach how to phrase
      requests to the AI.
- [ ] **E6. Assistant edits recipes.** The assistant inside the app should create and update
      recipes. Should it also delete? And should every change be shown for confirmation before it
      is saved (recommended)?
- [ ] **G7. Finding recipes.** You named this the hardest part. Pick the two that would help most:
      *(a)* photo grid instead of a text list · *(b)* sort by "recently cooked" / "most cooked" /
      "newest" · *(c)* favourites first · *(d)* filter chips (category, time, vegetarian) ·
      *(e)* search always visible at the top · *(f)* "to try" list. These go into v2.x.

### Assumed — tell me only if wrong

- **A6 #1** reworded to "no rebuild as a native Android/iPhone app (Kotlin/Swift)" and treated as
  confirmed, since you follow the architecture recommendation.
- **F8, stock tab:** stays where it is (no new work on stock).
- **G6:** slowness and data loss are stoppers; sync confusion is only annoying.
- **Onboarding tour:** can be skipped and reopened from the menu.
- **Store listing:** German, English, Danish, Spanish.

### Marcel's task list (no decision needed, just doing)

- [ ] Look up the domain candidates and buy one (C7). Then create the support address on it
      (e.g. `hello@…`), forwarded to your mailbox.
- [ ] Open the Google Play developer account ($25 once; identity verification takes days).
- [ ] Write down 12+ Android testers with their Google e-mail addresses.
- [ ] Two-account test of the shared shopping list with your partner (steps in `v2/docs/SHARING.md`).
- [ ] Collect or take photos of about 30 dishes you have cooked; note which recipe each belongs to.
- [ ] Review the sources for the "Gesund & Langlebig" hub when the draft exists.

## Part 2 · Checks Claude Code runs before building

No answers needed from Marcel here. Changes since 2026-10-01 are marked.

### Platform and store

- [ ] **C-1.** TWA verification. **Direction decided: custom domain** (C3 approved), which puts
      `/.well-known/assetlinks.json` at a root we control. Hosting can stay on GitHub Pages or move
      later; the domain is the anchor. Remaining check: build a test TWA against the domain and
      pass verification.
- [ ] **C-2.** Play requirements at enrolment time: target API level, closed-testing rule
      (currently 12 testers × 14 days for new personal accounts), identity verification steps,
      Data-safety form fields.
- [ ] **C-3.** Lighthouse ≥ 80 on the start page; offline start returns HTTP 200.
- [ ] **C-4.** iOS: PWA path still works on a current iOS (home-screen install, IndexedDB
      persistence, storage eviction). Matters more now: the partner is on iPhone.
- [ ] **C-20.** *(new)* Custom domain on this repository redirects **all** of
      `marcipane3.github.io/Citchen/` (v1 and v2 included) to the new origin. Decide: same
      repository with the move helper shipped in v2 first, or a separate repository for V3 so v2
      keeps its address during the parallel run.
- [ ] **C-22.** *(now firm: US-13 is a must)* Web Share Target in the manifest (share a photo into
      the app): support in the TWA; fallback for iOS PWAs, which do not support it.
- [ ] **C-26.** *(new)* E-mail on the custom domain: free forwarding at the registrar or DNS
      provider, so the support address needs no paid mailbox.

### Data and sync

- [ ] **C-5.** v1, v2 and v3 on one origin share IndexedDB and service-worker scope. Confirm DB
      names and SW scopes cannot collide (depends on C-20).
- [ ] **C-6.** Round-trip test: v3 reads the real `rezepte.json` (copy), writes it back unchanged.
- [ ] **C-7.** Extract the sync core; both instances (recipes LWW, list item-merge) pass the
      existing 206 tests plus two-instance tests.
- [ ] **C-8.** Google OAuth with a public listing: Testing mode caps at 100 test users and shows
      a warning screen. Confirm what production status needs for `drive.file` (non-sensitive scope)
      and the Picker: verified domain, privacy policy, branding review.
- [ ] **C-23.** *(moved to v2.x)* Recipe export/import: two formats (lossless file for import,
      Markdown for reading), schema validation on import, id-clash rule, behaviour without Drive.
- [ ] **C-27.** *(new, only if D8 = yes)* English as stored language: file-format version 4,
      language-neutral category keys, migration of an existing German file, and a v2.x release
      that can read version 4 so the 30-day fallback keeps working.
- [ ] **C-28.** *(new, only if A10 = in)* Shared weekly plan as a third file through the sync core:
      merge rule per day/slot, sharing via the same Picker flow as the list.

### AI and cost

- [ ] **C-9.** Model IDs current; `claude-sonnet-4-6` → `claude-sonnet-5-5` for capture; re-run a
      capture eval on 10 real photos/URLs.
- [ ] **C-10.** Measure real token usage per action from `response.usage`; replace the estimates
      in the report. Also the data source for the later spend display (US-12, v3.x).
- [ ] **C-11.** Prompt caching on the assistant system prompt.
- [ ] **C-12.** *(deferred to v3.5/v4)* Proxy design for a shared key. Only requirement now: all
      model calls stay behind `ai/client.js`.
- [ ] **C-24.** *(deferred to v3.x)* AI spend display: price table in one config, monthly counter,
      default limit, warning only (no block), wording that it is an estimate.

### Content

- [ ] **C-21.** *(new)* Photo pipeline on 5 sample recipes: resize/WebP step for Marcel's ~30 own
      photos, one AI image tool for the other ~75, real file sizes, one-time cost, licence terms.

### Quality and safety

- [ ] **C-13.** E2E suite covers: first run, language switch, add/edit recipe, capture review,
      cooking mode, shopping list, partner sync, offline start, update from v2. Planner → shopping
      stays in, at lower priority.
- [ ] **C-14.** Security pass: no new third-party scripts; CSP possible on the host?
- [ ] **C-15.** Accessibility spot check.
- [ ] **C-16.** QA fleet (architect, bug-hunter, data-guardian, release-captain) at G5.
- [ ] **C-25.** *(new)* Simplification baseline: lines, modules and duplication per area before
      the clean-up, so "cleaner" is measurable (US-22). Cook match is removed in the same pass.
- [ ] **C-29.** *(new)* Feedback button: pre-filled e-mail link; check it opens the mail app from
      the TWA and from an iOS PWA.

### Legal

- [ ] **C-17.** Privacy policy draft: Drive data stays with the user, AI calls go from the device
      to Anthropic with the user's own key, local storage, no tracking.
- [ ] **C-18.** Image licences for default photos; attribution for nutrition data (Frida/USDA).
- [ ] **C-19.** *(not applicable for v3.0: no monetisation)* DSA trader declaration.

## Part 3 · Answered (2026-10-02)

### Round 2

| ID | Question | Marcel's answer |
|----|----------|-----------------|
| B4 | Cutoff dates | **Accepted:** scope freeze 31 Dec 2026 · launch target 30 Apr 2027 · hard cutoff 31 May 2027. |
| A6 | No-go list | **Confirmed** #2–#9: no iPhone App Store, no accounts/backend, no payments/subscription/sponsored AI, no public links, no voice mode, no social-video import, no new screen except "Gesund & Langlebig", no new work on plan/stock/cook match. #1 was read as "human language" → clarified; raised the idea of English as main language → L1. |
| A7 | Household sharing | Export/import: yes. Shared cookbook: v3.x, first on Drive, backend later. Shared weekly plan: include. → A10 |
| A8 | AI features in V3 | Guided key setup with general AI instructions, as part of a new full onboarding tour · share a photo from the gallery into the app, and camera-or-gallery when capturing. Not in V3: spend display (v3.x), AI calorie estimate (v3.x). → A11 |
| A9 | Public listing | Yes to all: public listing, developer name visible, privacy policy, Google sign-in verification. Support e-mail on the new domain. |
| H1 | Architecture | **Follow the recommendation: no rebuild.** Plain JavaScript modules + small build script + clean-up (D3 = 3b). |
| G4 | Testers | 12 Android testers are no problem. |
| B6 | v2.x / V3 split | Agreed, with changes: export/import moves to v2.x; spend display leaves V3. |
| E3 | Project-Claude edits `rezepte.json`? | Not required. Only the assistant inside the app must be able to create and update recipes. → E6 |
| E5 | Export/import format | Both: a choice between "import into the app" (lossless file) and "readable for others" (Markdown). In v2.x. |
| D5 | Spending guard | Later (v3.x). Default monthly limit, **warning only**, plus a best-guess display of what was spent. |
| F6 | Default photos | About 30 own (dishes already cooked), the rest AI-generated. No style wish. |
| F7 | "Gesund & Langlebig" | A hub page. |
| F8 | Cook match | Fine to remove; not carried into V3. |
| G5 | Speed and finding | Nothing in v2 is slow. Finding recipes is the hard part (pictures, sorting). → G7 |
| C5 | Domain and website | No fixed name; likes "Citchen" (kitchen with a C). Wants proposals and prices. Landing page: yes, with explanation, documentation, project story and a button that starts the app. → C7 |
| C6 | Store name and languages | Name open, something funny like Citchen. Listing in all four languages. → C7 |
| H2 | Learning goals | Domain and DNS, hosting, app development, Google sign-in, and especially how to work well with AI; wants to be challenged. → `06-LEARNING-TRACK.md` |
| H3 | Feature ideas from friends | A feedback button inside the app; asked for the easiest way to receive it → pre-filled e-mail (US-24). |

### Round 1

| ID | Question | Marcel's answer |
|----|----------|-----------------|
| A1 | What should V3 do that v2 cannot? | Be in the Play Store, share with the household, more AI. Technically little more; rework for a cleaner, more correct architecture. |
| A2 | Who is it for? | More than Marcel: friends and family. Also a learning project and something for the CV. Website hosting is part of it. |
| A3 | What do others get that competitors lack? | No unique feature. Custom features, no ads, cheap, made by a friend so more trustworthy, a say in the roadmap. |
| A4 | Success after 3 months? | Website and Play listing online · Marcel and partner plan in the app · first random person has downloaded it. |
| A5 | No-gos? | Cannot name them; sees this as the biggest risk. Wants roadmap triage with Claude and a clear cutoff date. → A6, B4 |
| B1 | Hours per week? | 2–3 h maximum, for testing and decisions. Q4 no busier than before. |
| B2 | Deadline? | "When it's good"; good = published on a website and in the Play Store. Also wants a cutoff. → B4 |
| B3 | v2.x now or V3 focus? | Both, hand in hand: V3 = infrastructure, v2.x = features. → B6 |
| C1 | Play Store a real goal? | Yes. |
| C2 | iPhone? | Partner uses an iPhone; PWA is fine. They do not live together. |
| C3 | Custom domain? | Yes, €10–15/year is fine. |
| C4 | Retire v1? | Yes. |
| D1 | Earn money? | No. |
| D2 | Who pays for AI? | Each user brings a key. A payment screen could come in v3.5/v4. Wants a spend estimate with a limit that blocks. → D5 |
| D3 | AI budget for others? | €10/month at most, but does not want to pay for others. |
| D4 | Subscription? | Does not feel right for now. |
| E1 | Data must stay in own Drive? | Data must be private per user. Drive is liked for now; a database Marcel hosts would also be acceptable. |
| E2 | Accept a backend? | Yes in principle, not in v3.0; a v3.x topic. |
| E4 | Public recipe links? | No. Export/import through the share button instead. → E5 |
| F1 | Screens used? | Most: recipes, shopping list, AI. Sometimes: photo capture (most important for the future). Rarely: weekly plan. Background: stock. Never: cook match. |
| F2 | Default photos? | Mix: some own, rest AI-generated. Wanted to know the space cost (answered in `00-INTENT-AND-USER-STORIES.md`). → F6 |
| F3 | Calories? | v2.x first. |
| F4 | "Gesund & Langlebig"? | Part of V3. → F7 |
| F5 | Competitor envy? | Voice cooking mode and social-video import: nice someday, not needed now. |
| G1 | What would stop you? | Slowness; data loss; not finding things. Sync confusion is annoying but no stopper. → G5, G6 |
| G2 | Fewer features OK? | Yes, depending on the feature. Core: recipes, shopping, AI (photo + chat). Not core: weekly plan, fridge scan. |
| G3 | Testers? | Some good friends. → G4 |
| — | TWA verification (C-1) | Unsure, asked for an explanation. Explained in `00-INTENT-AND-USER-STORIES.md`; resolved by the custom domain. |
| — | Part 2 checks | No comment needed; Claude runs them. |
