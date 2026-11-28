# ADR D10 / D11 — Accounts and sharing: schema sketch and open points

- **Status:** decided (D10, D11: 2026-11-18) · schema is a **sketch**, built in v3.2 (send/invite) and v3.x (public) ·
  open points answered by Marcel 2026-11-27 (one still open: #146)
- **Owner:** Marcel · written by Claude Code
- **Related:** `ROADMAP-V3.md` D10/D11, US-L1, US-08e, slice 1b · `ADR-D9-supabase-backend.md` ·
  `ADR-R1-ingredient-model.md` §6 · `docs/v3/03-QUESTIONS.md` (Part 3, Round 4)

## Context

D9 made Supabase the real backend from V3 on. Slice 1b (v3.0-a1b) builds only the feedback table and its
RPC; for accounts and sharing it asks that the schema is "written down in an ADR only". The Supabase work
in v3.2 happens in an interactive session with Marcel (`supabase/` is a protected path) and needs this
page as input.

Today Supabase holds only transient data (friends inbox, ADR-D9). Accounts change that: a profile and a
sent recipe are data Drive cannot rebuild, which is also the trigger for Supabase Pro (ADR-D9 §5).

## Decision

Restated from the roadmap, unchanged:

1. **D10 — accounts and sharing come in v3.2 (May–Jun 2027).** Google sign-in via Supabase. Recipes stay
   in Drive; the account only identifies owners. Supabase Pro from v3.2.
2. **Send/invite sharing is a linked copy where edits fork.** The receiver gets their own recipe with
   `origin: "shared"` and `forkedFrom: "<owner>/<id>"` (ADR-R1 §6). Their first edit of the content turns
   it into `origin: "user"`.
3. **D11 — public browsing too, with ratings/likes.** Send/invite comes first. Timing is **not**
   decided: D11-T is reviewed in **March/April 2027** (does it fit what has been built?). Comments, follows and a
   feed stay out.
4. **v3.0 writes the schema down only** (this file). No migration, nothing under `supabase/`.

### Schema sketch (not SQL; names are proposals)

Security model follows ADR-D9: RLS on every table, **no direct table grants to `anon`**; the app talks
to token-checked or auth-checked `SECURITY DEFINER` RPCs with a fixed `search_path`. `uid` = `auth.uid()`.

#### v3.2 — profiles and send/invite

**`profiles`** — one row per account.

| Column | Type | Note |
|---|---|---|
| `id` | uuid, PK, = `auth.users.id` | |
| `display_name` | text | shown to receivers; user-editable |
| `handle` | text, unique, nullable | for "send to @handle"; see Q2 |
| `created_at` | timestamptz | |

RLS idea: a user reads and updates only their own row. Other users see `display_name` only through the
RPCs below, never by table access.

**`shared_recipes`** — one row per send (a snapshot, not a live link).

| Column | Type | Note |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid → `profiles.id` | sender |
| `recipe_id` | text | the sender's recipe id (goes into `forkedFrom` as `<owner>/<id>`) |
| `payload` | jsonb | recipe at send time, flat-v3, canonical German, personal fields stripped |
| `recipient_id` | uuid → `profiles.id`, nullable | set for "send to a person" |
| `invite_token_hash` | text, nullable | set for "invite by link"; only the hash is stored |
| `status` | `sent` / `accepted` / `declined` / `revoked` | |
| `created_at`, `expires_at` | timestamptz | invites expire (default in Q4) |

RLS idea: the owner sees their sends; the recipient sees rows addressed to them; nobody else sees
anything. Anonymous invite links go through an RPC that checks the token, never through a table read.

RPCs (all `SECURITY DEFINER`, rate-limited like `fl_create` in ADR-D9):

- `profile_upsert(display_name, handle)` — create/update own profile on first sign-in.
- `recipe_send(recipe_id, payload, recipient_handle | null)` → `{id, invite_token?}`.
- `recipe_inbox()` → rows addressed to `uid` with `status = sent`.
- `recipe_accept(id | invite_token)` → returns `payload` and `owner` for the local copy; sets `accepted`.
- `recipe_decline(id)` / `recipe_revoke(id)` — receiver / sender.
- `account_delete()` — removes profile and all rows (privacy; see risks).

The receiving app writes the copy into the user's own Drive `rezepte.json` with `origin: "shared"`,
`forkedFrom: "<owner>/<id>"`. The server never writes to Drive.

#### v3.x — public recipes and ratings (**not built**)

**`public_recipes`**

| Column | Type | Note |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid → `profiles.id` | |
| `recipe_id` | text | owner's id |
| `payload` | jsonb | published snapshot; owner can re-publish or unpublish |
| `lang` | text | recipe language (English is the main language) |
| `status` | `live` / `hidden` / `removed` | `hidden` = reported, awaiting review; `removed` = takedown |
| `published_at`, `updated_at` | timestamptz | |

RLS idea: anyone may read `status = live` through a read RPC or a restricted view; only the owner writes
their own rows; `hidden`/`removed` visible to the owner only.

**`ratings`** (rating and like in one row, see Q7)

| Column | Type | Note |
|---|---|---|
| `public_recipe_id` | uuid → `public_recipes.id` | |
| `user_id` | uuid → `profiles.id` | |
| `stars` | smallint 1–5, nullable | |
| `liked` | boolean | |
| `created_at` | timestamptz | |

PK `(public_recipe_id, user_id)`: one vote per account per recipe. RLS idea: a user reads and writes only
their own row; aggregates (average, count, likes) come from a read RPC or materialized counts.

**`reports`** — `id`, `public_recipe_id`, `reporter_id`, `reason`, `created_at`, `handled_at`.
RLS idea: insert through RPC only; read by the operator (service role), never by clients.

RPCs: `public_publish`, `public_unpublish`, `public_browse(query, lang, page)`, `public_get(id)`,
`public_copy(id)` (returns payload; local copy gets `origin: "shared"`), `public_rate(id, stars, liked)`,
`public_report(id, reason)`.

### Risks (from `ROADMAP-V3.md` US-08e) and what the schema needs

- **Report + takedown flow.** `reports` table, `status` on `public_recipes`, a report threshold that sets
  `hidden` automatically, and a documented operator procedure (service role only).
- **Photo/recipe copyright rule.** A published recipe must be the owner's own text; photos are **not**
  part of `payload` in the first public version (Q6). A short rule shown at publish time, plus
  `removed` status for takedowns.
- **Vote abuse.** Accounts only (no anonymous votes), one row per account and recipe (PK), per-account
  rate limit in the RPC, `created_at` for later detection, minimum account age before voting (Q8).
- **Privacy policy + Play data-safety update.** Profiles, sent recipes and ratings are personal data:
  the policy and data-safety form must name them before v3.2 ships; `account_delete()` must remove
  everything incl. ratings and published recipes; no analytics data in these tables.

## Options considered

| Option | For | Against |
|---|---|---|
| **Linked copy that forks on edit** *(chosen, D10)* | Recipes stay in the receiver's Drive; works offline; no live-sync complexity | Receiver does not see later changes by the sender |
| Live shared recipe (one record, both edit) | Always up to date | Conflict handling, ownership disputes, Drive no longer the source of truth |
| Public-first (skip send/invite) | One mechanism | Overrides the decided order; needs report/takedown before any sharing |

## Consequences

- Supabase now holds data that Drive cannot rebuild → **Pro plan from v3.2** (ADR-D9 §5), with backups
  and a restore drill.
- Sign-in adds a second identity next to the Google Drive login; the app must work fully without an
  account (accounts are optional and only needed to send/receive).
- `forkedFrom: "<owner>/<id>"` needs a stable owner id: `profiles.id` is that id; it must survive a
  display-name or handle change.
- Public recipes (v3.x) add moderation work for the operator; that is a reason D11-T stays open.

## Not decided here

Answered by Marcel on 2026-11-27 (interactive session). Point 7 is still open.

1. **D11-T: when do public recipes ship?** Still not decided. **Review in March/April 2027**: does it
   fit the line of what has been built by then? (Was: May 2027.)
2. **Handles or e-mail for "send to a person"?** **Decided:** optional `handle`, plus invite links; no
   e-mail lookup of other users (privacy).
3. **Do receivers see the sender's name?** **Decided:** yes, `display_name` only.
4. **Invite expiry.** **Decided:** 30 days, then `expired`; the sender can resend.
5. **Can a sender revoke after acceptance?** **Decided:** no; the copy is the receiver's. Revoke only
   works while `sent`.
6. **Photos in sent and public recipes.** **Decided:** not in the first version of either. Kept as an
   idea in `ROADMAP-V3.md` §5 (US-08f); Marcel reconfirms it once the first versions are built.
7. **Ratings and likes: one mechanism or two?** **Open**, in the backlog as #146. *Suggested:* one
   table, stars optional, like optional.
8. **Vote-abuse limits.** **Decided:** account at least 7 days old, 30 votes per day.
9. **Report threshold for auto-hide.** **Decided:** 3 distinct reporters.
10. **Account deletion scope.** **Decided:** delete profile, sends, published recipes and ratings
    immediately; copies already in other people's Drive stay (they are theirs).
11. **Household / shared cookbook (US-08b).** **Decided:** out of this ADR; a separate ADR in the v3.x
    plan, reusing `profiles`. US-08b means one cookbook that several people in a household keep and
    edit together. A printable cookbook is a different idea, now US-L8 in `ROADMAP-V3.md` §5.
12. **Sign-in providers beyond Google.** **Decided:** Google only in v3.2. E-mail sign-in is on the
    roadmap as US-L7 (v3.x), with what it changes: people without Google have no Drive, so their
    recipes need a home on the backend.
