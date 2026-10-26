# ADR D9 / P7 — Supabase as the backend, run to production standard

- **Status:** accepted for V2 (v2.15b, 2026-10-26) · revisit at V3 slice 1b (D10, spike C-30)
- **Owner:** Marcel · written by Claude Code
- **Related:** `supabase/README.md` (how-to), `ROADMAP-V2.md` P7, `ROADMAP-V3.md` D9/D10/slice 1b,
  `qa/findings/architect.md` AR-12, `qa/findings/data-guardian.md` DG-12

## Context

Since v2.14 (I3) the friends link runs on one Supabase project (`wbvhgeqdixrcfeszsiob`, EU, Free plan).
D9 says Supabase is the real backend from V3 on, not an exception. P7 asks to bring today's use to
production standard before V3 builds on it:

- schema as migration files, rebuildable from the repo;
- dev/prod separation;
- row-level security + security advisor clean, secrets review;
- a decision *Free + keep-alive* vs. *Pro ($25/month)*, restore tested;
- the QA fleet's AR-12 (`fl_create` is an open capacity sink) and DG-12 (crash window between saving
  the list and remembering `seen`).

What Supabase holds today is **transient**: open items (republished from the list on every change)
and friend suggestions that haven't been picked up yet. Drive stays the source of truth.

## Decision

1. **Schema lives only in `supabase/migrations/`.** Every change is a new migration file, tested by
   `supabase/tests/run.sh` — a throw-away local Postgres that applies all migrations in order and
   tests the RPCs as `anon`. That run *is* the restore test for the schema.
2. **Security model stays "no tables, only token-checked functions":** RLS on, no policies, all grants
   revoked; 9 `SECURITY DEFINER` functions with a fixed `search_path`. The run asserts it. The
   expected advisor warnings ("`SECURITY DEFINER` executable by `anon`" and "… by `authenticated`",
   one each per function = 18) are intentional.
3. **Abuse (AR-12):** without accounts there is no proof of origin, so `fl_create` gets brakes instead:
   - 30 new lists per hour overall (`rate`);
   - lazy clean-up of abandoned lists: never published and older than 7 days, or 120 days without an
     owner call;
   - the 500-list cap stays (`capacity`).

   Friend-side limits were already in place (100 open, 20 per minute per list).
4. **DG-12:** the list and the ids of suggestions already applied are written in **one** IndexedDB
   transaction (`friendSeen` on the list record), so a crash can no longer count a suggestion twice.
5. **Free plan + keep-alive now, Pro later.** A GitHub Action makes a harmless read twice a week
   (`.github/workflows/supabase-keepalive.yml`); the app keeps the project active anyway when used.
   **No backups needed today** because nothing in Supabase is the only copy of anything.
   **Switch to Pro when** Supabase starts holding data that can't be rebuilt from Drive — V3 slice 1b
   (accounts, shared cookbooks), or earlier if the friends link becomes something people rely on daily.
6. **Dev/prod:**
   - dev = the local test database (no cloud);
   - optionally a second free project, selected per device via `localStorage["koch.supabase"]`
     (publishable keys on `*.supabase.co` only);
   - prod is reached only through migrations.

## Options considered

| Option | Cost | For | Against |
|---|---|---|---|
| **Free + keep-alive** *(chosen)* | €0 | "cheap, no money" principle; data is transient | can pause if both the app and the Action go quiet for 7 days; no backups; GitHub pauses cron after 60 days without repo activity |
| Pro now | $25/month | never pauses, 7-day backups | pays for backups of data that is rebuilt anyway |
| Move off Supabase (Vercel/own server) | varies | — | more ops; D9 already chose Supabase (EU, RPC model fits a static PWA) |

## Consequences

- A lost or paused-and-deleted project costs **one new friends link**, not data.
  - Restore drill: new project → migrations → new URL/key in `v2/src/data/supabase.js` → release.
  - The app shows "link gone" and the user makes a new one.
- `fl_create` can now answer `rate` / `capacity`; the app shows "too many links right now, try again in
  an hour" instead of "are you online?".
- A list nobody opens for 120 days loses its friends link (the app then says "gone").
- Done 2026-10-26: Marcel applied the v2.15b migration on prod; the security advisor shows only
  the 18 expected warnings (see `supabase/README.md`).
