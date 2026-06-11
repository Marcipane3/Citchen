# Koch v2 — Project Overview

> **Read this first.** This document set specifies a ground-up rebuild ("v2") of the existing
> *Koch* recipe app. It is written to be handed to **Claude Code running Claude Fable 5** for an
> autonomous, multi-phase build. Read all six files before starting:
> `00_OVERVIEW` · `01_ARCHITECTURE` · `02_DATA_SCHEMA` · `03_FEATURES` · `04_BUILD_PLAN` · `05_FABLE_KICKOFF_PROMPT`.

---

## What Koch is

Koch is a personal digital cookbook: a Progressive Web App (PWA) backed by Google Drive, holding a
structured recipe collection (`rezepte.json`) governed by a fixed 16-category schema. The long-term
goal is a growing, personalized collection that can eventually be exported as a real cookbook.

v1 already exists and works (vanilla JS, single `index.html`, GitHub Pages, `drive.file` OAuth). v2 is
a clean rebuild that keeps everything v1 does and adds a major new feature set.

## Vision for v2

Turn a static cookbook into a tool you actually use end-to-end: **plan → shop → cook → grow the
collection** — while staying fast, installable, and fully usable with no internet and no account.

## Core principles

1. **Offline-first.** Cookbook, cooking mode, meal planner, and shopping list must work with zero
   network and no API key. The app is fully functional out of the box.
2. **Local-first data.** Recipes live on-device (IndexedDB). Google Drive is the canonical
   backup/sync target when signed in and online.
3. **Two tiers, no backend.**
   - **Free tier** — everything that does not call an AI model. No key, no account, works offline.
   - **Premium / "special user" tier** — the user pastes *their own* Anthropic API key (BYOK,
     stored locally) to unlock AI features. The app ships with **no key**. No server, no payment
     system in v2.
4. **Modular.** Each feature is an independent module so it can be built, tested, and shipped on its own.
5. **Feature parity is mandatory.** v2 must include **every** feature that v1 has. Read the v1
   source before building (see `01_ARCHITECTURE` → "Feature parity").

## Why BYOK (the token/sharing decision)

Embedding the owner's API key in a client app would expose the key and bill all users' usage to the
owner. Instead, the app ships keyless. Anyone can install and use the entire offline app for free.
AI features are unlocked per-device by the user's own key. Result: the app is **freely shareable with
anyone**, AI usage is paid by whoever uses it, and the owner's tokens are never consumed by others.

A real paid backend (serverless proxy + payments) for users who don't have their own key is an
explicit **non-goal for v2** — it can come later without rearchitecting, because the AI layer is
already isolated behind a clean interface.

## Tech decisions (locked)

| Decision | Choice |
|---|---|
| Location | New **`/v2` subfolder** in the existing repo (v1 stays at repo root and keeps running) |
| Build tooling | **Native ES modules, no bundler** — deploys straight to GitHub Pages |
| UI | **Vanilla JS + Web Components** — no heavy framework |
| Offline | Service Worker (cache-first) + IndexedDB |
| Data sync | Google Drive, `drive.file` scope |
| Runtime AI model | **Haiku-tier default** (cheap, vision-capable); user can switch to Sonnet |
| Build-time engine | **Claude Fable 5** in Claude Code (autonomous, self-testing, vision-checking) |

## Non-goals for v2

- No backend server, no Stripe / payments, no managed multi-user accounts.
- No heavy frontend framework or mandatory build step.
- Cookbook **export** (PDF / web) is designed-for but built as a **later milestone**, not in the
  core v2 build.

## Document map

- **01_ARCHITECTURE** — stack, folder structure, data layer, offline, Drive sync, BYOK, parity rule
- **02_DATA_SCHEMA** — recipe schema, 16 categories, tags, structured Tipps, planner/list/settings shapes
- **03_FEATURES** — per-module functional specs and acceptance criteria
- **04_BUILD_PLAN** — phased autonomous build plan with self-tests, vision checks, and checkpoints
- **05_FABLE_KICKOFF_PROMPT** — the prompt to paste into Claude Code to start the build
