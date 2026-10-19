// previous-build.js — Holt den VORIGEN Release-Stand von /v2 aus der Git-Historie (für den
// Update-Test): der jüngste Commit, dessen BUILD-Stempel sich vom Arbeitsstand unterscheidet.
// Ohne Git/Historie (z. B. flacher Klon ohne den Commit): synthetischer Vorgänger = aktueller Stand
// mit geändertem BUILD und SW-CACHE. Das prüft dann nur den Update-Mechanismus, nicht die Daten-
// Kompatibilität zum echten Vorgänger — der Test vermerkt das als Annotation.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "./server.js";

const BUILD_RE = /BUILD\s*=\s*"([^"]+)"/;
const CACHE_RE = /const CACHE\s*=\s*"([^"]+)"/;

export function buildOf(dir) { return BUILD_RE.exec(readFileSync(join(dir, "v2/src/version.js"), "utf8"))[1]; }
export function cacheOf(dir) { return CACHE_RE.exec(readFileSync(join(dir, "v2/sw.js"), "utf8"))[1]; }

const git = (...args) => execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** → { root, build, cache, source: "git <sha>" | "synthetic" } — root enthält v2/ des Vorgängers. */
export function materializePreviousBuild() {
  const current = buildOf(REPO_ROOT);
  const root = mkdtempSync(join(tmpdir(), "koch-prev-"));
  try {
    for (const sha of git("log", "--format=%H", "-n", "30", "--", "v2/src/version.js").split("\n").filter(Boolean)) {
      const build = BUILD_RE.exec(git("show", `${sha}:v2/src/version.js`))?.[1];
      if (!build || build === current) continue;
      execFileSync("sh", ["-c", `git -C "${REPO_ROOT}" archive ${sha} v2 | tar -x -C "${root}"`]);
      return { root, build, cache: cacheOf(root), source: `git ${sha.slice(0, 7)}` };
    }
  } catch (e) { /* kein Git / flacher Klon → synthetisch */ }

  cpSync(join(REPO_ROOT, "v2"), join(root, "v2"), { recursive: true, filter: (p) => !p.includes(join("v2", "e2e")) });
  const prevBuild = current + "-e2e-prev";
  const prevCache = cacheOf(REPO_ROOT) + "-e2e-prev";
  const vf = join(root, "v2/src/version.js");
  writeFileSync(vf, readFileSync(vf, "utf8").replace(BUILD_RE, `BUILD = "${prevBuild}"`));
  const sf = join(root, "v2/sw.js");
  writeFileSync(sf, readFileSync(sf, "utf8").replace(CACHE_RE, `const CACHE = "${prevCache}"`));
  return { root, build: prevBuild, cache: prevCache, source: "synthetic" };
}
