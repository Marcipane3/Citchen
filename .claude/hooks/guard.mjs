// PreToolUse guard for Bash — backs up the deny list with pattern checks the glob syntax can't express.
// Exit 2 = block the command and show the reason to Claude. Runs on Windows and in the cloud (node only).
import { readFileSync } from "node:fs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
const cmd = String(input?.tool_input?.command ?? "");

// A protected branch as a whole push target: preceded by a space, ":" (HEAD:next), "+" (force refspec)
// or "refs/heads/", and followed by the end of the argument. So `build/31-skip-to-next` stays allowed.
const REF = String.raw`(?:\s|:|\+|refs\/heads\/)(?:main|next)(?=\s|$|[;|&)])`;
const PUSH = String.raw`\bgit\s+push\b[^|;&]*`;

const rules = [
  [new RegExp(String.raw`${PUSH}\s(--force\b|-f\b|--force-with-lease\b|\+\S)`), "Force pushes are not allowed."],
  [new RegExp(String.raw`${PUSH}(?:--delete|-d)\b[^|;&]*${REF}|${PUSH}\s:(?:main|next)(?=\s|$|[;|&)])`), "Deleting main/next is not allowed."],
  [new RegExp(PUSH + REF), "Never push to main or next — open a PR (main = production, next = integration)."],
  [/\bgh\s+api\b[^|;&]*(-X\s*DELETE|--method\s+DELETE)[^|;&]*\/git\/refs\/heads\/(main|next)\b/, "Deleting main/next is not allowed."],
  [/\bsupabase\s+(db|migration|link|projects)\b/, "The Supabase CLI is off-limits for agents — migrations are applied by Marcel."],
];

for (const [re, msg] of rules) {
  if (re.test(cmd)) { console.error(`Blocked by .claude/hooks/guard.mjs: ${msg}`); process.exit(2); }
}

// Note: a hook cannot see a PR's base branch, so "never merge into main" is enforced by the skills,
// the CI `policy` job and the rulesets on main/next.
process.exit(0);
