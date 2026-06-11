# Koch v2 — Claude Code Kickoff Prompt (Claude Fable 5)

> Paste the block below into Claude Code with **Claude Fable 5** selected, from the root of the Koch
> repository, with all six `0x_*.md` files present in the working directory (or point to their path).

---

```
You are building Koch v2 — a ground-up rebuild of my existing personal cookbook PWA — autonomously,
using your planning, self-testing, and vision-checking abilities. Work in phases and stop at each
checkpoint to report before continuing.

STEP 1 — READ EVERYTHING FIRST (do not write code yet):
- 00_OVERVIEW.md, 01_ARCHITECTURE.md, 02_DATA_SCHEMA.md, 03_FEATURES.md, 04_BUILD_PLAN.md (this set).
- The canonical SCHEMA.md in the project (authoritative for the recipe object + the 16 fixed
  category strings).
- PROJEKTWISSEN (cook profile, pantry, spices, equipment, portions) and REZEPT-DATENBANK.
- The existing rezepte.json (Drive file ID 1t6KRviicPspYVj9oFjsUTJ6n8kZLHP1y, parent folder
  0AAY4rCSLDHjTUk9PVA). Do not duplicate or break existing recipes.
- The existing v1 app source (the v1 index.html at the repository root). Produce a written inventory
  of EVERY v1 feature, behavior, and UI affordance — these are mandatory v2 requirements.

STEP 2 — BUILD per 04_BUILD_PLAN.md, phase by phase, inside a new /v2 subfolder:
- Phase 0: scaffolding, data layer (IndexedDB + Drive in-place save + lossless migration of
  rezepte.json), offline app shell, and the v1 feature inventory.
- Phase 1: Cookbook core + Cooking mode (all offline; include every v1 cookbook feature).
- Phase 2: Meal planner + Shopping list (deterministic, NO AI required).
- Phase 3: AI Assistant + Settings (BYOK; default Haiku-tier model).
- Phase 4: Photo/URL Capture — SCAFFOLD ONLY (module + route + review-before-save flow, parse stub
  feature-flagged off). Do not fully implement.
- Phase 5: Cookbook Export — DO NOT BUILD; just keep the data model export-ready.

HARD CONSTRAINTS:
- Location: build only inside /v2. Do NOT modify or break v1 at the repo root. v1 stays live; v2
  deploys from the /v2 path on GitHub Pages.
- Stack: native ES modules, NO bundler/build step (must run by opening index.html and deploy as-is
  to GitHub Pages). Vanilla JS + Web Components. Plain CSS with custom-property design tokens. No
  heavy framework. Near-zero dependencies.
- Offline-first: cookbook, cooking mode, planner, and shopping list MUST work with no network and no
  API key. Service Worker + IndexedDB.
- Tiering / BYOK: ship with NO API key. AI features are unlocked only when the user pastes THEIR OWN
  Anthropic key in Settings (stored locally, never synced to Drive, never logged, sent only directly
  to the Anthropic API from the user's browser). gate.isPremium() = has key. No backend, no payments.
- Data: the 16 categories are FIXED — never add categories. Schema changes are additive and
  backward-compatible (tags: effort/cuisine/mealPrep/toTry/season; structured tipps:
  toppings/variationen/alltagsUpgrade). Validate every recipe. IDs = "r"+timestamp (+counter on batch).
- Drive: drive.file scope; the PWA updates rezepte.json IN PLACE (the "can't overwrite" limitation
  only applies to the chat MCP connector, not the app). Local-first; sign-in optional.
- Tipps are a priority feature: surface them in the cookbook and inside cooking mode.
- AI assistant responses default to German.
- Confirm current Anthropic model IDs and which models support vision against the official docs
  before wiring the model picker and the (stubbed) capture feature.

SELF-TESTING & VERIFICATION:
- Write unit tests for all deterministic logic (schema validation, ID generation, migration, planner
  selection/rotation, shopping aggregation + pantry subtraction, portion scaling). They must pass
  with no network and no key.
- Use vision: run the app, screenshot each main view, and verify layout/readability and the
  cooking-mode scaler/timers against 03_FEATURES.md.
- Each phase: verify the phase's features work fully OFFLINE.

CHECKPOINTS:
- After each phase, STOP and report: what you built, test results, vision-check findings, and any
  decisions or ambiguities (especially v1 parity questions). Wait for my go-ahead, then continue.
- Start now with STEP 1 and the Phase 0 plan. Show me the v1 feature inventory and your Phase 0
  approach before writing Phase 0 code.

DONE = an installable PWA at /v2 that (a) works fully offline with no key, (b) preserves every v1
feature, (c) enables AI only via the user's own key, with passing tests, vision-checked UI, and a
losslessly migrated rezepte.json saved in place to Drive.
```
