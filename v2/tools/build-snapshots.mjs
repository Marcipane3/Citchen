// build-snapshots.mjs — EINMAL-Generator für übersetzte Basis-Rezept-Snapshots (B2).
//
// Liest die kanonische deutsche data/rezepte.snapshot.json und erzeugt pro Sprache
// data/rezepte.snapshot.<lang>.json. Übersetzt werden NUR name/ingredients/steps/tips
// über die Anthropic-API; id, category (DE-Enum), time, servings, 🛒-Marker und die
// Tipp-Schlüsselwörter (Topping:/Swap:/Alltags-Upgrade:/Technik:) bleiben erhalten.
//
// Aufruf (PowerShell):
//   $env:ANTHROPIC_API_KEY = "sk-ant-…"
//   node v2/tools/build-snapshots.mjs            # alle: da, es, en
//   node v2/tools/build-snapshots.mjs da         # nur Dänisch
//   $env:MODEL = "claude-haiku-4-5"; node v2/tools/build-snapshots.mjs   # günstiger
//
// Der Schlüssel verlässt deinen Rechner nicht (nur Aufruf an api.anthropic.com).
// Ein Cache (tools/.translation-cache.json) macht Wiederholungen billig & resumebar.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { overlayTranslation, checkTranslation } from "../src/data/baseLang.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const CACHE_FILE = join(__dirname, ".translation-cache.json");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-4-6";
const LANG_NAMES = { da: "Danish (Dansk)", es: "Spanish (Español)", en: "English" };
const LANGS = (process.argv[2] ? process.argv[2].split(",") : ["da", "es", "en"]).map((s) => s.trim());
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);

if (!API_KEY) {
  console.error("✗ ANTHROPIC_API_KEY ist nicht gesetzt. In PowerShell:\n    $env:ANTHROPIC_API_KEY = \"sk-ant-…\"");
  process.exit(1);
}

const SYSTEM = (langName) => `You translate German home-cooking recipes into ${langName}.
Return ONLY a JSON object with keys: name (string), ingredients (string[]), steps (string[]), tips (string).
STRICT RULES — follow exactly:
1. Translate naturally for a home cook in ${langName}.
2. Preserve every 🛒 emoji EXACTLY, attached to the SAME ingredient item it marks.
3. Keep arrays the SAME length and order as the input (steps must map 1:1).
4. In "tips", keep the literal label keywords "Topping:", "Swap:", "Alltags-Upgrade:" and "Technik:" UNCHANGED (do NOT translate these specific words). Translate only the text that follows each keyword.
5. Ingredient group prefixes (e.g. "Teig:", "Belag:", "Streusel:") must stay a SINGLE capitalized word followed by a colon. You may translate the word but it must remain one word with no spaces.
6. Do NOT translate quantities or unit abbreviations (g, ml, TL, EL, °C, Min, cm). Keep all numbers as-is.
7. Output JSON only — no prose, no code fences.`;

function srcOf(r) {
  return { name: r.name, ingredients: r.ingredients || [], steps: r.steps || [], tips: r.tips || "" };
}
function hash(obj) {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
function extractJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
function saveCache() { writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0)); }

async function translateOne(lang, recipe) {
  const src = srcOf(recipe);
  const key = `${lang}:${recipe.id}:${hash(src)}`;
  if (cache[key]) return cache[key];

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 2000, system: SYSTEM(LANG_NAMES[lang] || lang),
          messages: [{ role: "user", content: JSON.stringify(src) }],
        }),
      });
      if (res.status === 429 || res.status === 529) { await sleep(1500 * attempt); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const tr = extractJson(data.content?.[0]?.text || "");
      if (!tr) throw new Error("keine JSON-Antwort");
      const warns = checkTranslation(recipe, tr);
      if (warns.length) console.warn(`  ⚠ ${recipe.id} (${lang}): ${warns.join(", ")}`);
      cache[key] = tr;
      return tr;
    } catch (e) {
      if (attempt === 4) { console.error(`  ✗ ${recipe.id} (${lang}) nach 4 Versuchen: ${e.message}`); return null; }
      await sleep(1000 * attempt);
    }
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function buildLang(lang, base) {
  console.log(`\n→ ${lang} (${LANG_NAMES[lang]}) · Modell ${MODEL}`);
  let done = 0;
  const translated = await pool(base.recipes, CONCURRENCY, async (r) => {
    const tr = await translateOne(lang, r);
    done++;
    if (done % 10 === 0 || done === base.recipes.length) { process.stdout.write(`  ${done}/${base.recipes.length}\r`); saveCache(); }
    return overlayTranslation(r, tr); // tr=null → deutsches Original (graceful)
  });
  const out = { version: base.version, updated: base.updated, recipes: translated };
  const file = join(DATA, `rezepte.snapshot.${lang}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  saveCache();
  console.log(`\n  ✓ geschrieben: data/rezepte.snapshot.${lang}.json`);
}

(async () => {
  const base = JSON.parse(readFileSync(join(DATA, "rezepte.snapshot.json"), "utf8"));
  console.log(`Basis: ${base.recipes.length} Rezepte · Sprachen: ${LANGS.join(", ")}`);
  for (const lang of LANGS) {
    if (!LANG_NAMES[lang]) { console.warn(`Überspringe unbekannte Sprache: ${lang}`); continue; }
    await buildLang(lang, base);
  }
  console.log("\nFertig. Snapshots liegen in v2/data/ — danach committen & deployen.");
})();
