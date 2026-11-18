# 4 · What gets built next

After v2.18 the roadmap's next item is v2.19, and v2.19 waits for your R1 sign-off (file 3). Without
other approved work the nightly builder has nothing to do from about Friday on.

### 4.1 Pull v2.20 forward while R1 waits

Two v2.20 items are fully answered (your answers of 27 Oct) and do not depend on the ingredient model:

- **Q4 Editable assistant instructions** — a settings screen where you edit the assistant's persona
  and rules, with the variables `{profile}`, `{stock}`, `{fridge}`, `{recipes}`, `{language}`, a
  warning when one is removed, and "reset to default".
- **G3 Assistant creates, updates and deletes recipes** — every change shown for confirmation; delete
  only for recipes you created (new optional field `origin`).

I created both as issues with `status:planned` ([#59](https://github.com/Marcipane3/Citchen/issues/59),
[#60](https://github.com/Marcipane3/Citchen/issues/60)), so the refiner splits them into small ready issues and the builder takes them
night by night. Setting `planned` is normally yours; I did it because the roadmap already lists both
as planned with all questions answered.

- **Recommended: leave them.** If you would rather keep the pipeline idle until R1 is signed, say
  "4.1 no" and I remove the label.

Answer:

### 4.2 Small wins: which may fill free nights?

All are marked "(proposed)" in `ROADMAP-V2.md` and were never decided. Each is one small issue.

| ID | What | Size | Recommended |
|----|------|------|-------------|
| QW-8 | Step timers keep running when you change step or portions in cooking mode (today they stop) | M | **yes** — cooking mode is core, and this is a bug you can hit with wet hands |
| QW-2 | Cooking mode remembers the portion size you last used per recipe | S | **yes** |
| QW-4 | Warning before saving a captured recipe whose name closely matches an existing one | S | **yes** — more useful now that import exists |
| QW-6 | Marking a planned day "cooked" updates last cooked | S | no — the weekly plan is lowest tier for you |
| QW-7 | Slimmer sticky header on the shopping list | S | later — needs a look on your phone first |
| E3 | Photo of your shopping → AI ticks off those items | M | later — after V3 |

Answer:

### 4.3 Close F1 "generate many dishes to taste"

The roadmap proposes closing it as done: bulk "✨ KI-Ideen" plus profile-aware generation (v2.13)
already do it.

- **Recommended: close.**

Answer:

### 4.4 V3 decisions that have been waiting since October

Both shape the backend slice and the privacy policy; details in `ROADMAP-V3.md` §6.

- **D10 timing:** accounts and recipe sharing between users in v3.0, or as the first v3.x release?
  **Recommended: v3.x** (June–September 2027). v3.0 gets a schema that is ready for it. Reason: the
  domain move, Play Store, English data format and the structured recipes already fill your 2–3 h a
  week until April.
- **D11 sharing model:** send/invite to people or a household, **not** public browsing.
  **Recommended: send/invite only.** Public recipes need moderation, takedown and copyright handling.

Answer:

### 4.5 Long-lead items only you can start (no Claude work possible)

Listed in the roadmap for November; each has waiting time that Claude cannot shorten.

- **Domain:** check `citchen.app` and `citchen.de` at a registrar and buy one (2 minutes, about €5–20
  a year). Needed for V3 slice 1.
- **Google Play developer account:** registration and identity check take days, sometimes longer.
- **Testers for the closed test:** the roadmap plans with 12 people from slice 3 on (January). Worth
  asking friends now.

- **Recommended:** domain this week, Play account in November, tester list by mid-December.

Answer (what is done / when):
