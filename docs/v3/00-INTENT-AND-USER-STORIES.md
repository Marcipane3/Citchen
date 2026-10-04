# 00 · V3 intent, summary and user stories

> Status: **intent confirmed in two answer rounds (2026-10-02)** · not yet a build plan
> Source: Marcel's voice answers to `03-QUESTIONS.md`. Round 2 confirmed the dates and the no-go
> list and changed several priorities (marked ②). Open points are at the end. Nothing here changes code.

## Summary

**V3 is an infrastructure release, not a feature release.** It takes the app that works today and
puts it on a proper footing: a public Google Play listing, its own web address, a cleaner code
base, and a first-run experience that works for people who are not Marcel. Features keep arriving
through v2.x releases and carry over.

| | |
|---|---|
| **What V3 is** | Koch in the Play Store + on a custom domain, for Marcel, his partner, friends and family, and whoever finds it. Cleaner architecture. Household sharing that really works. AI as the centre of the app. |
| **What V3 is not** | A rewrite in a new language, a business, a subscription, an iPhone App Store app, or a backend with accounts. |
| **Why do it** | (1) The challenge and the learning: domain, hosting, store release, sign-in verification. (2) Something to show: a real Play Store app for the CV. (3) Friends and family get an app that is ad-free, cheap, made by someone they know, and whose roadmap they can influence. |
| **Honest positioning** | Other apps can do the same things. Koch does not need a unique feature. Its value is trust, no ads, no price, custom features on request. |
| **Who pays** | Nobody pays Marcel. Each user brings their own AI key (BYOK). Fixed cost: domain ~€10–15/year + Play fee $25 once. |
| **Marcel's time** | 2–3 hours per week, for testing and decisions. Claude Code builds. |
| **Biggest risk** | Scope. Countered by the confirmed no-go list and the confirmed dates below. ② |

### Success (3 months after launch)

1. **It is online:** the website on the custom domain and the Play Store listing are both live.
2. **It is used at home:** Marcel and his partner plan and shop with it.
3. **One stranger:** at least one person Marcel does not know has installed it.

### Dates (confirmed ②)

**Scope freeze 31 Dec 2026** · **launch target 30 Apr 2027** · **hard cutoff 31 May 2027**
(unfinished slices move to v3.1; V3 ships anyway).

### Version ladder (Marcel's framing, written down)

| Version | Theme | Contains |
|---------|-------|----------|
| **v2.x** (now → launch) | Features + foundation | Calories and macros (Epic L1–L3), partner-sharing proof, one sync core, end-to-end tests, capture on Sonnet 5.5, **recipe export/import ②**, **easier recipe finding ②**, small fixes |
| **v3.0** | Infrastructure + reach | Custom domain + landing page, Play Store build (TWA), code clean-up, **guided onboarding tour incl. key setup ②**, **photo capture from camera or gallery + share into the app ②**, **shared weekly plan ②** (to confirm, A10), default photos, "Gesund & Langlebig" hub, feedback button, cook match removed. Possibly English as the main language (open, D8). |
| **v3.x** | Sharing + data options | Shared household cookbook (first on Google Drive, later on a backend) ②, optional backend database, AI spend display with warning ②, AI calorie estimate ②, longevity badges and ingredient cards |
| **v3.5 / v4** | Money (only if wanted) | Payment screen or sponsored AI quota via a proxy. No subscription planned. |
| **Someday** | Envy list | Voice cooking mode, social-video import, iPhone App Store |

## How Marcel uses the app today (drives priorities)

| Tier | Screens / features | Consequence for V3 |
|------|--------------------|--------------------|
| **Core** — must be fast and solid at launch | Recipes + cooking mode · Shopping list (most used) · AI: photo capture and chat | Launch blockers. Performance budget and e2e tests focus here. |
| **Core, growing** | Recipe capture by photo ("save this recipe for me") | Named the most important AI path for the future. Gets the shortest route in the UI. |
| **Background** | Stock (Lager), fridge scan | Must keep working because AI and shopping rely on it. No new work. |
| **Attachment** | Weekly plan | Stays, is not a launch blocker. |
| **Removed in V3** ② | Cook match | Never used. Not carried into V3. |

V3 may launch with **fewer** features than v2 as long as the core tier is complete.

## User stories

Priority: **M** must for v3.0 · **S** should · **C** could · **L** later (not v3.0).
Roles: *Marcel* (owner), *partner* (iPhone, separate household), *friend* (invited, Android or
iPhone), *stranger* (found it in the Play Store).

### Epic 1 · Get the app

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-01 | As **Marcel**, I want Koch listed in the Google Play Store so that it is a real, showable app. | Public production listing · installs and opens full screen without a browser bar · starts offline · Lighthouse ≥ 80 · listing has screenshots, description, privacy policy link | M |
| US-02 | As **any user**, I want to open Koch at its own web address and install it from the browser, so that it works on iPhone and laptop too. | Custom domain serves the app over HTTPS · "Add to Home Screen" works on a current iOS · same data as the Play build | M |
| US-03 | As a **stranger**, I want a guided tour on first start that clicks through the features with me, so that I understand how everything works. ② | Starts on first run · walks through recipes, cooking mode, shopping list, capture, AI · explains what Google sign-in and an AI key add · ends with "understood" · can be skipped and reopened from the menu · all 4 languages · the app is usable without a Google account or AI key afterwards | M |
| US-04 | As a **v2 user**, I want to move to the new address without losing anything. | "Move to the new app" helper exports local-only data (stock, fridge, profile, settings) · warns if edits are unsynced · AI key is re-entered, and the app says so | M |
| US-05 | As **Marcel**, I want v1 gone, so that there is one app. | v1 redirects to the current app · v2 stays reachable for 30 days after launch | S |

### Epic 2 · Share with my household

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-06 | As **Marcel**, I want to share the shopping list with my partner, who uses an iPhone and lives elsewhere, so that either of us can add and tick off items. | Proven with two real Google accounts · Android (Play build) + iPhone (PWA) · both edit offline, changes merge per item · no item lost | M |
| US-07 | As a **user**, I want to send one recipe to someone with the share button, and they import it into their app. | Export asks: "for import into the app" (lossless file) or "readable for others" (Markdown) ② · recipient imports the file and the recipe appears in their cookbook · works without Google Drive on either side · import is validated against `SCHEMA.md` · an id clash never overwrites an existing recipe | **v2.x** ② |
| US-08 | As a **household**, we want one shared weekly plan. ② | Same sharing mechanism as the shopping list (one more file through the sync core) · both edit, changes merge per day/slot · *conflicts with no-go "no new work on the weekly plan" — to confirm, question A10* | S |
| US-08b | As a **household**, we want one shared cookbook. | First on Google Drive, later on a backend | L (v3.x) ② |

### Epic 3 · AI at the centre

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-09 | As a **user**, I want to capture a recipe by taking a photo **or** picking one from my gallery, and say "save this for me". ② | Reachable in ≤ 2 taps from the start screen · one chooser: camera / gallery · review screen before saving · quality checked on 10 real photos per model change | M |
| US-10 | As a **user**, I want to chat with an assistant that knows my recipes and my stock. | Works as in v2 · system prompt cached to cut cost · clear message when no key or no network | M |
| US-11 | As a **friend who is curious about AI**, I want a step-by-step guide to bring my own key, with general instructions on using the AI. ② | Part of the onboarding tour and reachable later from settings · key test button · key stays on the device only · app fully usable without a key · "prompt adjustments" to clarify (question A11) | M |
| US-12 | As a **key owner**, I want to see a best guess of what I have spent this month, with a warning at a limit. ② | Estimate from the token usage each API response reports × a price table in one config file · default monthly limit · **warning only, no block** · labelled as an estimate | L (v3.x) ② |
| US-13 | As a **user**, I want to share a photo from my gallery straight into the app to capture a recipe. ② | The app appears in Android's share menu for images (Play build) · lands on the capture review screen · iPhone falls back to the in-app gallery picker (check C-22) | M |
| US-14 | As a **user**, I want the fridge scan to keep working. | No regression from v2 | S |

### Epic 4 · Everyday use

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-15 | As a **user**, I want the app to stay as fast as v2 is today. ② | Marcel reports no slow spot in v2 · V3 must not get slower: start screen usable from local storage before any network call · measured in the e2e suite | M |
| US-16 | As a **user**, I never want to lose a recipe or a list item. | Round-trip tests · backup/export guide · migration rehearsal on copies before launch | M |
| US-17 | As a **user**, I want to find a recipe easily; today this is the hardest part (few pictures, weak sorting). ② | Default photos (US-19) make the list scannable · visible search · sort and filter options chosen in question G7 · ships in v2.x where possible | M (**v2.x** + photos in V3) |
| US-18 | As a **user**, I want the weekly plan to stay available. | Works as in v2; no new work | S |

### Epic 5 · Content

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-19 | As a **new user**, I want every base recipe to have an appetising photo. | 105 base recipes have a default photo · **about 30 are Marcel's own (dishes he has cooked), the rest AI-generated** ② · one resize pipeline, each ≤ ~80 KB, loaded on demand · licence/source recorded per image | S |
| US-20 | As a **user**, I want a "Gesund & Langlebig" hub page with short, sourced explanations. ② | Hub page (Epic N2) with links onward · every claim has a source and a confidence marker · Marcel has reviewed the sources · badges, reading list and ingredient cards are v3.x | S |
| US-21 | As a **user**, I want calories and macros on recipes. | Ships in **v2.x** before V3 (Epic L) and carries over | v2.x |

### Epic 6 · Code quality and learning

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-22 | As the **owner**, I want a clean code base that is not "long but not smart". | One sync engine for recipes and list · end-to-end browser tests for the core flows · generated offline file list · a simplification pass with a before/after report (lines, modules, duplication) · no behaviour change | M |
| US-23 | As a **learner**, I want to be challenged, not only informed: domain and DNS, hosting, app development, Google sign-in, and above all **how to work well with AI**. ② | Learning track in `06-LEARNING-TRACK.md`: one challenge + one plain-language note + one short retro per slice · an "AI working playbook" that grows with the project | S |
| US-24 | As a **friend**, I want a feedback button in the app to propose features. ② | Button in the menu opens a pre-filled e-mail to the support address (app version and language included) · no server, no third-party script · a form with a backend can replace it in v3.x | S |
| US-25 | As a **user**, I want no ads, no tracking and no cost. | No third-party scripts · Play data-safety form says "no data collected" · no paid tier in v3.0 | M |

### Epic 7 · Added in round 2

| ID | Story | Acceptance | Pri |
|----|-------|------------|-----|
| US-26 | As a **user**, I want the assistant inside the app to create and update my recipes when I ask it to. ② | The in-app assistant can add a recipe and change an existing one · changes are shown for confirmation before saving · no other Claude needs write access to the recipe file (the "project-Claude" contract is dropped) · details: question E6 | M |
| US-27 | As a **new user outside Germany**, I want the app to be English first. ② | *Open — decision D8 in `04-OPTIONS.md`.* Staged proposal: English default for interface and store; English as the stored language of the base recipes; language-neutral category keys | ? |
| US-28 | As a **visitor**, I want a landing page that explains the app and the project and has a button to start it. ② | On the custom domain · what the app does, screenshots, project story, short documentation, privacy policy · "Open app" and Play Store buttons · 4 languages | M |

### Later (explicitly not v3.0)

| ID | Story | Target |
|----|-------|--------|
| US-L1 | Store my data in a database Marcel hosts instead of my Google Drive | v3.x |
| US-L2 | Use AI without my own key (Marcel sponsors or I pay) | v3.5 / v4 |
| US-L3 | Voice-controlled cooking mode | someday |
| US-L4 | Import a recipe from a social video | someday |
| US-L5 | Install from the iPhone App Store | someday |
| US-L6 | Public links to recipes | not wanted |

## Constraints

- **Time:** 2–3 h/week of Marcel's attention. Slices must be testable in one sitting.
- **Money:** domain + one-time Play fee. No AI budget for other people.
- **Data:** each user's data stays private to them. Google Drive for v3.0.
- **Ground rules from v2** (see `README.md`): flat-v3 schema, canonical German data, near-zero
  third-party scripts, every release bumps `BUILD` and the service-worker `CACHE`.

## What Marcel asked to understand

### Does the Play Store force a rebuild?

No. The Play build is a **Trusted Web Activity (TWA)**: a very small Android app that opens the
website full screen. Google does not look at how the code is written. It checks three things:
the site proves it belongs to the app, it loads fast enough (Lighthouse ≥ 80), and it starts
offline. The clean-up in US-22 is worth doing for its own sake, but it is a choice, not a store
requirement. Whether "cleaner" should also mean a framework is question H1.

### TWA verification and "what if we host it somewhere else later"

To prove site and app belong together, a small file must sit at the **root** of the web address:
`https://<domain>/.well-known/assetlinks.json`. Today the app lives at
`marcipane3.github.io/Citchen/`. The root `marcipane3.github.io` belongs to a different
repository, so the file cannot go there cleanly.

With a **custom domain** the root is yours. GitHub Pages can still host the files for free; the
domain only points at it. If the hosting moves later (another provider), the domain stays the same,
so the Play app keeps working and users notice nothing. **The domain is the stable anchor; the
host is replaceable.** Since the domain is approved (C3), this is settled in direction and gets
verified in a spike (check C-1).

One side effect to plan for: switching the repository to a custom domain moves **v1 and v2** to
the new address too. Data stored only in the browser does not follow (see `05-RISKS-MIGRATION.md`,
R13).

### How much space do photos need?

- A phone photo is 3–5 MB. Resized to ~1000 px and saved as WebP it is **~80 KB**.
- 105 base recipes × 80 KB ≈ **8 MB** in total. GitHub Pages allows about 1 GB per site.
- The photos live on the website, **not** inside the Play app (which stays at a few MB) and
  **not** in the offline bundle. A photo is downloaded the first time its recipe is shown, then
  kept on the phone.
- Own photos and AI-generated ones go through the same resize step, so they cost the same space.
- Photos users add to their own recipes live in their Google Drive and are not affected.
- AI generation needs an image model outside Anthropic's API. It is a one-time job; cost and
  quality get checked on 5 sample recipes first (check C-21).

### "Rewrite in a native language" and "project-Claude" ②

- **Native language** in the no-go list means a *programming* language: rebuilding the app as a
  real Android app in Kotlin or an iPhone app in Swift. It has nothing to do with German or
  English. That no-go stands (the architecture answer H1 confirms it: no rebuild).
- Marcel's reading led to a real idea, though: **English instead of German as the main
  language**. That is now decision D8.
- **Project-Claude** is the Claude in the claude.ai "Kochbuch" project, outside the app. In v1 it
  edited `rezepte.json` in Google Drive directly, which is why the file format was frozen as a
  contract. Marcel's answer: only the assistant **inside** the app needs to edit recipes. So that
  contract can go, which removes the main obstacle to D8 and to a later backend.

### Does Google require an onboarding tour?

No. Google requires a privacy policy, the data-safety form, a content rating and the closed test.
The tour is worth building for strangers and friends anyway; it is a product choice.

## Open points

See `03-QUESTIONS.md` Part 1. Three are blocking: the language decision (L1 / D8), whether the
shared weekly plan really is in (A10), and the name and domain (C7).
