// Tests: ES-Modul-Syntax aller Dateien unter src/ (Boot-Wächter).
// Invariante: JEDES Modul unter src/ muss als ES-Modul parsen. Ein einziger
// Syntaxfehler reißt den kompletten Modulgraphen mit — der Browser rendert dann
// eine WEISSE SEITE ohne Login-Knopf, weil app.js nie ausgeführt wird.
//
// Diese Prüfung fand am 2026-08-05 das kaputte version.js: dort standen typo-
// grafische Anführungszeichen (U+201C/U+201D) als String-Begrenzer — hereingerutscht
// beim Einfügen von Changelog-Text aus einem Rich-Text-Editor.
//
// WARUM ein Kindprozess mit .mjs-Endung: `node --check datei.js` parst als
// CommonJS und meldet den Fehler NICHT (exit 0) — genau deshalb blieb der Bug
// unentdeckt. Erst mit .mjs-Endung parst Node als ES-Modul und schlägt an.
// Wir parsen nur (--check), führen also keinen Modul-Code aus: keine Seiteneffekte.
import { test, assert } from "./runner.js";
import { readdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, "..");

function listJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(p));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("jedes Modul unter src/ parst als ES-Modul (weiße Seite verhindern)", () => {
  const files = listJsFiles(join(v2, "src"));
  assert(files.length > 0, "keine src-Module gefunden — Pfad falsch?");

  const tmp = mkdtempSync(join(tmpdir(), "koch-syntax-"));
  const broken = [];
  try {
    for (const abs of files) {
      const rel = relative(v2, abs).split(sep).join("/");
      const probe = join(tmp, "probe.mjs");
      copyFileSync(abs, probe);
      try {
        execFileSync(process.execPath, ["--check", probe], { stdio: "pipe" });
      } catch (e) {
        const msg = String(e.stderr || e.message).split("\n").find((l) => l.includes("Error:")) || "Syntaxfehler";
        broken.push(`${rel}: ${msg.trim()}`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  assert(
    broken.length === 0,
    `Diese Module parsen nicht — die App startet damit NICHT (weiße Seite):\n  ${broken.join("\n  ")}`
  );
});
