# 3 · Data model R1: ingredients, ownership, file format 4

The spec is `docs/v3/adr/ADR-R1-ingredient-model.md` (about 15 minutes to read; sections 1, 2 and 6
are the ones that matter for you). It is a **draft**: nothing is built. Your sign-off unblocks v2.19
(ingredient master, then calories) and fixes what goes into file format 4.

What the spec found in your 105 recipes, in short: about **150 ingredients cover 97 %** of all lines
(the roadmap assumed 300); only **a third of the lines state a weight**, so the conversion table
("1 onion ≈ 80 g", "1 tbsp oil ≈ 14 g") is the real work; **16 % of lines have no amount** ("Reis
als Beilage") and can never be counted for calories.

Reply `ok` to accept all seven recommendations.

### R1-Q1 Base unit: grams and millilitres only

Your sketch said "base unit g · ml · piece". Recommended: all maths in **g or ml**. "Piece" stays a
unit you see ("1 Zwiebel", and "3 Zwiebeln" on the shopping list), but internally an onion is 80 g.
One formula for calories instead of separate per-piece tables.

- **Recommended: yes.**

Answer:

### R1-Q2 What happens when you edit a base recipe

- **(a) Recommended: in place.** The recipe keeps its position and becomes "your version". A "reset to
  original" action brings the bundled text back. No duplicates; weekly plan and shopping list keep
  pointing at it.
- (b) The original stays and your edit becomes a second recipe next to it.

For recipes someone **sends** you later (V3) you always get your own copy; this question is only about
the 105 base recipes in your own cookbook.

Answer:

### R1-Q3 "To try" and "last cooked" become personal data

From format 4 on: `toTry` (🆕 Probieren) counts as your personal state, like favourite and rating, so
it is not shared with a recipe. "Last cooked" is stored as a month in the form `2026-11` instead of
free text like "Mai 2026" (two bugs came from parsing that text).

- **Recommended: yes.**

Answer:

### R1-Q4 Format 4 ends the old v1 app and "project-Claude edits the file"

Two readers cannot follow to the new format: the legacy v1 app (repo root) and the workflow where
Claude in a chat project edits `rezepte.json` on Drive. v1 would even overwrite a format-4 file as
format 3, because it does not check the version.

- **Recommended:** both end when format 4 ships (planned v2.21 / V3 slice 2, January). Before that, v1
  gets a one-line guard that refuses newer files. The in-app assistant that edits recipes (G3, v2.20)
  replaces the chat-project workflow.
- This retires the original requirement "Claude updates the data" in its old form. If you still use
  the chat project to edit recipes, say so: then G3 has to be solid first.

Answer:

### R1-Q5 Nutrition numbers from USDA

USDA FoodData Central (public domain, widest coverage) as the one default source; the Danish Frida
table only where USDA has no entry. Values are drafted by AI from those tables; you spot-check 20
ingredients you know well.

- **Recommended: yes.** This also settles L1 in the roadmap ("nutrition model"), which was waiting for
  your confirmation.

Answer:

### R1-Q6 What the app shows

- Recipe card: "≈ 520 kcal" per serving. Detail page: kcal plus protein, carbs, fat.
- "≈" when less than 80 % of the recipe's weight could be matched.
- **No number at all** when less than half could be matched. A wrong number is worse than none.

- **Recommended: yes.**

Answer:

### R1-Q7 Split v2.19 into two releases

Ingredient master + structured lines + calories + plausibility check is more than one 2–3 h device
test. Proposed: **v2.19** = ingredient master and structured lines (you see: ingredient lines in your
interface language, cleaner shopping-list sums). **v2.19a** = calories. Both stay in December, before
the scope freeze.

- **Recommended: yes.**

Answer:
