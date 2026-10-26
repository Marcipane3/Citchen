# Supabase — the friends-link backend (I3), hardened in v2.15b (P7)

Supabase is the only server Koch v2 talks to. It is a **mailbox + shop window** for the friends link:
friends see your open items and drop suggestions; the app picks them up, puts them on your list and
deletes them on the server. **Google Drive stays the source of truth** — nothing in Supabase is needed
to rebuild your cookbook or your shopping list.

| | |
|---|---|
| Project (prod) | `wbvhgeqdixrcfeszsiob` · EU · Free plan |
| Used by | `v2/src/data/supabase.js` (app + `v2/add.html`), `v2/src/data/friendInbox.js` |
| Schema | `supabase/migrations/*.sql` — **the only source of truth for the database** |
| Tests | `bash supabase/tests/run.sh` (local Postgres, no cloud) |
| Decision record | `docs/v3/adr/ADR-D9-supabase-backend.md` |

## Security model (why the anon key in the app is fine)

- **No table access.** Both tables have row-level security on and *no* policies; every grant to
  `anon`/`authenticated` is revoked. The publishable key can't read or write a single row directly.
- **Everything goes through 9 functions** (`fl_*`), each `SECURITY DEFINER` with a fixed
  `search_path`, and each checks a token first:
  - owner functions take the **owner token** (64 hex chars, made on the phone; the server only stores
    its SHA-256),
  - friend functions take the **invite token** (128 random bits).
- **Abuse brakes:** max 100 open suggestions and 20 per minute per list; max **30 new lists per hour**
  overall and **500** in total; abandoned lists are deleted automatically (never published and older
  than 7 days, or the owner hasn't called in 120 days) — added in v2.15b against AR-12.
- **Secrets:** the client only holds the *publishable* key. No service-role / secret key, database
  password or access token is in the repo (checked in v2.15b). Keep it that way.
- **Expected advisor warnings — 18 in total, all intentional:** for each of the 9 `fl_*` functions
  one "Public Can Execute SECURITY DEFINER Function" (`anon`, lint 0028) and one "Signed-In Users
  Can Execute SECURITY DEFINER Function" (`authenticated`, lint 0029). Calling them without an
  account is the whole design (see above); `authenticated` keeps the same rights so a friend who
  happens to be signed in (V3 accounts) still gets the same functions. `supabase/tests/run.sh`
  asserts exactly this set. **Anything else** the security advisor reports is a real finding.

## Rebuild the database from the repo

The local test does exactly this on every run (fresh Postgres → all migrations in name order → tests
as `anon`), so a rebuild is proven, not hoped for:

```bash
bash supabase/tests/run.sh      # needs Postgres ≥ 15 locally (initdb, pg_ctl, psql)
```

On a real (new or existing) Supabase project, apply the migrations **in file-name order**:

- **Dashboard:** SQL Editor → paste each file from `supabase/migrations/` → Run, oldest first.
- **CLI:** `supabase link --project-ref <ref>` then `supabase db push`.

Then run **Advisors → Security** in the dashboard; only the 18 expected warnings above should remain.

### v2.15b on prod — done 2026-10-26

Marcel applied `20261026220000_p7_hardening.sql` to `wbvhgeqdixrcfeszsiob` via the SQL Editor on
2026-10-26; the security advisor then showed exactly the 18 expected warnings above.

## Dev vs. prod

- **Dev, day to day:** `supabase/tests/run.sh` — a throw-away local database, no cloud, no cost.
- **Dev, by hand (optional):** a second free Supabase project (e.g. `koch-dev`, EU). Apply the
  migrations there, then point ONE browser at it from the console and reload:
  `localStorage.setItem("koch.supabase", JSON.stringify({ url: "https://<dev-ref>.supabase.co", key: "sb_publishable_…" }))`
  — back to prod: `localStorage.removeItem("koch.supabase")`. Only `https://*.supabase.co` URLs with a
  publishable key are accepted.
- **Prod:** `wbvhgeqdixrcfeszsiob`. Schema changes reach prod only as a new migration file in this
  folder, tested with `run.sh` first. Never edit prod tables or functions by hand.

## Pausing, backups, restore

- **Pausing:** the Free plan pauses a project after 7 days without activity. The app keeps it awake
  whenever someone with a friends link opens it, and `.github/workflows/supabase-keepalive.yml` makes a
  harmless read twice a week as a safety net (GitHub stops scheduled workflows after 60 days without
  repo activity — re-enable under *Actions* if that mail comes). A paused project can be restored from
  the dashboard; nothing is lost.
- **Backups:** Free has none, and none are needed today — Supabase only holds open items (rebuilt from
  your list on the next publish) and suggestions not yet picked up (at most a few minutes old).
- **Restore drill** (if the project were ever lost):
  1. create a new project (EU) and apply the migrations (above);
  2. put the new URL + publishable key into `PROD` in `v2/src/data/supabase.js` and the keep-alive
     workflow, bump `BUILD` + `CACHE`, release;
  3. on the phone the friends link then shows "Dieser Freunde-Link existiert nicht mehr" → switch it
     off and create a new one, share the new link. The shopping list itself is untouched (Drive).
- **When to go Pro ($25/month):** when Supabase starts holding data that can't be rebuilt from Drive —
  V3 slice 1b (accounts, shared cookbooks). See the ADR.
