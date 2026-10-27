// Tests: data/recipeMerge.js — die reine Logik hinter dem sicheren Rezept-Sync (v2.15.1, T1/T2/T12).
// Ersetzt test-decide-sync.js: die Datei-weite Last-Write-Wins-Entscheidung gibt es nicht mehr.
// Zwei-Geräte- und Projekt-Claude-Szenarien mit dem echten Sync-Kern stehen in test-sync-core.js.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { stableStringify, same, fingerprint, checkInbound, mergeRecipes, isMassDelete } from "../src/data/recipeMerge.js";

const R = (id, extra = {}) => ({ id, name: "Rezept " + id, category: "Vegetarische Hauptgerichte", ...extra });
const ids = (list) => list.map((r) => r.id);

test("stableStringify: Feld-Reihenfolge egal, undefined-Felder zählen nicht", () => {
  assertEqual(stableStringify({ a: 1, b: [1, { y: 2, x: 1 }] }), stableStringify({ b: [1, { x: 1, y: 2 }], a: 1 }));
  assert(same({ a: 1, b: undefined }, { a: 1 }));
  assert(!same([1, 2], [2, 1]), "Array-Reihenfolge zählt (Schritte!)");
});

test("fingerprint: gleich für gleichen Inhalt, verschieden sonst", () => {
  assertEqual(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert(fingerprint("{}") !== fingerprint('{"recipes":{}}'));
});

test("mergeRecipes: nur Drive geändert → Drive · nur lokal geändert → lokal · pro Feld", () => {
  const base = [R("a", { tips: "", favorite: false })];
  const local = [R("a", { tips: "", favorite: true })];
  const remote = [R("a", { tips: "Claude", favorite: false })];
  const m = mergeRecipes({ base, local, remote });
  assertDeepEqual([m.recipes[0].tips, m.recipes[0].favorite], ["Claude", true]);
  assertDeepEqual(m.conflicts, []);
});

test("mergeRecipes: beide ändern dasselbe Feld → lokal gewinnt, als Konflikt gemeldet", () => {
  const m = mergeRecipes({ base: [R("a", { tips: "alt" })], local: [R("a", { tips: "App" })], remote: [R("a", { tips: "Claude" })] });
  assertEqual(m.recipes[0].tips, "App");
  assertDeepEqual(m.conflicts, [{ id: "a", fields: ["tips"] }]);
});

test("mergeRecipes: ein Feld auf einer Seite entfernt → bleibt entfernt", () => {
  const m = mergeRecipes({ base: [R("a", { cuisine: "Indisch" })], local: [R("a", { cuisine: "Indisch" })], remote: [R("a")] });
  assertEqual("cuisine" in m.recipes[0], false);
});

test("mergeRecipes: Löschen nur, wenn die andere Seite nicht geändert hat", () => {
  const base = [R("a"), R("b"), R("c"), R("d")];
  const local = [R("a"), R("b", { rating: 5 }), R("d")];            // lokal: c gelöscht, b bewertet
  const remote = [R("a"), R("c", { tips: "Claude" })];              // Drive: b + d gelöscht, c geändert
  const m = mergeRecipes({ base, local, remote });
  assertDeepEqual(ids(m.recipes).sort(), ["a", "b", "c"], "b (lokal geändert) + c (Drive geändert) bleiben, d weg");
  assertDeepEqual(m.removed, ["d"]);
  assertDeepEqual(m.added, ["c"]);
});

test("mergeRecipes: neue Rezepte beider Seiten kommen dazu; neue lokale stehen vorn", () => {
  const m = mergeRecipes({ base: [R("a")], local: [R("n"), R("a")], remote: [R("a"), R("claude")] });
  assertDeepEqual(ids(m.recipes), ["n", "a", "claude"]);
});

test("mergeRecipes ohne Basis: Vereinigung, nichts wird gelöscht, bei Unterschied lokal", () => {
  const m = mergeRecipes({ base: null, local: [R("a", { tips: "App" }), R("l")], remote: [R("a", { tips: "Drive" }), R("r")] });
  assertDeepEqual(ids(m.recipes).sort(), ["a", "l", "r"]);
  assertEqual(m.recipes.find((r) => r.id === "a").tips, "App");
  assertDeepEqual(m.removed, []);
});

test("mergeRecipes: nichts geändert → identisch zu lokal", () => {
  const list = [R("a"), R("b")];
  const m = mergeRecipes({ base: list, local: structuredClone(list), remote: structuredClone(list) });
  assert(same(m.recipes, list));
});

test("checkInbound: strukturell kaputt → ok:false (lokal wird nicht angefasst)", () => {
  for (const bad of [null, undefined, [], "x", {}, { recipes: null }, { recipes: {} }, { Rezepte: [] }]) {
    assertEqual(checkInbound(bad).ok, false, JSON.stringify(bad));
  }
  assertEqual(checkInbound({ version: 3, recipes: [] }).ok, true, "leeres Array ist gültig (Massen-Lösch-Schutz greift danach)");
});

test("checkInbound: null-Eintrag raus, fehlende id neu vergeben, doppelte id umbenannt, exakte Kopie raus", () => {
  const res = checkInbound({ version: 3, recipes: [R("a"), null, { ...R("x"), id: "" }, R("a", { name: "Anderes" }), R("a")] });
  assertEqual(res.ok, true);
  const out = res.collection.recipes;
  assertEqual(out.length, 3);
  assertEqual(new Set(ids(out)).size, 3, "alle ids eindeutig");
  assert(out.every((r) => typeof r.id === "string" && r.id), "jede id gesetzt");
  assertDeepEqual(out.map((r) => r.name), ["Rezept a", "Rezept x", "Anderes"]);
  assertEqual(res.repaired.length, 4);
});

test("checkInbound: v1-Defaults wie loadCollection, unbekannte Felder bleiben", () => {
  const r = checkInbound({ version: 3, updated: "2026-10-26T10:00:00Z", recipes: [R("a", { zukunft: 1 })] }).collection;
  assertEqual(r.updated, "2026-10-26T10:00:00Z");
  assertDeepEqual([r.recipes[0].rating, r.recipes[0].favorite, r.recipes[0].zukunft], [0, false, 1]);
});

test("isMassDelete: ab 5 Rezepten oder ab 20 % (Marcel 2026-10-26)", () => {
  assertEqual(isMassDelete(4, 105), false);
  assertEqual(isMassDelete(5, 105), true);
  assertEqual(isMassDelete(1, 10), false);
  assertEqual(isMassDelete(2, 10), true);
  assertEqual(isMassDelete(0, 0), false);
});
