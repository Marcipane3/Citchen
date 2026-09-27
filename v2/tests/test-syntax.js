// Tests: Syntax-Wächter. Invariante: JEDES ES-Modul unter v2/ (src/ + sw.js) muss parsen.
// Anlass (2026-09-27): version.js nutzte typografische Anführungszeichen („…“ U+201C/U+201D)
// als String-Begrenzer → SyntaxError beim Laden → die ganze Import-Kette brach, die Live-App
// zeigte nur den leeren Hintergrund. Kein anderer Test importierte version.js, daher blieb
// die Suite grün. Reiner Node-Test (node --check pro Datei), keine Abhängigkeiten, kein DOM.
import { test, assert } from "./runner.js";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, ".."); // …/v2

function listJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(p));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("Jedes Modul unter src/ und sw.js ist gültiges JavaScript (kein SyntaxError)", () => {
  const files = [...listJsFiles(join(v2, "src")), join(v2, "sw.js")];
  assert(files.length > 1, "keine Module gefunden — Pfad falsch?");

  const broken = [];
  for (const abs of files) {
    const res = spawnSync(process.execPath, ["--input-type=module", "--check"], {
      input: readFileSync(abs, "utf8"),
      encoding: "utf8",
    });
    if (res.status !== 0) {
      const msg = (res.stderr || "").split("\n").find((l) => l.includes("Error")) || "SyntaxError";
      broken.push(`${relative(v2, abs).split(sep).join("/")}: ${msg.trim()}`);
    }
  }
  assert(broken.length === 0, "Module mit Syntaxfehler:\n  " + broken.join("\n  "));
});
