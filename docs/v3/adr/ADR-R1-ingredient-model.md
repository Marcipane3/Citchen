# ADR R1 — Ingredient model, unit rules, recipe ownership and file format 4

- **Status:** **accepted** — Marcel signed off all seven recommendations (R1-Q1 … R1-Q7) on
  2026-11-10. Nothing is built yet; the build steps are issues #61 (R2.1) and #62 (R3.1) onward.
  Where a section below says "Recommended", that is now the decision.
- **Owner:** Marcel · written by Claude Code
- **Related:** `ROADMAP-V2.md` Epic R (R1–R6), L (L1–L3), P6, G3 · `ROADMAP-V3.md` D8, D10, D11,
  slice 2 · `docs/v3/03-QUESTIONS.md` C-27 · `SCHEMA.md`

## 1. Context

Marcel's rethink of 2026-10-05: a recipe should be a list of references to a master ingredient list
(names in four languages, units, nutrition), not free text; editing a shared recipe gives you your own
copy; personal state (favourite, rating, cooked count, notes, photos) is not recipe content.

This spec has to settle five things at once, because they share **one** migration (format 4, P6):
the ingredient record, the unit rules, the recipe line, ownership, and what format 4 contains.

### What the data looks like today (measured on the 105 base recipes, `v2/data/rezepte.snapshot.json`)

| Fact | Number |
|------|--------|
| Ingredient lines | 839 (≈ 8 per recipe) |
| Lines holding several ingredients ("2 TL Curry, 1 TL Kreuzkümmel, ½ TL Chiliflocken") | 30 that `splitLine` already splits → 892 single parts; a further 72 lists without amounts ("Salz, Pfeffer, Öl") |
| Parts with a weight or volume (g, kg, ml) | 286 (32 %) |
| Parts in spoons or pinches (EL, TL, Prise) | 199 (22 %) |
| Parts counted in pieces, no unit ("1 Zwiebel", "3 Knoblauchzehen") | 227 (25 %) |
| Parts in package units (Päckchen, Dose, Bund, Scheibe …) | 35 (4 %) |
| Parts with no amount ("Reis als Beilage", "Butter zum Braten") | 145 (16 %) |
| Lines with a group prefix ("Teig: …") | 57 |
| Lines marked optional | 33 |
| Lines marked 🛒 | 199 |
| Distinct ingredient names | 177 — the top 50 cover 80 % of all parts, the top 100 cover 91 %, the top 150 cover 97 %; 91 names appear once |

Three consequences:

1. **About 150 master ingredients cover the base cookbook**, not 300. The roadmap's "~300 to start"
   (R2) can be cut in half; the rest grows with user recipes.
2. **Only a third of the lines state a weight.** Calories (L2) depend on conversions for pieces and
   spoons ("1 Zwiebel" ≈ 80 g, "1 EL Öl" ≈ 14 g). The conversion table is the real work in R2, not
   the nutrition numbers.
3. **16 % of the parts have no amount.** They can be matched to an ingredient (for shopping and
   translation) but never counted for nutrition. The "≈" rule in L2 has to live with that.

Parser gaps found on the way (to fix in R3): `Liter` is not a known unit ("1,2 Liter Gemüsebrühe"
becomes the item "Liter Gemüsebrühe"); alternatives ("Buttermilch oder Joghurt", "rote oder weiße
Bohnen") and "A und B" are one item today.

### How base recipes reach a user's file today

A fresh install fills IndexedDB from the bundled snapshot (`sync.js`, `source: "snapshot"`). On the
first Drive sync of an account without a file, the app **uploads that local state**. So every user's
`rezepte.json` holds its own copy of all 105 base recipes; later changes to the bundled base recipes
never reach existing users. There is no field that tells a base recipe from a user's own.

## 2. Decision in one paragraph

Add a bundled **ingredient master** (`v2/data/ingredients.json`) and one small global **unit table**.
In v2.x, recipes keep their `ingredients` strings as the contract and gain an optional, derived
`items[]` next to them, where each item points back to the exact string it came from. In format 4
the relation flips: `items[]` is the truth and the strings are generated. Ownership is two optional
fields, `origin` and `forkedFrom`. Personal fields stay where they are in v3 and move into one `my`
object in format 4. Format 4 bundles English base text, neutral keys, `items[]`, ownership and `my`
into **one** migration.

## 3. Ingredient master record (R2)

```json
{
  "id": "onion",
  "names":   { "de": "Zwiebel", "en": "onion", "es": "cebolla", "da": "løg" },
  "plural":  { "de": "Zwiebeln", "en": "onions", "es": "cebollas", "da": "løg" },
  "aliases": { "de": ["Speisezwiebel", "kleine Zwiebel", "rote Zwiebel"] },
  "aisle": "vegetables",
  "icon": "🧅",
  "base": "g",
  "shop": "piece",
  "units": { "piece": 80 },
  "per100": { "kcal": 40, "protein": 1.1, "carbs": 9.3, "fat": 0.1 },
  "source": "usda:170000",
  "staple": false
}
```

| Field | Rule |
|-------|------|
| `id` | English slug, `a–z 0–9 -`. Never renamed, never reused. This is what recipes store. |
| `names`, `plural` | Display names in DE/EN/ES/DA. `aliases` only feed the matcher. |
| `aisle`, `icon` | Take over the job of `catalog.js` (D2): one table for shopping aisles, tiles, Lager chips and recipe icons. `catalog.js` is generated from the master or reads it. |
| `base` | `g` or `ml`: the unit all maths is done in. |
| `shop` | The unit the shopping list shows (`piece` for onions, `g` for flour, `can` for canned tomatoes). Without it the list would say "240 g Zwiebeln". |
| `units` | **This ingredient's** conversions into its base unit: `{ "piece": 80, "tbsp": 14, "clove": 3, "can": 400, "packet": 7 }`. |
| `density` | Optional g per ml. Lets volume units convert for ingredients measured by weight (flour 0.55, sugar 0.85, honey 1.4). |
| `per100` | kcal, protein, carbs, fat per 100 g (or per 100 ml when `base` is `ml`). Optional: an ingredient without it still matches, translates and shops. |
| `source` | Where `per100` comes from: `usda:<id>` (USDA FoodData Central, CC0), `frida:<id>` (DTU Frida, attribution) or `estimate`. Licence note lives in the file header (check C-18). |
| `staple` | Default pantry staple (replaces the hardcoded `DEFAULT_STAPLES`). |

**R1-Q1 (base unit).** The roadmap sketch says "base unit g · ml · piece". Recommended here: maths
only in **g or ml**; "piece" is a unit with a weight (`units.piece`) plus the display hint `shop`.
One onion still shows as "1 Zwiebel" everywhere; internally it is 80 g. This keeps nutrition a single
formula and avoids per-piece nutrition tables.

## 4. Units

One global table with neutral ids and display names per language:

| Kind | Units (id → German display) | Conversion |
|------|------------------------------|------------|
| Mass | `g`, `kg` | fixed: 1, 1000 |
| Volume | `ml`, `l` (also "Liter"), `tsp` → TL, `tbsp` → EL, `cup` → Tasse | fixed in ml: 1, 1000, 5, 15, 250 |
| Count | `piece` → Stück (also "no unit"), `clove` → Zehe, `slice` → Scheibe, `bunch` → Bund, `can` → Dose, `packet` → Päckchen, `jar` → Glas, `tub` → Becher, `cube` → Würfel, `cm` (ginger) | **per ingredient only** (`units`) |
| Vague | `pinch` → Prise | fixed 0.5 g, shown as stated |
| None | no amount ("nach Geschmack", "zum Braten") | not counted |

**Order of conversion to grams**, first hit wins:

1. The line states a weight in g or kg → use it.
2. The line states a weight in brackets next to another unit → use the bracket and keep the display
   unit: "1 Päckchen Trockenhefe (7g)" is 7 g shown as "1 Päckchen"; "1 Dose (400 g)" is 400 g
   shown as "1 Dose". This is the *double unit* case.
3. The ingredient's own `units[unit]`: "1 Zwiebel" → 80 g, "2 EL Öl" → 28 g, "3 Knoblauchzehen" → 9 g.
4. A volume unit and the ingredient has `density` or `base: "ml"`: "250ml Milch" → 250 ml.
5. Otherwise the line has **no weight**. It still matches and shops, but nutrition skips it and the
   recipe's value gets the "≈" (L2 rule: "≈" when less than 80 % of the weight is matched).

Ranges ("4–5 Eier") use the lower bound for maths and keep both for display (`amount`, `amountMax`).
"1 Dose" without a bracket uses `units.can`; drained weight is a property of the ingredient
(`chickpeas-canned`: `can` = 240), not of the line.

## 5. Recipe line (R3)

```json
{ "text": "Teig: 1 Päckchen Trockenhefe (7g)", "ing": "yeast-dry", "amount": 1, "unit": "packet",
  "g": 7, "group": "Teig", "prep": "", "buy": false, "optional": false }
```

| Field | Rule |
|-------|------|
| `text` | **The exact `ingredients` string this item was read from.** The link between the two lists. |
| `ing` | Master id, or absent when nothing matched (the line stays free text). |
| `amount`, `amountMax`, `unit` | As written, for display and scaling. |
| `g` | Only when the recipe states the weight itself (rules 1–2) or the user corrected it. Everything else is computed from the master at read time, so a better conversion table improves old recipes. |
| `group`, `prep`, `buy`, `optional` | From the prefix ("Teig:"), the part after the comma ("gewürfelt"), 🛒 and "optional". |

**Why `text` and not "same position in the list".** `rezepte.json` is edited by v1, by project-Claude
and by older builds, none of which know `items`. If item 3 simply belonged to line 3, any such edit
would silently attach the wrong ingredient. With `text`, the app re-links on every load: a string with
a matching item keeps it; a string without one is run through the matcher again; an item whose string
is gone is dropped. One string may own several items (the split parts of "2 TL Curry, 1 TL
Kreuzkümmel"). A user's manual correction ("this is `cumin-ground`") survives as long as the line's
text does.

**In v2.x (flat-v3, additive):** `ingredients` stays the contract every reader understands. `items`
is optional and derived; deleting it loses nothing but manual corrections. Export/import (G2) carries
it; `RECIPE_FIELDS` in `schema.js` gets the new name so the import keeps it.

**In format 4:** `items` is the truth. Display strings are generated from it in the user's language,
which makes ingredient lines translatable without snapshots.

### Checked against real recipes

| Line (recipe) | Result |
|---------------|--------|
| `2 Süßkartoffeln, gewürfelt (~2 cm)` (r01) | `sweet-potato`, 2 piece, prep "gewürfelt (~2 cm)" → 2 × `units.piece` |
| `400g Kichererbsen (Dose, abgetropft)` (r01) | `chickpeas-canned`, 400 g, weight stated → rule 1 |
| `400ml Kokosmilch (Dose)` (r01) | `coconut-milk`, 400 ml, `base: ml` → rule 4 |
| `2 TL Curry, 1 TL Kreuzkümmel, ½ TL Chiliflocken` (r01) | three items sharing one `text`; each tsp via `units.tsp` |
| `Salz, Pfeffer, Öl` (r01; 46 lines start with "Salz,") | three items, no amount → matched, shopped as staples, not counted |
| `Reis als Beilage` (r01) | `rice`, no amount → not counted. The biggest calorie source of the dish is missing: this recipe shows "≈" |
| `Teig: 1 Päckchen Trockenhefe (7g)` (Apfelkuchen Hefeteig) | double unit → `g: 7`, display "1 Päckchen", group "Teig" |
| `Belag: 1,5kg Äpfel (5–6 mittelgroß), geschält, in Scheiben` (Apfelkuchen) | `apple`, 1.5 kg; the bracket is a count, not a weight → kept in `prep` |
| `Teig: 1 Päckchen Vanillezucker 🛒 (oder 1 TL Zimt)` (Apfelkuchen Backpulver) | `vanilla-sugar`, 1 packet → `units.packet` = 8 g; the alternative stays text |
| `4–5 Eier` (Shakshuka) | `egg`, amount 4, amountMax 5 → 4 × 55 g |
| `1 Dose Thunfisch, abgetropft` (Thunfisch-Pasta) | `tuna-canned`, 1 can → `units.can` (drained) |
| `Béchamel: 50g Butter, 50g Mehl, 600ml Milch, Muskat` (Lasagne) | group "Béchamel", four items; "Muskat" has no amount |
| `1,2 Liter Gemüsebrühe 🛒` (Linseneintopf) | needs the parser fix for "Liter"; then `vegetable-stock`, 1200 ml |
| `Buttermilch oder Joghurt 🛒 zum Servieren` (Mujadara) | alternative → matched to the **first** option, rest kept as text; no amount |
| `Feta 🛒 und Petersilie 🛒 (optional)` (Shakshuka) | two items, optional, no amount |
| `200g Erbsen & Karotten (Dose)` (Linsensuppe) | one product, not two ingredients → own master entry `peas-carrots-canned` |

Expected result for the base cookbook with a 150-ingredient master: about 95 % of the parts matched
to an ingredient; about 80 % of the parts with a usable weight. Recipes whose main calorie source has
no amount ("Reis als Beilage", "Brot zum Tunken") are the visible gap; L3's plausibility tool lists
them so the lines can be given an amount by hand.

## 6. Ownership and personal state (R6, G3)

Two optional fields on a recipe:

| Field | Values | Meaning |
|-------|--------|---------|
| `origin` | absent or `"base"` · `"user"` · `"shared"` | Who wrote the **current content**: the bundled catalog, you, or someone who sent it to you (V3). Absent counts as base, as decided in G3-Q1. |
| `forkedFrom` | a recipe id, later `"<owner>/<id>"` | Where the content came from before you changed it. |

Rules:

- A recipe saved through the form, capture, import or the assistant gets `origin: "user"`.
- **Editing the content of a base recipe** turns it into your version: `origin: "user"`,
  `forkedFrom: <its id>`. "Content" is everything outside the personal fields below.
- Favourite, rating, cooked count, last cooked, notes, photos **never** change `origin`.
- The assistant may delete only `origin: "user"` recipes **without** `forkedFrom` pointing at a base
  recipe (deleting your version of a base recipe would remove the base recipe from your cookbook; it
  offers "reset to original" instead). This is the G3 delete guard.

**R1-Q2 (what "your own copy" means in your own cookbook).** Two options when you edit a base recipe:

- **(a) In place — recommended.** The recipe keeps its id and place; it is now marked as your version,
  and a "reset to original" action can restore the bundled text. No duplicates, the weekly plan and
  the shopping list keep pointing at it.
- **(b) Second recipe.** The original stays, your edit becomes a new recipe next to it. Two near-equal
  entries per edited recipe, and every reference has to be moved.

For recipes **received from another person** (V3, D10 b) the copy is real either way: the receiver
gets their own recipe with `origin: "shared"` and `forkedFrom: "<owner>/<id>"`; their first edit turns
it into `origin: "user"`.

**Personal fields** are defined once in code since v2.18 (`PERSONAL_FIELDS` in `schema.js`):
`favorite`, `rating`, `cookedCount`, `lastCooked`, `feedback`, `photos`. In flat-v3 they stay on the
recipe (additive rule). In format 4 they move into one object:

```json
"my": { "favorite": true, "rating": 4, "cookedCount": 3, "lastCooked": "2026-11", "note": "…", "photos": [], "toTry": false }
```

**R1-Q3.** `toTry` ("🆕 Probieren") is treated as personal from format 4 on (it is your list, not a
property of the dish). `lastCooked` becomes an ISO month (`"2026-11"`), which ends the free-text
parsing that QA-02 and TW-15 had to patch.

With accounts (D10 b), `my` is exactly the part that becomes a per-user row; the rest of the recipe is
what gets shared.

## 7. File format 4 (P6, slice 2) — one migration

```json
{
  "version": 4,
  "updated": "2027-01-20T10:00:00.000Z",
  "recipes": [{
    "id": "r01",
    "lang": "en",
    "name": "Sweet potato curry with chickpeas",
    "category": "vegetarian-mains",
    "effort": "everyday", "difficulty": "easy", "season": "autumn",
    "servings": "~4", "time": "35 min", "totalTime": 35,
    "items": [ { "ing": "sweet-potato", "amount": 2, "unit": "piece", "prep": "diced (~2 cm)" } ],
    "steps": ["…"], "tips": "…", "tags": [],
    "origin": "base",
    "my": { "favorite": true, "rating": 4, "cookedCount": 3, "lastCooked": "2026-05" }
  }]
}
```

| Change from 3 to 4 | Detail |
|--------------------|--------|
| `lang` per recipe | D8 says English is the stored language *and* your own recipes stay as you wrote them. Both are only true if every recipe says which language its text is in. Base recipes become `"en"`, your recipes keep `"de"` (or whatever you wrote). |
| Neutral keys | `category` (16 keys), `effort`, `difficulty`, `season`. German, Danish and Spanish become display translations. |
| `items` is the truth | Unmatched lines stay as `{ "text": "…" }`. `ingredients` strings are no longer stored. |
| `origin`, `forkedFrom` | Section 6. Migration: a recipe whose content equals the bundled base recipe of the same id → `base`; a base id with changed content → `user` + `forkedFrom`; everything else → `user`. |
| `my` | Section 6. |

**Migration rules**

- The upgrade 3 → 4 is one pure, tested function; it runs once per file, in V3 (slice 2).
- **v2.21 reads and writes format 4 when it finds it, and never upgrades or downgrades a file itself**
  (P6). That keeps the 30-day fallback working in both directions.
- The upgraded app keeps the last format-3 file as `rezepte.v3-backup.json` in Drive, next to the new one.
- The G2 export file follows the same version; the import accepts 3 and 4.

**R1-Q4 (v1 and project-Claude).** Two readers cannot follow to format 4: the legacy v1 app in the
repo root and the "project-Claude edits `rezepte.json`" workflow of `SCHEMA.md`. Recommended: both end
with format 4. v1 gets a one-line guard *before* the migration ships (refuse files with
`version > 3` instead of overwriting them; today it does not check), and the in-app assistant (G3)
replaces project-Claude. Needs your yes, because it retires requirement #3 of the original project
("Claude updates the data") in its old form.

## 8. Build order and what each step needs

| Step | Version | Depends on | Size |
|------|---------|------------|------|
| R2 master file, 150 ingredients, with a test that every id is unique and every base-recipe line is either matched or on an explicit "free text" list | v2.19 | R1-Q1, R1-Q5 | M–L (data work; AI-drafted, Marcel spot-checks) |
| R3 `items[]` additive + matcher + parser fixes ("Liter", alternatives) + re-link on load | v2.19 | R2 | M |
| L2 `estimateNutrition` + "≈ 520 kcal" on card and detail · L3 outlier tool | v2.19 | R3, R1-Q6 | M + S |
| R6 `origin` / `forkedFrom` + "reset to original" | v2.19b (or with G3 in v2.20) | R1-Q2 | S–M |
| R4 editor with ingredient picker · R5 capture maps to the master | v2.19b | R3 | L + M |
| P6 v2 reads/writes format 4 · v1 guard | v2.21 | R1-Q3, R1-Q4 | M |

**R1-Q5 (nutrition source).** USDA FoodData Central (CC0, English names, the widest coverage) as the
default; Frida only where USDA has no entry for a Danish/German product. One source keeps the
numbers consistent. Values are AI-drafted from those tables and spot-checked by you on 20 ingredients.

**R1-Q6 (what the card shows).** kcal per serving only on the card; kcal + protein, carbs, fat on the
detail page. "≈" when less than 80 % of the recipe's weight is matched; **no number at all** when less
than 50 % is matched (a wrong number is worse than none).

**R1-Q7 (size of v2.19).** R2 + R3 + L2 + L3 is more than one 2–3 h device test. Recommended split:
**v2.19** = R2 + R3 (visible result: ingredient lines in your UI language for matched lines, better
shopping aggregation) and **v2.19a** = L2 + L3 (calories). The scope freeze (31 Dec) is not affected:
both are already planned.

## 9. Consequences

- **Good:** one identity for an ingredient across recipes, shopping list, Lager and nutrition (the
  seven "same item?" rules of Epic T5 collapse into an id comparison); ingredient lines translate
  without snapshots; calories work offline; the data is ready for sharing between accounts.
- **Cost:** the master is a data set that needs care (150 entries × 4 languages × conversions). The
  matcher will be wrong sometimes; that is why every line keeps its text and stays correctable.
- **Risk:** format 4 is the one irreversible step. It is guarded by the backup file, the v2.21
  reader, and by shipping `items`/`origin` additively in v2.19–v2.20 first, so the model is used for
  two months before anything is migrated.

## 10. Not decided here

Accounts and what the backend stores (D10), public vs. invite-only sharing (D11), AI nutrition
fallback (L4), scaling nutrition by portions in the planner (L5), photos in format 4 (slice 7).
