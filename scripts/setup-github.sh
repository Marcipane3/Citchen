#!/usr/bin/env bash
# One-time GitHub setup for the Citchen pipeline: labels, milestones, `next` branch.
# REST only, so it also runs inside a Claude Code cloud session ("run scripts/setup-github.sh").
# Idempotent: re-running updates labels and skips what exists.
set -euo pipefail
R=repos/Marcipane3/Citchen

label() { # name color description
  gh api -X POST "$R/labels" -f name="$1" -f color="$2" -f description="$3" >/dev/null 2>&1 \
    || gh api -X PATCH "$R/labels/$(printf %s "$1" | jq -sRr @uri)" -f color="$2" -f description="$3" >/dev/null
  echo "label  $1"
}

label "status:proposed"    "ededed" "Suggested (QA or Claude). Only Marcel moves it to planned."
label "status:planned"     "c5def5" "Approved by Marcel; refiner makes it ready."
label "status:needs-input" "fbca04" "Questions for Marcel in the comments. Reply 'ok' = accept defaults."
label "status:ready"       "0e8a16" "Meets the Definition of Ready; builder may take it."
label "status:in-progress" "1d76db" "Builder is working on it."
label "status:in-review"   "5319e7" "PR open, waiting for the reviewer."
label "status:merged"      "006b75" "Merged into next; ships with the next release."
label "status:blocked"     "b60205" "Builder could not finish; see comment."
for p in P0:b60205 P1:d93f0b P2:fbca04 P3:c2e0c6; do label "prio:${p%%:*}" "${p##*:}" "Priority (ROADMAP-V2 scale)"; done
label "size:S" "bfdadc" "< half a day"
label "size:M" "bfdadc" "half a day to 2 days — still one PR"
for t in feature bug chore spike epic; do label "type:$t" "d4c5f9" "Work item type"; done
label "risk:needs-human" "b60205" "Supabase, auth, secrets, deleting data or file-format change — built with Marcel."
for s in qa marcel field-report; do label "source:$s" "f9d0c4" "Where the item came from"; done
label "claude-build"      "0052cc" "PR opened by the Builder"
label "changes-requested" "e99695" "Reviewer asked for fixes; Builder fixes next night"
label "needs-human"       "b60205" "Agents stop; Marcel decides"
label "release"           "0e8a16" "Release PR next → main; Marcel merges = deploy"

milestone() { # title due(YYYY-MM-DD) description
  if gh api "$R/milestones?state=all&per_page=100" --jq '.[].title' | grep -qx "$1"; then echo "milestone $1 (exists)"; return; fi
  gh api -X POST "$R/milestones" -f title="$1" -f due_on="$2T23:59:59Z" -f description="$3" >/dev/null
  echo "milestone $1"
}
milestone "v2.18"  "2026-11-27" "Recipe export / import (G2)"
milestone "v2.19"  "2026-12-18" "Ingredient master + calories (R2, R3, L2, L3)"
milestone "v2.19b" "2027-01-22" "Structured recipe editor + capture (R4–R6)"
milestone "v2.20"  "2027-01-29" "Assistant edits recipes + editable instructions (G3, Q4)"
milestone "v2.21"  "2027-02-12" "Move helper + English (P5, P6, P8)"

if gh api "$R/branches/next" >/dev/null 2>&1; then
  echo "branch next (exists)"
else
  SHA=$(gh api "$R/git/ref/heads/main" --jq .object.sha)
  gh api -X POST "$R/git/refs" -f ref=refs/heads/next -f sha="$SHA" >/dev/null
  echo "branch next (created from main @ ${SHA:0:7})"
fi

cat <<'EOF'

Done. Now by hand in GitHub (needs admin, ~3 min):
  Settings → Rules → Rulesets → New branch ruleset, twice (target "main", then "next"):
    ✓ Restrict deletions   ✓ Block force pushes   ✓ Require a pull request (0 approvals)
    ✓ Require status checks: unit, e2e, policy   (add after CI has run once)
  Optional for main: ✓ Restrict updates with only you as bypass actor — a hard guarantee that only
  you can put code live, if agent PRs appear under the Claude app identity rather than your account.
EOF
