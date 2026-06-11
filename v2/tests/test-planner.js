// Tests: planner/logic.js — Determinismus, Wochentags-/Wochenend-Regeln,
// Rotation, Küchen-Abwechslung, Locks, Reste-Tage. Gegen echte Daten.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { generatePlan, planRecipeIds, makeRng, seasonOf, mondayOf, DAYS, MEAL_CATEGORIES } from "../src/features/planner/logic.js";
import { getTotalMinutes } from "../src/data/derive.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(join(__dirname, "..", "data", "rezepte.snapshot.json"), "utf8")).recipes;
const byId = new Map(R.map((r) => [r.id, r]));
const WEEK = "2026-06-15"; // ein Montag im Sommer

test("generatePlan: 7 Tage Mo–So, alle Slots korrekt belegt", () => {
  const p = generatePlan(R, { weekOf: WEEK, seed: 42 });
  assertEqual(p.days.length, 7);
  assertDeepEqual(p.days.map((d) => d.day), DAYS);
  assertEqual(p.days[0].slot, "alltag");
  assertEqual(p.days[5].slot, "besonders");
  assertEqual(p.days[6].slot, "besonders");
  assert(p.days.every((d) => d.recipeId), "alle Tage gefüllt (105 Rezepte reichen)");
  assertEqual(p.id, "plan_" + WEEK);
});

test("generatePlan: deterministisch — gleicher Seed, gleicher Plan", () => {
  const a = generatePlan(R, { weekOf: WEEK, seed: 42 });
  const b = generatePlan(R, { weekOf: WEEK, seed: 42 });
  assertDeepEqual(a.days, b.days);
});

test("generatePlan: anderer Seed → (sehr wahrscheinlich) anderer Plan", () => {
  const a = generatePlan(R, { weekOf: WEEK, seed: 1 });
  const b = generatePlan(R, { weekOf: WEEK, seed: 99999 });
  assert(JSON.stringify(a.days) !== JSON.stringify(b.days));
});

test("generatePlan: nur Hauptgericht-Kategorien (kein Kuchen zum Abendessen)", () => {
  for (const seed of [1, 7, 42, 1234]) {
    const p = generatePlan(R, { weekOf: WEEK, seed });
    for (const d of p.days) {
      const r = byId.get(d.recipeId);
      assert(MEAL_CATEGORIES.includes(r.category), `${d.day}: ${r.name} (${r.category})`);
    }
  }
});

test("generatePlan: Wochentage bevorzugen alltag & ≤40 Min", () => {
  // Über mehrere Seeds: die große Mehrheit der Mo–Fr-Picks ist alltag und schnell
  let alltagCount = 0, fastCount = 0, total = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const p = generatePlan(R, { weekOf: WEEK, seed });
    for (const d of p.days.slice(0, 5)) {
      const r = byId.get(d.recipeId);
      total++;
      if (r.effort === "alltag") alltagCount++;
      const m = getTotalMinutes(r);
      if (m !== null && m <= 40) fastCount++;
    }
  }
  assert(alltagCount / total >= 0.8, `alltag-Quote zu niedrig: ${alltagCount}/${total}`);
  assert(fastCount / total >= 0.8, `Schnell-Quote zu niedrig: ${fastCount}/${total}`);
});

test("generatePlan: Wochenende bevorzugt besonders", () => {
  let count = 0, total = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const p = generatePlan(R, { weekOf: WEEK, seed });
    for (const d of p.days.slice(5)) {
      total++;
      if (byId.get(d.recipeId).effort === "besonders") count++;
    }
  }
  assert(count / total >= 0.8, `besonders-Quote: ${count}/${total}`);
});

test("generatePlan: keine Wiederholung innerhalb der Woche", () => {
  for (const seed of [1, 42, 777]) {
    const p = generatePlan(R, { weekOf: WEEK, seed });
    const ids = p.days.map((d) => d.recipeId);
    assertEqual(new Set(ids).size, ids.length, "doppeltes Rezept in der Woche");
  }
});

test("generatePlan: Rotation — avoidIds werden gemieden", () => {
  const first = generatePlan(R, { weekOf: WEEK, seed: 42 });
  const avoid = new Set(planRecipeIds(first));
  const second = generatePlan(R, { weekOf: "2026-06-22", seed: 42, avoidIds: avoid });
  for (const d of second.days) {
    assert(!avoid.has(d.recipeId), `${d.day}: Wiederholung aus Vorwoche`);
  }
});

test("generatePlan: keine Küche zweimal direkt hintereinander", () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    const p = generatePlan(R, { weekOf: WEEK, seed });
    for (let i = 1; i < 7; i++) {
      const a = byId.get(p.days[i - 1].recipeId).cuisine;
      const b = byId.get(p.days[i].recipeId).cuisine;
      if (a && b) assert(a !== b, `Seed ${seed}: ${a} an ${p.days[i - 1].day}+${p.days[i].day}`);
    }
  }
});

test("generatePlan: Saison — keine Winter-Rezepte im Sommer-Plan", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const p = generatePlan(R, { weekOf: WEEK, seed }); // Juni = Sommer
    for (const d of p.days) {
      const r = byId.get(d.recipeId);
      if (r.season) assert(r.season !== "Winter" && r.season !== "Herbst", `${r.name} (${r.season}) im Juni`);
    }
  }
});

test("generatePlan: Locks bleiben unangetastet", () => {
  const lockedEntry = { day: "Mi", recipeId: "r01", slot: "alltag", locked: true };
  const p = generatePlan(R, { weekOf: WEEK, seed: 5, locked: { "Mi": lockedEntry } });
  const mi = p.days.find((d) => d.day === "Mi");
  assertEqual(mi.recipeId, "r01");
  assert(mi.locked);
  // r01 darf nirgendwo sonst auftauchen
  assertEqual(p.days.filter((d) => d.recipeId === "r01").length, 1);
});

test("generatePlan: Reste-Tage — Di erbt Mo, Do erbt Mi (Meal-Prep)", () => {
  const p = generatePlan(R, { weekOf: WEEK, seed: 42, leftovers: true });
  const mo = p.days.find((d) => d.day === "Mo");
  const di = p.days.find((d) => d.day === "Di");
  const mi = p.days.find((d) => d.day === "Mi");
  const doo = p.days.find((d) => d.day === "Do");
  assert(byId.get(mo.recipeId).mealPrep, "Mo sollte Meal-Prep sein");
  assertEqual(di.recipeId, mo.recipeId);
  assertEqual(di.leftoverOf, "Mo");
  assertEqual(doo.recipeId, mi.recipeId);
  assertEqual(doo.leftoverOf, "Mi");
});

test("planRecipeIds: Reste-Tage zählen nicht doppelt", () => {
  const p = generatePlan(R, { weekOf: WEEK, seed: 42, leftovers: true });
  const ids = planRecipeIds(p);
  assertEqual(ids.length, 5); // Mo, Mi, Fr, Sa, So (Di+Do sind Reste)
  assertEqual(new Set(ids).size, 5);
});

test("generatePlan: winzige Sammlung — füllt ohne Crash, lockert Rotation", () => {
  const tiny = R.filter((r) => r.category === "Pasta & Nudeln"); // 7 Rezepte
  const p = generatePlan(tiny, { weekOf: WEEK, seed: 1, avoidIds: new Set(tiny.slice(0, 5).map((r) => r.id)) });
  assertEqual(p.days.length, 7);
  assert(p.days.every((d) => d.recipeId), "alle Tage trotz Avoid-Liste gefüllt");
});

test("makeRng: deterministisch und in [0,1)", () => {
  const a = makeRng(7), b = makeRng(7);
  for (let i = 0; i < 100; i++) {
    const x = a(), y = b();
    assertEqual(x, y);
    assert(x >= 0 && x < 1);
  }
});

test("seasonOf / mondayOf", () => {
  assertEqual(seasonOf("2026-06-15"), "Sommer");
  assertEqual(seasonOf("2026-12-01"), "Winter");
  assertEqual(seasonOf("2026-10-10"), "Herbst");
  assertEqual(mondayOf("2026-06-10"), "2026-06-08"); // Mittwoch → Montag davor
  assertEqual(mondayOf("2026-06-08"), "2026-06-08"); // Montag bleibt
});
