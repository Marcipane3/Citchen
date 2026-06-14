// Tests: sw.js SHELL-Abdeckung (K4a). Invariante: JEDES ES-Modul unter src/ muss im
// Service-Worker-Precache (SHELL-Liste) stehen — sonst 404 bei frischer Offline-Installation
// und die App startet offline nicht. Diese Prüfung fand am 2026-06-14 das fehlende
// data/baseLang.js. Reiner Node-Test (fs + path), keine Abhängigkeiten, kein DOM.
import { test, assert } from "./runner.js";
import { readFileSync, readdirSync } from "node:fs";
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

test("sw.js SHELL listet jedes Modul unter src/ (Offline-Vollständigkeit)", () => {
  const sw = readFileSync(join(v2, "sw.js"), "utf8");
  const srcFiles = listJsFiles(join(v2, "src"));
  assert(srcFiles.length > 0, "keine src-Module gefunden — Pfad falsch?");

  const missing = srcFiles
    .map((abs) => "./" + relative(v2, abs).split(sep).join("/")) // → "./src/…"
    .filter((rel) => !sw.includes(rel));

  assert(
    missing.length === 0,
    `Diese Module fehlen in der sw.js SHELL-Liste (404 bei Offline-Install):\n  ${missing.join("\n  ")}`
  );
});
