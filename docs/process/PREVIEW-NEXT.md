# Preview of `next` on `next.citchen.de` (draft)

- **Status:** draft (2026-11-28). Becomes active in one interactive setup session with Marcel (§4).
- **Goal:** the device checklist of a release PR runs **before** the merge into `main`, on a real
  phone, against exactly the code that will go live. Today it runs after the merge, on production
  (`ROADMAP-V2.md`: "v2.18 live 18 Nov · device checklist open"), and a failure means "Revert".
- **Draft workflow:** [`preview/preview.yml`](preview/preview.yml) → copy to `.github/workflows/preview.yml`.

---

## 1. What changes for Marcel

| | Today | With the preview |
|---|---|---|
| Where you test | live app (`marcipane3.github.io/Citchen/v2/`, later `citchen.de/app/`) | **`next.citchen.de/v2/`** (after the V3 rename: `/app/`) — its own home-screen icon "Preview" |
| When | after merging the release PR | **before** merging it |
| A failed check | "Revert" on the release PR; friends may have seen the broken build | comment on the release PR, don't merge; nobody else saw it |
| Which account | your real Google account and data | a **test Google account** (§5) |
| Extra time | — | none per release; one setup session (~45 min, §4) |

The release flow itself stays the same: `/release-prep` (Wed + Sat) opens the release PR, you merge
it. The only new step is "open the Preview icon and run the checklist there first".

---

## 2. Why a subdomain, not a second path on github.io

A browser keeps data **per origin** (scheme + host + port). Everything below the same host shares one
IndexedDB, one localStorage, one Cache Storage.

| Option | Origin | Problem |
|---|---|---|
| `marcipane3.github.io/Citchen-preview/` | same as today's live app | Shares the `koch-v2` database, the settings and the API key with the live app on your phone. A preview with a newer DB version upgrades the database under the live app. After the domain switch this origin still holds the **pre-move data** that the move helper (#108) reads, so a preview there could overwrite it. |
| **`next.citchen.de`** ✔ | its own | none of the above. Free (you own `citchen.de`), served by GitHub Pages from a second repository. Works **before and after** the domain switch, so even the switch release itself (slice 1) can be checked on the preview first. |
| Cloudflare Pages preview per branch | its own (`*.pages.dev`) | new account and build config; the hosting ADR says "not now" (`docs/v3/adr/ADR-HOSTING-url-layout.md`, point 9). |

Decision: **`next.citchen.de`**.

---

## 3. How it works

```
 PR merged into next ──► GitHub Action "Preview" (in this repo)
                           1. git archive of next  (tracked files only; .github removed)
                           2. rewrite the copy:  CNAME · robots.txt · CACHE+sha · BUILD+sha · manifest name
                           3. push one commit (replacing the previous one) to Marcipane3/Citchen-preview
                                         │
                                         ▼
                         GitHub Pages of Citchen-preview  →  https://next.citchen.de  (~1 min)
```

What the copy changes, and why (none of it touches the repository):

| Change | Why |
|---|---|
| `CNAME` = `next.citchen.de` | the root `CNAME` of this repo will say `citchen.de` after the switch |
| `robots.txt` = disallow all | the preview should not show up in search results |
| `sw.js`: `CACHE` + `-p<sha>` (e.g. `koch-v2.20-1-pb372bbb`) | feature PRs don't bump `CACHE`; the cache-first worker would keep serving the previous build. A new name per deploy = a new worker per deploy. The prefix stays `koch-v2`, so the worker's own cleanup deletes older preview caches (the rule "each worker deletes only its own prefix" holds). |
| `version.js`: `BUILD` + ` · preview <sha>` | the footer and Settings → About show which commit you are testing |
| manifest `name` / `short_name` = "Citchen Preview" / "Preview" | the two home-screen icons can't be confused |
| `.github/` not copied | `ci.yml` and the Supabase keep-alive must never run in the preview repo |

The workflow also has a **"Run workflow"** button (`workflow_dispatch`) with a `ref` field: you can put
any branch on the preview by hand, e.g. a `hotfix/*` branch or a `build/*` PR you want to see on the
phone. The next merge into `next` puts `next` back. The footer's sha always tells you what is there.

Security: the deploy key can write to **Citchen-preview only**. The job runs no code from the
branch (it copies files and edits three of them with `sed`/`jq`), so a manual `ref` can't run anything.

---

## 4. Setup session (Marcel + Claude, ~45 min)

Order matters; each step names where you click.

1. **Preview repository.** GitHub → New repository → `Citchen-preview`, **public**, "Add a README" ticked
   (so a `main` branch exists).
2. **Pages on it.** Citchen-preview → Settings → Pages → Source "Deploy from a branch", `main`, `/ (root)`.
   Custom domain: `next.citchen.de` → Save.
3. **DNS** at your `citchen.de` registrar: a `CNAME` record, name `next`, value `marcipane3.github.io.`
   (with or without the final dot, as the registrar wants). Takes minutes to a few hours.
4. **Verify the domain** (recommended, protects `*.citchen.de` against takeover): GitHub → your
   profile Settings → Pages → "Add a domain" → `citchen.de`, then the TXT record it shows.
5. **Deploy key.** On your computer:
   ```bash
   ssh-keygen -t ed25519 -N "" -C citchen-preview-deploy -f citchen-preview
   ```
   - `citchen-preview.pub` → Citchen-preview → Settings → Deploy keys → Add, **Allow write access** ✔.
   - `citchen-preview` (the private one) → **Citchen** → Settings → Secrets and variables → Actions →
     New repository secret `PREVIEW_DEPLOY_KEY`.
   - Delete both files afterwards. Never paste the private key into a chat.
6. **Google sign-in.** Google Cloud console → APIs & Services → Credentials → the OAuth client
   `977952120262-…` → Authorized JavaScript origins → add `https://next.citchen.de`.
   OAuth consent screen → if "Publishing status: Testing": Test users → add the test account (step 7).
7. **Test Google account** (a new free Gmail, or a spare one).
8. **Claude, in the same session:** one PR into `next` with the changes in §6 (workflow file, skill,
   docs). Merge it. The first run deploys `next`. Then, Citchen-preview → Settings → Pages →
   "Enforce HTTPS" ✔ once the certificate is ready.
9. **Phone:** open `https://next.citchen.de/v2/` → sign in with the **test account** → "Add to Home
   screen". The footer must read `Build … · preview <sha>`.

Done when: a merge into `next` updates the footer sha on the phone within ~2 minutes (close and reopen
the app once; the same "second open" rule as live applies).

---

## 5. Rules for testing on the preview

- **Google account:** use the test account. The preview runs the *unreleased* code; testing whether it
  damages a `rezepte.json` is exactly the point, so not on your real one. On the test account the app
  starts like a new user: it creates its own `rezepte.json` from the base recipes.
  *Exception you may choose:* a release that only changes UI can be checked with your real account.
  The checklist will say "real account ok" only when the diff doesn't touch `v2/src/data/`, `store.js`
  or `features/shopping/`.
- **Partner sharing** needs two accounts: share between the test account and a second test account, or
  keep that one item for the live check after the merge (the checklist marks it "after merge").
- **Friends link:** the preview talks to the **production** Supabase (there is only one). Creating a
  friends link there creates a real inbox. Only when the checklist asks, and turn it off afterwards
  (turning off deletes it on the server).
- **AI assistant:** the preview has its own settings, so enter your API key once more there. Calls are
  billed to you as usual.
- **Your live app is never touched:** different origin, so different database, settings and caches.

---

## 6. Changes in the setup PR (exact text, applied with Marcel)

These files are protected for agents (`policy.yml`), so they change only in the setup session.

**a) `.github/workflows/preview.yml`**: copy of [`preview/preview.yml`](preview/preview.yml), with the
draft header (first two comment lines) removed. Then delete `docs/process/preview/` and this file's
"draft" status line becomes "active since <date>".

**b) `.claude/skills/release-prep/SKILL.md`**, step 4, item 2 (release PR): before opening the PR,
wait for the preview of the release candidate:

> After the bump PR is merged, wait for the preview deploy of the new `next` HEAD (poll every 60 s,
> max 10 min):
> `gh api "$R/actions/workflows/preview.yml/runs?branch=next&event=push&per_page=1" --jq '.workflow_runs[0] | {head_sha, status, conclusion}'`
> until `head_sha` equals `git rev-parse origin/next` and `conclusion` is `success`. If it fails or
> times out, open the release PR anyway and write at the top of its body: "⚠ Preview deploy failed:
> test on live after merging, as before."

and in the release PR body, as the first section above the device checklist:

> **Test on the preview first:** open the *Preview* icon (`https://next.citchen.de/v2/`, after the
> V3 rename `/app/`), close and reopen once, and check the footer reads
> `Build <BUILD> · preview <first 7 chars of next HEAD>`. Run the checklist there with the test
> account. All green → merge. Anything red → comment here and don't merge.

Each checklist item gets one tag: none (preview), `real account ok`, or `after merge` (partner
sharing, anything that needs the live origin, e.g. the move helper from the old address).

**c) `docs/process/AGENT-PIPELINE.md`**: §5 table, new row
`| Citchen-preview (separate repo) | Copy of next on next.citchen.de, written only by the Preview workflow | Action with deploy key | — |`,
and in §6 the Marcel row: "(3) run the device test **on the preview**, then merge the release PR".

**d) `CLAUDE.md`**, "What this is": after the live URL add
"Preview of `next`: `https://next.citchen.de/v2/` (test account; see `docs/process/PREVIEW-NEXT.md`)."

---

## 7. Limits (what the preview can't show)

- **The move from the old address.** The move helper (#108) reads data on `marcipane3.github.io`.
  The preview is a different origin, so the actual move is checked only on live, after the switch
  release is merged. Everything else in that release (landing page, `/app/`, stubs on the new domain)
  can be checked on the preview.
- **Hotfixes** go `hotfix/*` → `main` directly. For one you can still use "Run workflow" with the
  hotfix branch before merging, if there is time.
- **Same backend.** Supabase and the Anthropic API are production services; the preview uses them for real (§5).
- **Not a second production.** No friends or testers on the preview; it changes with every merge.

---

## 8. Checked in this draft (2026-11-28)

The build step of `preview/preview.yml` was run against `origin/next` (`b372bbb`):

- The copy differs from `next` in exactly the five planned places (CNAME, robots.txt, `sw.js`,
  `version.js`, manifest); `.github/` is gone.
- In Chromium (Playwright), served at `/v2/`: the app boots without page errors, the worker installs
  `koch-v2.20-1-pb372bbb`, and `BUILD` reads `2026-11-28-v2.20 · preview b372bbb`.
- A simulated second deploy (new sha, same release): the new worker takes over and the old cache
  is deleted (only `koch-v2.20-1-pzzz9999` left).
- With an `app/` folder plus a stub `v2/sw.js` (layout after the V3 rename), the step picks `app/`.

Not checked here (needs the real setup): the push with the deploy key, Pages on the custom domain,
Google sign-in on `next.citchen.de`.

## 9. Turning it off

Delete `.github/workflows/preview.yml` (or disable it under Actions), remove the deploy key, and
archive Citchen-preview. Remove the `next` DNS record and the OAuth origin. Nothing in the app depends on it.
