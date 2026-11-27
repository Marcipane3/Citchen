# ADR C-20 / H-1 — Hosting and URL layout: `citchen.de` landing, app at `/app/`, redirects from the old address

- **Status:** proposed (2026-11-27) · accepted when Marcel confirms the defaults under "Not decided here"
- **Owner:** Marcel · written by Claude Code
- **Related:** `ROADMAP-V3.md` §2 (domain switch), slice 1, H-1, C7, C-20; `docs/v3/03-QUESTIONS.md` C-5, C-8, C-20;
  `docs/v3/05-RISKS-MIGRATION.md` R13; `docs/v3/adr/ADR-D9-supabase-backend.md` (hosting / Vercel notes);
  #108 (move helper, `v2/src/data/moveFile.js`, `v2/src/features/settings/move.js`);
  #135 (same-origin isolation, `v2/tests/test-origin-isolation.js`); QA AR-05 (CSP)

## Context

Decided already: same repository, move helper first (C-20); domain `citchen.de` (C7); landing at `/`, app at
`/app/` (H-1); switch on **Sat 5 Dec 2026**.

GitHub Pages can only serve static files. Setting a custom domain on this repository moves the **whole**
`marcipane3.github.io/Citchen/…` site (v1, v2, `add.html`) to `citchen.de/…`, and GitHub then answers the old
address with a **301** that keeps the path (`/Citchen/v2/x` → `citchen.de/v2/x`). Two facts shape everything below:

1. **Browser storage belongs to the origin.** `marcipane3.github.io` and `citchen.de` are different origins:
   IndexedDB, localStorage and Cache Storage do not follow the redirect. Drive data (recipes, shopping list) is
   safe; local-only data is not (R13). Hence the move helper (#108) on 2 Dec.
2. **Pages has no server-side redirect rules.** Anything that must change path (`/v2/…` → `/app/…`) needs a small
   stub HTML page at the old path that redirects in the browser. The 301 from the old host to the new host is done
   by GitHub itself.

Also today: the repository root is v1 (`index.html`, `sw.js`, `manifest.json`); v2 lives in `v2/` and is served at
`/Citchen/v2/`. There is no Pages workflow in `.github/workflows/` (only `ci.yml`, `policy.yml`,
`supabase-keepalive.yml`): Pages publishes the `main` branch as it is. So a folder called `app/` must exist in the
repository, or a build step must create it.

## Decision

### 1. Layout on `citchen.de`

| Path | Content | Source in repository |
|---|---|---|
| `/` | Landing page + privacy policy links (4 languages) | new `index.html` at the root (replaces v1, which is archived with tag `v1-final`) |
| `/privacy/` (+ `/privacy/de/`, `/en/`, `/es/`, `/da/` or one page with language switch) | Privacy policy, needed for C-8 | new, slice 1 |
| `/app/` | The PWA (today `v2/`) | **rename `v2/` → `app/`** in slice 1 (see "Open points", point 1) |
| `/app/add.html` | Friends page (no app, no account) | `v2/add.html` |
| `/v2/…`, `/add.html`-style old links | Stub pages, redirect to `/app/…` | new stubs, see §2 |
| `/CNAME` | `citchen.de` | written by GitHub when the domain is set |

### 2. Every URL the old address serves today → new address

"Old address" = `https://marcipane3.github.io/Citchen/`. Each row names the file the URL comes from.

| # | Old URL | Comes from | New URL | How the old one redirects |
|---|---|---|---|---|
| 1 | `/Citchen/` and `/Citchen/index.html` (v1 app) | root `index.html` | `citchen.de/` (landing) | GitHub 301 to `citchen.de/`. v1 is retired; the landing page links to `/app/` |
| 2 | `/Citchen/manifest.json`, `icon-192.png`, `icon-512.png`, `sw.js` (v1) | root `manifest.json`, `sw.js`, icons | none (v1 archived) | GitHub 301 only. v1's service worker (scope `/Citchen/`, caches `kochbuch-*`) is never re-registered on the new origin |
| 3 | `/Citchen/v2/` and `/Citchen/v2/index.html` (the PWA; also the installed home-screen icon's start URL) | `v2/index.html`; `v2/manifest.webmanifest` `start_url: "./"` | `citchen.de/app/` | GitHub 301 to `citchen.de/v2/`, which is a **stub** (`v2/index.html`) → `location.replace("/app/" + search + hash)` |
| 4 | `/Citchen/v2/add.html#k=<token>` (friends link; token is in `#`, set by `inviteUrl()` in `v2/src/features/shopping/friendMerge.js`, built from `linkFor()` in `v2/src/data/friendInbox.js`) | `v2/add.html` | `citchen.de/app/add.html#k=<token>` | 301 to `citchen.de/v2/add.html#k=…` (browsers keep the fragment through a redirect), then **stub** `v2/add.html` → `location.replace("/app/add.html" + location.search + location.hash)` |
| 5 | `/Citchen/v2/manifest.webmanifest` | `v2/manifest.webmanifest` | `citchen.de/app/manifest.webmanifest` | none needed (only fetched by the page); no stub |
| 6 | `/Citchen/v2/icon-192.png`, `icon-512.png` | `v2/` | `/app/icon-*.png` | no stub |
| 7 | `/Citchen/v2/sw.js` (scope `/Citchen/v2/`; cache `koch-v2.19-1` prefix `koch-v2`) | `v2/sw.js` | `/app/sw.js` (scope `/app/`) | **The stub must not be controlled by the old worker's cache** — see §3. A `/v2/sw.js` file is kept as a **self-unregistering** worker (installs, `registration.unregister()`, deletes `koch-v2*` caches); this matters only for browsers that open the old address after the switch, which GitHub already redirects, so it is a belt-and-braces item |
| 8 | `/Citchen/v2/src/**/*.js` (≈ 75 files, list = `SHELL` in `v2/sw.js`), `styles/{tokens,base,app}.css`, `data/rezepte.snapshot{,.da,.es,.en}.json`, `data/ingredients.json` | `SHELL` in `v2/sw.js` | same relative paths under `/app/` | no stubs. Nothing outside the app links to them |
| 9 | `/Citchen/v2/data/*`, `docs`, `tests`, `e2e`, `tools` | `v2/` | `/app/…` | no stubs; dev folders are not linked. **Open point 3:** stop publishing `tests/`, `e2e/`, `tools/` |
| 10 | `/Citchen/rezepte.seed.json`, `*.md` (README, ROADMAP…, SCHEMA) | repository root | served at `citchen.de/…` as files unless removed | no stubs. **Open point 4:** root Markdown is not a product; keep it private-ish by not linking it |
| 11 | Google OAuth / Drive picker (no URL on our side) | `v2/src/data/drive.js` | origin `https://citchen.de` | origin must be registered (§5) |

Stub pages needed (3 files, each ~10 lines, no JS beyond one redirect, plus a `<noscript><a href>` fallback and
`<meta name="robots" content="noindex">`):

- `v2/index.html` → `/app/` (keeps `search` and `hash`)
- `v2/add.html` → `/app/add.html` (keeps `search` and `hash`; the token is only in the hash)
- `v2/sw.js` → self-unregister worker (see row 7)

The stubs cannot live in the same folder as the real app if `v2/` is renamed to `app/`. After the rename, `v2/`
contains **only** the three stubs. The old `v2/` content disappears from the repository in the same PR.

### 3. Same-origin isolation across old and new origin (#135, C-5) and what the move helper must still do

**On the new origin `citchen.de` v1, v2 and v3 would share one origin**, exactly the situation #135 prepared for
(`docs/v3/03-QUESTIONS.md` C-5, enforced by `v2/tests/test-origin-isolation.js`):

- Cache Storage prefixes: `kochbuch-` (v1, root `sw.js`), `koch-v2` (v2, `v2/sw.js`), reserved `citchen-v3`.
  Each worker deletes only caches with its own prefix on activate.
- IndexedDB: v2 uses `koch-v2` (`v2/src/data/db.js`); v3 must use a `citchen-v3*` name.
- localStorage: v1 uses `kb_*`; v2/v3 never reuse `kb_`.
- Service-worker scopes: `/` is the landing page (no worker), `/app/` is the app. The v1 scope `/Citchen/` and the
  v2 scope `/Citchen/v2/` exist only on the **old** origin.

What changes with this ADR, and must not contradict #135:

1. After the switch there is **one** app at `/app/`; v1 is gone. The `kochbuch-` prefix is no longer produced on
   `citchen.de`, but the rule "each worker deletes only its own prefix" stays, so no cleanup on the new origin may
   use "everything except `CACHE`".
2. Renaming `v2/` to `app/` changes the **scope** (`/app/`) but **not the names**: the DB stays `koch-v2` and the
   cache prefix stays `koch-v2` for the whole v3.0 line. Renaming either would orphan stored data and is a separate
   decision (open point 2). `test-origin-isolation.js` has to keep asserting these names after the rename.
3. The new origin starts **empty**: no IndexedDB, no localStorage, no caches. First load = onboarding + Drive
   sign-in, then the move-file import.

What the move helper (#108) must still do **on the old origin** (everything below is already built; this lists what
must stay true until the switch and what it must not do after):

- **Until 4 Dec (inclusive), the old origin serves the real app** with the export button (Settings → Move). The
  switch day is the moment it stops being reachable, so the export window is 2–5 Dec as in `ROADMAP-V3.md`.
- Export covers the allow-list `ENTRIES` in `v2/src/data/moveFile.js` (stock, fridge, profile, settings, friends
  owner token, AI usage, unsynced shopping rows) and **never** `kochv2_apikey`, `kochv2_token`, `kochv2_connected`,
  `koch.supabase`, nor recipes (Drive carries them; sync before exporting).
- **After the switch nobody can export any more.** GitHub redirects every old URL, so there is no page left on
  `marcipane3.github.io` that can read the old origin's storage. Consequence for the checklist: the switch PR is not
  merged before Marcel and the partner confirm their export file exists.
- Optional safety net (open point 5): keep the old origin readable for a short time by serving the app from
  `marcipane3.github.io` through a second repository. Rejected as default, because it contradicts C-20 ("same
  repository").
- The import on the new origin follows the rules in `moveFile.js` (fill empty stores; ask before replacing; shopping
  list and AI usage are merged losslessly). The friends owner token moves with the file, so a friends link keeps
  working after the move; its URL must be re-derived on the new origin (`linkFor()` uses `import.meta.url`, so it
  produces `https://citchen.de/app/add.html#k=…` automatically, nothing to store).
- **Old friends links** (`…/Citchen/v2/add.html#k=…`, already sent to friends) keep working through row 4 as long as
  the stub exists. Keep the stub **at least until the friends link is re-shared** (≥ 6 months). The token never goes
  to a server (it is in the `#` part), so the redirect leaks nothing.

### 4. Hosting for v3.0

Recommendation: **GitHub Pages behind the custom domain** (free, same repository, already working, deploy = merge to
`main`, rollback = revert).

| Option | Cost | For | Against |
|---|---|---|---|
| **GitHub Pages + custom domain** *(recommended)* | €0 (domain ≈ €10/year, already bought) | zero new accounts; matches C-20; HTTPS certificate automatic; fits "cheap, no money" | no response headers → **CSP only via `<meta>`** (no `frame-ancestors`, no `report-uri`); no server redirects (stubs needed); repository must stay public for the free plan; soft bandwidth limit (100 GB/month) is far above need |
| Cloudflare Pages | €0 | real `_headers` (CSP with `frame-ancestors`), `_redirects` (clean 301 for `/v2/*` → `/app/:splat`, no stubs), preview deploys | new account and build config; a second place to debug; DNS must move to Cloudflare or use CNAME setup |
| Vercel Hobby | €0 but **non-commercial personal use only**; Pro $20/user/month | headers/redirects, functions | as noted in `ADR-D9` and `ROADMAP-V3.md` §6: little benefit for a static PWA, and a public store listing with a developer name is a grey zone. Only if a function appears that Supabase cannot host (e.g. a later AI proxy, v3.5) |

**Move to Cloudflare Pages when** a header-level control is needed (e.g. `frame-ancestors`, CSP reporting) or the
stubs prove to be a problem. Moving is cheap because the app is static and the layout above is host-neutral: the
only host-specific parts are the stubs (replaced by one `_redirects` line) and the CSP carrier (`<meta>` →
`_headers`).

### 5. Slice-1 consequences: CSP (AR-05) and Google OAuth (C-8)

**Content-Security-Policy**, delivered as `<meta http-equiv="Content-Security-Policy">` in `app/index.html` and
`app/add.html` (GitHub Pages cannot send headers). Origins the app really talks to today, taken from the code:

| Directive | Origins | Reason (file) |
|---|---|---|
| `default-src` | `'self'` | |
| `script-src` | `'self'` `https://accounts.google.com` `https://apis.google.com` | Google Identity Services (`v2/src/data/drive.js:75`), `api.js` for the Picker (`:231`). No inline script; this is the invariant "no third-party scripts" with exactly these two exceptions |
| `connect-src` | `'self'` `https://www.googleapis.com` `https://accounts.google.com` `https://api.anthropic.com` `https://wbvhgeqdixrcfeszsiob.supabase.co` | Drive REST (`drive.js`), token flow, BYOK AI (`v2/src/ai/client.js`), friends inbox (`v2/src/data/supabase.js`) |
| `style-src` | `'self'` `https://fonts.googleapis.com` `'unsafe-inline'` until inline `style=` attributes in the UI code are gone | Fraunces/Karla CSS; the app sets many `style="…"` attributes (e.g. `move.js`) |
| `font-src` | `https://fonts.gstatic.com` | |
| `img-src` | `'self'` `data:` `blob:` + any Drive/photo host once C-21 lands | recipe photos are data URLs today |
| `frame-src` | `https://accounts.google.com` `https://docs.google.com` | sign-in popup / Picker iframe |
| `object-src` / `base-uri` / `form-action` | `'none'` / `'self'` / `'self'` | |

`frame-ancestors` is ignored in `<meta>`; clickjacking protection stays a reason to move to Cloudflare later.
The Supabase URL is a **single** origin on purpose (no `*.supabase.co` wildcard); `koch.supabase` (dev switch) is
refused by the CSP on production, which is intended. A slice-1 test must read the policy from the HTML and fail if
`drive.js`, `client.js` or `supabase.js` call a host that is not listed.

**Google OAuth (C-8)** for client `977952120262-lht1tbbinnj8kmehmvqe1dpu5gp7k8d8.apps.googleusercontent.com` (public by design):

- *Authorized JavaScript origins*: `https://citchen.de` (add), keep `https://marcipane3.github.io` until the move
  window has closed (remove after ~2 weeks). `www.citchen.de` only if `www` is served (open point 6).
- *Authorized redirect URIs*: none (GIS token model, popup); add nothing.
- *Authorised domains* on the consent screen: `citchen.de`. Also `supabase.co` is not needed (no Google login there).
- *Home page* `https://citchen.de/`, *privacy policy* `https://citchen.de/privacy/`, support e-mail on the domain (C-26).
- *Domain verification* in Google Search Console: DNS TXT record for `citchen.de` (DNS verification covers all
  paths). Scope stays `drive.file` (non-sensitive), plus the Picker.
- Every browser must sign in again on the new origin (tokens are per origin; `kochv2_token` is deliberately not in
  the move file).

### DNS records to add (checklist, needs Marcel's DNS access)

- [ ] GitHub verified domain: `TXT _github-pages-challenge-Marcipane3.citchen.de` = value shown in GitHub (Settings →
      Pages → Add a verified domain). Do this **before** the switch day, it does not change anything for users.
- [ ] `A citchen.de` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- [ ] `AAAA citchen.de` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
- [ ] `CNAME www.citchen.de` → `marcipane3.github.io` (optional, see open point 6)
- [ ] Google Search Console: `TXT citchen.de` = value shown there (C-8)
- [ ] E-mail forwarding for the support address (C-26): `MX` records of the forwarding service
- [ ] Do **not** enable the custom domain in repository Settings → Pages until the switch PR is merged and the export
      window has closed (4 Dec evening). *Enforce HTTPS* comes on after the certificate is issued (can take up to an hour).

(Verify the IP addresses against GitHub's current documentation on the day; they are written from memory of the
public docs and not checked from this environment.)

## Consequences

- The switch is one PR plus one Settings click: PR (rename `v2/` → `app/`, stubs, landing page, CSP, privacy page,
  version/cache bump by release prep) and "Custom domain" in Pages. Rollback = remove the custom domain (the old
  address works again immediately) + revert the PR.
- The `app/` rename touches: `README.md`, `CLAUDE.md` (map and run commands), `.github/workflows/ci.yml`,
  `policy.yml`, `v2/e2e` base URL, the test imports, QA docs. Agent PRs may not edit `.github/` or `CLAUDE.md`, so
  slice 1 is built **with Marcel in an interactive session**, not by the nightly builder.
- Because `start_url` and `scope` are relative (`./`), the manifest needs no change for the new path; the app's
  `id` is `./` and becomes `https://citchen.de/app/`, a **different app identity**: existing home-screen
  installs on the old address are not updated, users install again (the move helper already requires this visit).
- Old friends links keep working through the stubs; old bookmarks of `/Citchen/v2/` land in the app.
- No server-side secrets, no new third-party script, no cost.

## Not decided here (with suggested defaults)

1. **Rename `v2/` → `app/` or build `app/` from `v2/`.** Default: rename once, because there is no build step by
   design (CLAUDE.md). The cost is the path updates listed in Consequences.
2. **Rename the IndexedDB / cache prefix `koch-v2` to `citchen-v3`.** Default: **no**, keep `koch-v2` for the whole
   v3.0 line (no data move on top of the domain move). Revisit with format 4 (v3.1).
3. **Publish `v2/tests`, `e2e`, `tools` on the domain.** Default: move them out of the served folder in the rename
   (e.g. `tests/` at repository level) so only app files are served.
4. **Root Markdown files and `rezepte.seed.json` on `citchen.de`.** Default: leave them (harmless, no secrets per
   CLAUDE.md rule 7), do not link them; clean up in a later chore.
5. **Keep the old origin readable after the switch.** Default: no. Mitigation is the export window and a "no switch
   before both exports exist" rule in the release checklist.
6. **`www.citchen.de`.** Default: serve it with a CNAME so that GitHub redirects `www` → apex; register only
   `https://citchen.de` as OAuth origin.
7. **Landing page technology.** Default: one hand-written static HTML file per language, no framework.
8. **Time the stubs stay.** Default: ≥ 6 months for `v2/add.html`, 3 months for `v2/index.html`.
9. **Cloudflare Pages.** Default: not now; revisit when a header-level control is needed.
