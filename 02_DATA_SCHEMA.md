# Koch v2 — Data Schema

> The existing `SCHEMA.md` in the project is the **canonical** source for the recipe object and the
> 16 category strings. Read it first. This document defines the **additive, backward-compatible**
> fields v2 relies on, plus the shapes for plans, shopping lists, and settings. Do not remove or
> rename existing fields; only add.

## 1. The 16 fixed categories

`category` must be exactly one of these strings (verify spelling against `SCHEMA.md`):

1. Frühstück & Brunch
2. Schnelle Wochentags-Gerichte
3. Pasta & Nudeln
4. Reis & Getreide
5. Suppen & Eintöpfe
6. Salate & leichte Gerichte
7. Wochenend-Gerichte
8. Vegetarische Hauptgerichte
9. Deutsche Hausmannskost
10. Middle Eastern & Mediterran
11. Asiatisch inspiriert
12. Backen: Brot & Herzhaftes
13. Backen: Süßes & Kuchen
14. Muffins & Kleingebäck
15. Sourdough & Sauerteig
16. Grundrezepte & Basissoßen

The category set is **fixed** and must not be extended. New kinds of dishes are expressed via
recipes inside existing categories plus tags (below).

## 2. Recipe object

Keep all existing v1 fields. The v2 shape (additive fields marked **NEW**):

```jsonc
{
  "id": "r1717152000000",          // "r" + timestamp; for batch inserts append a counter to stay unique
  "name": "Süßkartoffel-Curry mit Kichererbsen",
  "category": "Vegetarische Hauptgerichte",   // one of the 16 fixed strings
  "time": {                         // keep v1 representation if it differs; ensure a total in minutes exists
    "prep": 10,
    "cook": 20,
    "totalMinutes": 30
  },
  "servings": 4,
  "ingredients": [
    { "item": "Süßkartoffel", "amount": 2, "unit": "Stück", "pantry": false }
    // "pantry": true = assumed on hand per PROJEKTWISSEN; false = needs buying
  ],
  "steps": ["...", "..."],
  "tipps": {                        // NEW — structured; see §3. Priority feature.
    "toppings": ["..."],
    "variationen": ["..."],
    "alltagsUpgrade": "..."
  },
  "tags": {                         // NEW — see §4
    "effort": "alltag",             // "alltag" | "besonders"
    "cuisine": "indisch",
    "mealPrep": true,               // keeps/reheats well across days
    "toTry": false,                 // true = new idea not yet cooked
    "season": ["herbst", "winter"]  // optional
  },
  "lastCooked": null,               // ISO date or null — preserves v1 "zuletzt gekocht"
  "createdAt": "2026-06-09T00:00:00Z",
  "updatedAt": "2026-06-09T00:00:00Z"
}
```

- If v1 stores time/ingredients differently, **migrate losslessly**: keep the original and compute
  `totalMinutes` so the planner can filter by time.
- `pantry` flags drive the shopping list (pantry items are subtracted). If v1 ingredients are plain
  strings, migration may default `pantry` by matching against the pantry staples list (§6).

## 3. Structured Tipps (priority)

Tipps are a first-class feature, surfaced in the cookbook and **inside cooking mode**. Every recipe
should aim to provide:

- `toppings`: 1–2 quick toppings (e.g. roasted seeds, feta, herb oil, chili flakes).
- `variationen`: at least 1 swap/variation achievable with **pantry staples only**.
- `alltagsUpgrade`: one line — how to make the dish feel special with minimal weekday effort.

Migration: if v1 has a free-text tips/variations field, map it into `tipps` (best-effort split;
preserve the original text in `variationen` if it can't be cleanly categorized).

## 4. Tags

| Tag | Type | Meaning / use |
|---|---|---|
| `effort` | `"alltag"` \| `"besonders"` | Drives weekday vs weekend planning |
| `cuisine` | string | Filtering, "more Middle Eastern" planner requests |
| `mealPrep` | boolean | "keeps/reheats well" — relevant for ~4-portion batch cooking |
| `toTry` | boolean | New, not-yet-cooked ideas; can be filtered/featured |
| `season` | string[] | Optional season hints for the planner |

## 5. Meal plan object

```jsonc
{
  "id": "plan_2026-06-09",
  "weekOf": "2026-06-09",
  "days": [
    { "day": "Mo", "recipeId": "r...", "slot": "alltag" },
    { "day": "Sa", "recipeId": "r...", "slot": "besonders" }
    // 7 days; weekday slots prefer effort=alltag & totalMinutes<=30; weekend slots prefer besonders
  ],
  "createdAt": "..."
}
```

## 6. Pantry staples & shopping list

Pantry staples (from `PROJEKTWISSEN`) are user-editable in Settings and used to subtract "already
have" items from shopping lists.

```jsonc
// settings.pantry
{ "staples": ["Mehl", "Reis", "Pasta", "Couscous", "Bulgur", "Kichererbsen (Dose)", "Kokosmilch (Dose)", "..."] }
```

```jsonc
// shopping list
{
  "id": "list_...",
  "planId": "plan_...",
  "items": [
    { "item": "Süßkartoffel", "amount": 2, "unit": "Stück", "section": "Gemüse", "checked": false }
  ],
  "createdAt": "..."
}
```

- Build the list by aggregating ingredients across the plan's recipes, summing amounts per item,
  removing items present in `settings.pantry.staples`, and grouping by store **section** (e.g.
  Gemüse, Milchprodukte, Trockenwaren, Bazaar). Sectioning can be a simple lookup table; keep it
  editable/extensible.

## 7. Settings object

```jsonc
{
  "apiKey": null,                  // BYOK; local only; never synced to Drive
  "model": "haiku-tier-default",   // confirm exact ID at build time; user can pick Sonnet
  "theme": "system",               // "light" | "dark" | "system"
  "pantry": { "staples": [ ... ] },
  "drive": { "connected": false, "fileId": "1t6KRviicPspYVj9oFjsUTJ6n8kZLHP1y" }
}
```

## 8. Validation & IDs

- Validate every recipe on save: required fields present, `category` is one of the 16, `tipps` and
  `tags` well-formed. Reject/flag invalid records.
- IDs: `"r" + Date.now()`. For batch inserts, append an incrementing counter to guarantee uniqueness.
- Never mutate existing recipe IDs during migration.
