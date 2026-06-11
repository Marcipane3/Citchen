# Koch v2 — Feature Specifications

Tiers: **Free** = no key, works offline. **Premium** = requires the user's own API key (BYOK).

> **Parity reminder:** every v1 feature is also a v2 requirement. The specs below describe the v2
> target; fold in any v1 behavior discovered during the parity inventory (see `01_ARCHITECTURE` §8).

---

## 1. Cookbook Core — *Free, offline*

The heart of the app. Browse and manage the recipe collection.

- Browse by the 16 categories; show recipe counts per category.
- **Search** by name/ingredient; **filter** by category, `tags.cuisine`, `tags.effort`,
  `totalMinutes` (e.g. "≤30 min"), `mealPrep`, `toTry`, `season`.
- Recipe detail view: ingredients, steps, servings, time, and the structured **Tipps** prominently
  displayed.
- **Add / edit / delete** recipes via a form that validates against the schema (parity with v1 add
  capability, extended for the new tags/Tipps fields).
- **"Zuletzt gekocht"**: mark a recipe cooked (sets `lastCooked`); show/sort by it (parity with v1).
- Drive load/save and local persistence (see architecture).

**Acceptance:** all v1 cookbook behaviors preserved; new filters/tags work; offline browsing instant.

---

## 2. Cooking Mode — *Free, offline*

A full-screen, kitchen-friendly step-by-step mode launched from any recipe.

- Large text, one step (or grouped steps) at a time, easy next/back, progress indicator.
- **Portion scaler**: a control to set servings; all ingredient amounts recompute live (default to
  the recipe's `servings`, typically 4).
- **Per-step timers**: any step with a time shows a start-able countdown with an alert on completion;
  multiple timers can run.
- **Tap-to-check-off** ingredients and steps.
- Contextual **Tipps** (toppings / upgrade) surfaced where relevant.
- **Screen wake lock** so the display stays on while cooking; release on exit.

**Acceptance:** usable hands-light at the stove; scaler math correct; timers fire; works fully offline.

---

## 3. Meal Planner — *Free, offline (AI tweak optional/Premium)*

Generate a week of meals with a deterministic, rule-based algorithm — **no AI required**.

- Generate a 7-day plan: weekday slots prefer `effort: alltag` and `totalMinutes ≤ 30`; weekend
  slots prefer `effort: besonders`.
- **Rotation**: avoid repeating recently planned/cooked recipes; vary cuisines across the week;
  respect `season` when set.
- Manual control: swap any day's recipe, lock a day, regenerate the rest, or pick from the cookbook.
- Account for batch cooking: a recipe (~4 portions) can fill multiple days as leftovers if the user
  chooses.
- **Optional AI layer (Premium):** natural-language tweaks ("lighter week", "more Middle Eastern",
  "use up my chickpeas"). Implemented via the AI layer; the planner is fully usable without it.

**Acceptance:** produces a sensible, non-repetitive week from the current collection with zero
network and no key; manual edits persist.

---

## 4. Shopping List — *Free, offline*

Turn a plan (or a manual selection of recipes) into a grouped shopping list.

- Aggregate ingredients across selected recipes; **sum amounts** per item.
- **Subtract pantry staples** (from Settings) so you only buy what's missing.
- **Group by store section** (Gemüse, Milchprodukte, Trockenwaren, Bazaar, …) via an editable lookup.
- Check items off; list persists; manual add/remove items.

**Acceptance:** correct aggregation and pantry subtraction; sectioned, checkable, offline, persistent.

---

## 5. AI Assistant — *Premium (BYOK), online*

A conversational helper. Hidden/disabled until a key is present; default model = Haiku-tier.

- **"Was koche ich heute?"** — reads the collection + pantry + weekday/weekend context and suggests
  3–5 options; the user picks; it returns the full recipe.
- **Leftover solver** — user names a few ingredients on hand; it proposes dishes from the collection
  or a new idea.
- **Generate a new recipe** — produces a schema-valid recipe (correct category, tags, structured
  Tipps) and offers **"save to cookbook"**, which writes it to the data layer like any other recipe.
- Responses default to **German** (per project convention), regardless of UI chrome language.
- Graceful handling of missing/invalid key, offline state, and rate limits.

**Acceptance:** suggestions reflect the actual collection/pantry; generated recipes pass schema
validation and save correctly; uses the user's key only; clean disabled state without a key.

---

## 6. Photo / URL Capture — *Premium (BYOK), online — BACKLOG (scaffold only)*

Architected now, built later. Do **not** fully implement in the core v2 build unless explicitly told
to; create the module boundary, route, and data flow so it can be added without rework.

- Input: an uploaded photo, a screenshot, or a pasted URL.
- A **vision-capable** model parses it into a schema-valid recipe (category, ingredients with
  `pantry` flags, steps, Tipps, tags).
- Show a **review/edit form** before saving — never auto-save unverified parses.

**Acceptance (for scaffold):** module, route, and "review-before-save" flow exist and are wired to
the data layer; the parse step is stubbed/feature-flagged off.

---

## 7. Cookbook Export — *Free, offline — LATER MILESTONE*

Not in the core v2 build. Design the data so an export can later render the full collection into a
laid-out cookbook (cover, table of contents, category dividers, consistent typography) as a printable
PDF and/or shareable web view. Keep it out of the critical path for now.

---

## 8. Settings — *Free (gates Premium)*

- **API key** entry/removal (BYOK); local only; clear messaging that it never leaves the device
  except to call the Anthropic API directly.
- **Model picker**: Haiku-tier default; Sonnet option; capture requires a vision-capable model.
- **Pantry staples** editor (seeds from `PROJEKTWISSEN`; used by the shopping list).
- **Google Drive**: connect/disconnect, sync status, manual sync.
- **Theme**: light / dark / system.

**Acceptance:** toggling a key flips the app between Free and Premium UI states cleanly; pantry edits
affect shopping lists; Drive connect/disconnect works; everything here is available offline.
