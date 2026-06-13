// check-snapshots.mjs — Validiert die generierten Sprach-Snapshots gegen die
// deutsche Basis. Aufruf: node v2/tools/check-snapshots.mjs [da,es,en]
// Prüft: gleiche Anzahl+id+Reihenfolge, Schema-Gültigkeit (category-Enum!),
// Array-Längen + 🛒-Marker erhalten, wie viele Rezepte tatsächlich übersetzt sind.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateRecipe } from "../src/data/schema.js";
import { checkTranslation } from "../src/data/baseLang.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const LANGS = (process.argv[2] ? process.argv[2].split(",") : ["da", "es", "en"]).map((s) => s.trim());

const base = JSON.parse(readFileSync(join(DATA, "rezepte.snapshot.json"), "utf8"));
const baseById = new Map(base.recipes.map((r) => [r.id, r]));
console.log(`Basis: ${base.recipes.length} Rezepte\n`);

let totalProblems = 0;
for (const lang of LANGS) {
  const file = join(DATA, `rezepte.snapshot.${lang}.json`);
  if (!existsSync(file)) { console.log(`✗ ${lang}: Datei fehlt`); totalProblems++; continue; }
  const snap = JSON.parse(readFileSync(file, "utf8"));
  const probs = [];
  let translated = 0, fellBack = 0, schemaBad = 0, warned = 0;

  if (snap.recipes.length !== base.recipes.length) probs.push(`Anzahl ${snap.recipes.length}≠${base.recipes.length}`);

  for (let i = 0; i < snap.recipes.length; i++) {
    const r = snap.recipes[i];
    const b = baseById.get(r.id);
    if (!b) { probs.push(`unbekannte id ${r.id}`); continue; }
    if (base.recipes[i] && base.recipes[i].id !== r.id) probs.push(`Reihenfolge bei #${i}: ${r.id}≠${base.recipes[i].id}`);

    const v = validateRecipe(r);
    if (!v.valid) { schemaBad++; if (schemaBad <= 3) probs.push(`${r.id} Schema: ${v.errors.join("; ")}`); }
    if (b.category !== r.category) probs.push(`${r.id} category geändert: ${r.category}`);

    const warns = checkTranslation(b, { name: r.name, ingredients: r.ingredients, steps: r.steps, tips: r.tips });
    if (warns.length) { warned++; if (warned <= 5) probs.push(`${r.id} ⚠ ${warns.join(", ")}`); }

    if (r.name !== b.name) translated++; else fellBack++;
  }

  const ok = probs.length === 0 && schemaBad === 0;
  console.log(`${ok ? "✓" : "✗"} ${lang}: ${translated} übersetzt, ${fellBack} deutsch geblieben, ${schemaBad} Schema-Fehler, ${warned} Marker/Längen-Warnungen`);
  for (const p of probs.slice(0, 12)) console.log(`    · ${p}`);
  // Stichprobe r01
  const s = snap.recipes.find((r) => r.id === "r01");
  if (s) console.log(`    r01 → "${s.name}" | Zutat[1]: "${s.ingredients[1]}" | tips: "${(s.tips || "").slice(0, 70)}…"`);
  totalProblems += probs.length + schemaBad;
  console.log("");
}

console.log(totalProblems === 0 ? "ALLES SAUBER ✓" : `${totalProblems} Probleme — siehe oben`);
process.exit(totalProblems === 0 ? 0 : 1);
