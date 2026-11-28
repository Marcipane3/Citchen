// Tests: data/nutritionGoal.js + Speicherung in data/settings.js — M1 (#138).
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { GOAL_PRESETS, cleanGoal } from "../src/data/nutritionGoal.js";
import { getNutritionGoal, setNutritionGoal, resetNutritionGoal, getProfile, setProfile } from "../src/data/settings.js";
import { buildSystemPrompt } from "../src/ai/prompts.js";
import { DICT } from "../src/i18n.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

// Eigenes IndexedDB-Double (nur kv), falls noch keines installiert ist.
if (!globalThis.indexedDB) {
  const stores = new Map();
  const later = (fn) => setTimeout(fn, 0);
  const database = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n, { keyPath }) => { stores.set(n, { keyPath, rows: new Map() }); },
    transaction(name) {
      const st = stores.get(name); const t = {}; const reqs = [];
      const op = (fn) => { const r = {}; reqs.push(() => { r.result = fn(); r.onsuccess && r.onsuccess(); }); return r; };
      t.objectStore = () => ({
        get: (k) => op(() => { const v = st.rows.get(k); return v === undefined ? undefined : structuredClone(v); }),
        put: (v) => op(() => { st.rows.set(v[st.keyPath], structuredClone(v)); }),
        delete: (k) => op(() => { st.rows.delete(k); }),
      });
      later(() => { while (reqs.length) reqs.shift()(); t.oncomplete && t.oncomplete(); });
      return t;
    },
  };
  globalThis.indexedDB = { open() { const req = { result: database }; later(() => { req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess(); }); return req; } };
}

test("M1: GOAL_PRESETS — genau die sechs Voreinstellungen", () => {
  assertDeepEqual(GOAL_PRESETS, ["balanced", "highProtein", "lowCarb", "lowFat", "keto", "calorieAware"]);
});

test("M1: cleanGoal — gültige Eingabe bleibt unverändert", () => {
  assertDeepEqual(cleanGoal({ preset: "keto", dailyKcal: 2000, dailyProtein: 120 }), { preset: "keto", dailyKcal: 2000, dailyProtein: 120 });
});

test("M1: cleanGoal — unbekannte Voreinstellung → balanced", () => {
  for (const p of ["vegan", "", null, undefined, 3, "BALANCED"]) assertEqual(cleanGoal({ preset: p }).preset, "balanced");
  assertDeepEqual(cleanGoal(null), { preset: "balanced", dailyKcal: null, dailyProtein: null });
  assertDeepEqual(cleanGoal("x"), { preset: "balanced", dailyKcal: null, dailyProtein: null });
});

test("M1: cleanGoal — dailyKcal nur ganzzahlig 800–6000, sonst null", () => {
  assertEqual(cleanGoal({ dailyKcal: 800 }).dailyKcal, 800);
  assertEqual(cleanGoal({ dailyKcal: 6000 }).dailyKcal, 6000);
  assertEqual(cleanGoal({ dailyKcal: "2000" }).dailyKcal, 2000, "Zahl aus Eingabefeld (String)");
  for (const v of [799, 6001, 2000.5, "2000.5", "abc", "", null, NaN, Infinity, -1, {}]) assertEqual(cleanGoal({ dailyKcal: v }).dailyKcal, null, String(v));
});

test("M1: cleanGoal — dailyProtein nur ganzzahlig 10–400, sonst null", () => {
  assertEqual(cleanGoal({ dailyProtein: 10 }).dailyProtein, 10);
  assertEqual(cleanGoal({ dailyProtein: 400 }).dailyProtein, 400);
  for (const v of [9, 401, 80.5, "x", "", null, NaN, -5]) assertEqual(cleanGoal({ dailyProtein: v }).dailyProtein, null, String(v));
});

test("M1: set/getNutritionGoal — Round-Trip, Reset; Profil und Assistenten-Prompt unverändert", async () => {
  await resetNutritionGoal();
  assertDeepEqual(await getNutritionGoal(), { preset: "balanced", dailyKcal: null, dailyProtein: null });
  await setProfile({ level: "Profi" });
  const profileBefore = await getProfile();
  const args = { recipes: [], staples: ["Mehl"], profile: profileBefore };
  const promptBefore = buildSystemPrompt(args);
  await setNutritionGoal({ preset: "lowCarb", dailyKcal: "2000", dailyProtein: 90 });
  assertDeepEqual(await getNutritionGoal(), { preset: "lowCarb", dailyKcal: 2000, dailyProtein: 90 });
  assertDeepEqual(await getProfile(), profileBefore, "cookProfile unverändert");
  assertEqual(buildSystemPrompt({ ...args, profile: await getProfile() }), promptBefore, "Prompt byte-identisch");
  await resetNutritionGoal();
  assertDeepEqual(await getNutritionGoal(), { preset: "balanced", dailyKcal: null, dailyProtein: null });
});

test("M1: Ziel bleibt lokal — kein Sync-/Freunde-Code kennt es", () => {
  const files = ["sync.js", "syncCore.js", "syncRules.js", "listSync.js", "friendInbox.js", "recipeFile.js", "listFile.js"];
  for (const f of readdirSync(join(SRC, "data"))) {
    if (!files.includes(f)) continue;
    assert(!/nutritionGoal/i.test(readFileSync(join(SRC, "data", f), "utf8")), f + " erwähnt das Ziel nicht");
  }
});

test("M1: i18n — Ziel-Texte in DE/EN/ES/DA vollständig, ohne Abnehm-Wortwahl", () => {
  const BAD = /abnehmen|weight loss|diet plan|perder peso|vægttab/i;
  const keys = ["goalHeading", "goalNote", "goalPreset", "goalKcal", "goalProtein", "goalSave", "goalReset", "goalSaved", "goalResetDone"];
  for (const lang of ["de", "en", "es", "da"]) {
    const s = DICT[lang].settings;
    for (const k of keys) { assert(typeof s[k] === "string" && s[k].trim(), `${lang}.settings.${k}`); assert(!BAD.test(s[k]), `${lang}.${k} Wortwahl`); }
    for (const p of GOAL_PRESETS) { assert(typeof s.goalPresets[p] === "string" && s.goalPresets[p].trim(), `${lang}.goalPresets.${p}`); assert(!BAD.test(s.goalPresets[p]), `${lang}.${p} Wortwahl`); }
    assertEqual(Object.keys(s.goalPresets).length, GOAL_PRESETS.length, lang + " keine überzähligen Presets");
  }
});
