# Koch v2 — Build Plan (for Claude Fable 5 in Claude Code)

This is a **phased, autonomous** build. After each phase, **stop at the checkpoint**: report what was
built, what was tested, and a short list of any decisions/ambiguities, then continue once acceptance
criteria are met. Use Fable 5's strengths: plan across stages, write your own tests, and use vision
to verify the UI against intent (screenshot the running app and check it looks/behaves right).

## Ground rules (all phases)

- Build inside the **`/v2`** subfolder. Do **not** modify or break v1 at the repo root.
- Honor `00`–`03`: offline-first, local-first, BYOK tiering, fixed 16 categories, additive schema,
  structured Tipps, native ES modules / no bundler, vanilla + Web Components.
- **Feature parity:** complete the v1 inventory (Phase 0) and carry every v1 feature into v2.
- Keep the AI layer isolated; the Free tier must never require a key or network.
- Default AI to a Haiku-tier model; confirm current model IDs and vision support against Anthropic
  docs at build time.

## Testing strategy

- **Unit tests** for deterministic logic: schema validation, ID generation, migration, planner
  selection/rotation, shopping aggregation + pantry subtraction, portion scaling. These must pass
  with no network and no key.
- **Vision checks** for UI: render each main view, screenshot it, and verify layout, readability,
  and the cooking-mode large-text/timer/scaler behavior against the spec.
- **Offline check** each phase: load and exercise the phase's features with the network disabled.

---

## Phase 0 — Foundation & parity inventory
**Goal:** scaffolding, data layer, offline shell, and a complete v1 feature inventory.

- Read all v2 docs, the canonical `SCHEMA.md`, the existing `rezepte.json`, and the **v1 source**.
- Produce a written **v1 feature inventory** (every feature/behavior/affordance) → these become v2
  requirements.
- Scaffold `/v2` per `01_ARCHITECTURE` (folders, `index.html`, manifest, service worker, router).
- Implement the **data layer**: IndexedDB store, schema constants + validation + ID generation,
  lossless **migration** of existing `rezepte.json`, Drive auth + in-place read/write of the file.
- Offline app shell launches and loads cached recipes with no network.

**Checkpoint:** share the v1 inventory + the parity plan + the data-layer test results. Flag anything
ambiguous before proceeding.

---

## Phase 1 — Cookbook core + Cooking mode (the offline heart)
**Goal:** full recipe management + the kitchen experience, all offline.

- Cookbook: browse by category, search, all filters (cuisine/effort/time/mealPrep/toTry/season),
  recipe detail with prominent structured Tipps, add/edit/delete with schema validation,
  "zuletzt gekocht" tracking. **Include all v1 cookbook features.**
- Cooking mode: full-screen steps, live portion scaler, per-step timers, ingredient/step check-off,
  contextual Tipps, screen wake lock.
- Tests: scaling math, validation, search/filter logic. Vision-check both views.

**Checkpoint:** demo cookbook + cooking mode working offline; confirm v1 parity items are present.

---

## Phase 2 — Meal planner + Shopping list (deterministic, no AI)
**Goal:** plan a week and shop for it without any AI.

- Planner: rule-based weekly generator (weekday=alltag/≤30min, weekend=besonders), rotation, cuisine
  variety, season awareness, manual swap/lock/regenerate, leftovers across days.
- Shopping list: aggregate + sum, subtract pantry staples, group by store section, checkable,
  persistent, manual add/remove.
- Tests: planner selection/rotation determinism; shopping aggregation + pantry subtraction.

**Checkpoint:** generate a sensible week and a correct grouped shopping list with no network/key.

---

## Phase 3 — AI Assistant + Settings (BYOK)
**Goal:** unlock AI for users with their own key, without breaking the Free/offline tier.

- AI layer (`/src/ai`): model-agnostic client, prompt templates, `gate.isPremium()`.
- Settings: API key entry/removal (local only), model picker (Haiku default / Sonnet), pantry editor,
  Drive connect/disconnect, theme.
- Assistant: "Was koche ich heute?", leftover solver, generate-recipe → review → **save to cookbook**.
  German responses. Graceful no-key/offline/rate-limit states.
- Optional planner AI tweak hook (natural-language adjustments).
- Tests: gating (no key → AI hidden/disabled, Free tier fully works), schema validity of generated
  recipes, save path.

**Checkpoint:** with no key, the app is the full Free offline app; adding a key cleanly enables AI.

---

## Phase 4 — Photo / URL Capture *(BACKLOG — scaffold only unless told otherwise)*
**Goal:** leave a clean seam for later.

- Create the `capture` module, route, and **review-before-save** flow wired to the data layer.
- Stub/feature-flag the vision parse step (off by default). Do not fully implement now.

**Checkpoint:** module boundary and review flow exist; feature flag off; nothing else affected.

---

## Phase 5 — Cookbook Export *(LATER MILESTONE — do not build now)*
Listed for completeness. Ensure the data model supports a future full-collection export (PDF / web).
Do not implement in this build.

---

## Definition of done (v2 core = Phases 0–3)

- Installable PWA served from `/v2`; v1 still live at root.
- Fully usable **offline with no key**: cookbook, cooking mode, planner, shopping list.
- All **v1 features preserved** (verified against the Phase 0 inventory).
- AI features work **only** via the user's own key; owner's tokens never used by others.
- Deterministic logic covered by passing unit tests; main views vision-checked; offline verified.
- `rezepte.json` migrated losslessly; in-app Drive save updates the file in place.


## Backlog (manually added in here by Marcel)
- Languages (German, English, Danish, Spanish)
- Bug fixes
- Has pictures in the app of the food
- Photo upload for storage
- AI background promt right now optimized for me. Promt needs to be adjusted and more flexible
- Baue aktuell: Kühlschrank / Lager
- Einkaufszettel löschen button / per photo löschen, das nur ein paar sachen raus nimmt?
- Viel mehr optionen beim Einkaufen und nach Supermarkt sortierung sortieren button
- Mehr Gerichte / Eigene Option viele Gerichte nach eigenem Geschmack genereieren zu können?
- Build skills and Agents which can run over my code with DREAM functionality to find bugs and list them as well as writing a new backlog / more items. One just bug fixes, one obvious stuff, and one super creative, Run backlog promt again to make more ideas
- Double filter options / multi filter - filter pane to filter down the receipes AND OR Filter categories - fish or meat, but fish and has to be nordic / mediteranian AND every day meal
- When I write receipes adjustment and comments for claude, then the user has to also be able / claude be able to control the receipe file and update it fully.
- Tinder gold "yes" options - I want to swipe them again or see them next to each other in a different way
- V3:
   - Full build to upload into Google apps
   - Payment option if Private API is not possible. Payed double. Think of payment options
   - Must have all bug fixes incorporated. (Pictures, )
   - Architecture - where files are stored - does local drive work? What receipes, What language the code is written in, Is it fast enough and slim enough and also well designed? 
   -