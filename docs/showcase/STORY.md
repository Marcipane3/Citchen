# Citchen showcase brief

> **Purpose:** the one curated source for telling the Citchen story (portfolio website, talks, posts), so
> nobody has to mine the whole repo. It is a living document: update it through normal PRs.
> **Owner:** Marcel · **Status:** v0.3 draft, 2026-11-19 · **Audience of the story:** potential clients first,
> then recruiters and hiring managers, then peers, then family and friends.
> `[verify]` = a number that goes stale; refresh it before publishing and show an "as of" date.
> `[open]` = still needs Marcel's input.

## 1. One-liner and thesis

- **One-liner:** Citchen is a cookbook app I use every week. I built it with AI and run it through a
  governed pipeline of agents, with me as product owner and the only person who can release.
- **Thesis:** AI writes the code. What makes it work is the operating model around it: decisions on paper,
  checkable "done", independent review, a human release gate, and memory kept in the repo, not in the chat.
- **Who I am here:** industrial engineer and business process analyst, no coding background (a little at
  university). AI makes me about 100 times faster and better. I decide, answer questions, merge releases and
  test on a real phone. My job building a project management system gave me governance instincts, and asking
  what the real requirements are carried over to this project.
- **Goal of the story:** the visitor contacts me and tries the app. A secondary goal is to point toward AI
  governance and delivery work.

## 2. Origin story

1. I was writing recipes with Claude, the normal way, and they were great.
2. I wanted to save and reuse them, so I asked for an export. It gave me Markdown, which was not useful at all.
3. I said "let's go all in": started a project, put it on GitHub, learned how to work with it. This was May 2026.
4. **The first version took two evenings and a weekend (two days).** It was rapid prototyping, and it was
   fun.
5. The first feature was simply what I already had in the Claude chat, but as an app: the cookbook, cook
   mode, and the shopping list. The shopping list turned out to be the best feature.
6. The next big step was AI. Taking a photo of a recipe and having the app rebuild it as a recipe card was the
   moment of magic.
7. The app is built for me: I have a problem, I want to solve it, and I want the solution to be useful and cool.

## 3. The product, honestly

- Offline-first app you install from the browser. About 105 base recipes, cooking mode, shopping list sorted by
  supermarket aisle, planner, pantry stock, AI capture from a photo or link, and macros (added after a
  friend's request).
- Data lives in the user's own Google Drive. AI uses the user's own key (BYOK), so nobody pays for anyone else.
- Four languages (DE, EN, ES, DA). A small backend exists only for the friends link; no server holds your recipes.
- **How I really use it:** the shopping list twice a week, for real shopping, and it beats random lists or
  paper. The AI is my favourite part: I mostly use it to generate recipes, then skim the result and cook in a
  free style, doing it similarly. Example: it generated a naan for me because I was missing one; I refined it
  ("I've had it in restaurants, how do I do it right?", "I only have baking powder") and it adapted.
- Used today by me and one friend. No user quotes yet; none are invented.
- Live now: `https://marcipane3.github.io/Citchen/v2/` (v2.18) · domain `citchen.de` is bought and will link the
  app · Google Play only after launch (target 30 Apr 2027): no store badge before that.

## 4. Numbers that belong in the story

| Number | Where it comes from | Use |
|--------|---------------------|-----|
| First version in 2 evenings and a weekend | Marcel | hero |
| Shopping list used twice a week, for real | Marcel | hero |
| **25 AI requests cost 15 euro cents** (about 0.6 cent each) | Marcel read the in-app usage panel, Nov 2026 `[verify period]` | hero and cost block |
| Building with agents: about $9–10 per week, API-equivalent | pipeline doc §8, first two weeks, not an invoice | cost block |
| 2–3 hours of my time per week | Marcel | operating model |
| 600 automated unit tests, about 60 PRs (22 by agents), 130 commits | repo `next`, 2026-11-19 `[verify]` | quiet proof line, not a headline |
| v2.18 live, launch target 30 Apr 2027 | `ROADMAP.md` | timeline |

**Cost message:** AI in a normal app, for a normal person, is cheap. The expensive part is the building,
and that is exactly what a good operating model keeps under control.

## 5. The "watch it build" animation (real iteration, re-enacted)

Real sequence from my own use: I plan the week and shop weekly, so I wanted a **planner**. Then I noticed I
usually have **leftovers**, so the planner had to be adjusted for that. Then I wanted it all on the **shopping
list** directly. I built these by talking to the AI (voice) during the prototyping phase; for generating
recipes I mostly type now. I don't remember the exact words, so the animation is a **labelled re-enactment**:
speech bubbles and a record button for the voice version, typed bubbles for the other. A second small
scene: asking for naan, then refining it ("only baking powder"). Sample recipes: shakshuka (my favourite, in the
base recipes) and naan. No personal data in any screenshot or video.

## 6. The operating model

```
Roadmap (strategy) ──/refine──► Issues with status labels (work queue)
Marcel promotes to "planned" ─► ready ─► /build-next (nightly, one issue, test-first)
   ─► PR into `next` [CI: unit · e2e · policy] ─► /review-pr (independent)
   ─► merge into `next` ─► /release-prep (Wed + Sat: guard agents, GO/NO-GO)
   ─► release PR next→main ─► Marcel merges + tests on a phone = live
```

**My three jobs:** promote ideas to "planned" · answer questions (reply "ok" = accept the suggested default) ·
merge the release and test it on a real phone.

**Guardrails in plain words:** agents can't touch the deploy setup, their own instructions or the database ·
a release freeze while a release waits · nothing reaches production without my merge · the builder never
merges, the reviewer never writes code · limits on parallel work and review rounds · the AI's memory lives in
the repo (rules file, roadmap, decision records), not in a chat. Details: `docs/process/AGENT-PIPELINE.md`.

## 7. Learnings (forward-looking, governance first)

Priority order from Marcel: **(1) definitions and a structured way of working, (2) how AI works and staying on
top of it, (3) the personal side: how my role changed.**

1. **Roast my assumptions in the roadmap phase.** This is the hardest phase and the strongest learning. The AI
   asked me questions, but when my answers were not mature enough it did not push back enough, and things got
   built in the wrong direction. Looking at V3 I now see I added a lot on top that I never use: the swipe
   "match" and the Markdown export are the examples. Next time: ask the AI to challenge me in conversation
   (as it does in the chat), point out inconsistencies, and ask "what do you really want, is it feasible, does it
   make sense for other people?" Be precise about what I want.
2. **When the AI did push back, it helped.** On the database setup (Supabase or not) it said "but earlier you
   decided something else." I mostly followed its recommendations; this was a case where its memory of my
   earlier decisions mattered.
3. **Build fast, but know you will rebuild properly.** Fast prototyping gets you the first version in a
   weekend. Building things properly is a second, different job.
4. **Make "done" checkable.** Every change is proven by a test that fails without it, so I don't have to trust
   the AI's word. Definitions of ready and done are the backbone.
5. **A second pair of eyes.** Seven specialist reviewer agents and a human release gate. One field report
   ("ginger appears on my shopping list by itself") led to the root cause and to three more serious data-loss
   paths nobody had reported. The release gate stopped a real release on a data bug.
6. **Enforce rules in the system, not in the prompt.** A prompt can be ignored; a required check cannot.
7. **Treat the pipeline as a product.** It stalled when a tool image changed and when an answered question lost
   its label. Fixes: queue limits, a sweeper step, telling infrastructure failures from real ones.
8. **The personal one: I decide, the AI writes.** My role moved from writing to deciding. In the evenings I
   still stay on top of things and give input in small slices, 2–3 hours a week, without writing code. `[open]` Marcel:
   how do you keep up with what the AI changes?

## 8. What clients may hire me for (positioning, to sharpen)

Marcel's range: rolling out systems, building custom apps, and AI governance. Target: small and mid-size
businesses that could use AI but have no idea how to start. Large companies won't hire a small provider.
**Working recommendation:** lead with governance and rollout (the harder, scarcer skill, backed by the PPM
rollout experience), and show the app as proof that I can also build the first version. `[open]` to decide.

**Call to action (draft):** "Your team has a messy way of working and wants to try AI properly? Let's talk."

## 9. Credits

- **Henrik Malbrich, works at Google:** advice to build fast and keep going; input on the lab game. Marcel's
  brother, and he agreed to be mentioned. Use the text "works at Google", not a logo. `[open]` his own sentence.
- **A friend (name pending OK):** suggested and drove the macros feature, and loved the app.

## 10. Claims to avoid

- "No server": say "no server holds your recipes."
- "Built entirely by AI": say what I decide and do.
- Cost figures are estimates or app-reported numbers, not invoices. Use-cost numbers come from the in-app usage panel.
- V3 dates are targets. No Google Play badge until the listing exists.
- Never publish: backend project ids, keys, names of friends or partner without their OK, personal data in screenshots.
- No invented testimonials.

## 11. Refresh checklist (before each publish)

`node v2/tests/run.js` (tests) · `v2/src/version.js` (version) · GitHub PR/issue counts · the usage panel
(Settings → AI) for cost numbers · `ROADMAP.md` for dates.
