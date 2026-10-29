// Tests: data/recipeImport.js (G2.1) — reiner Import-Kern.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { parseImportFile, planImport } from "../src/data/recipeImport.js";

const r = (id, name, extra = {}) => ({ id, name, category: "Vegetarische Hauptgerichte", ...extra });
const file = (recipes, extra = {}) => JSON.stringify({ version: 3, updated: "2026-10-27T00:00:00Z", recipes, ...extra });

test("import: kaputtes JSON / kein Objekt / recipes fehlt / version falsch → errors, nichts zu importieren", () => {
  for (const bad of ["{nope", "[]", "null", "42", JSON.stringify({ version: 3 }),
    JSON.stringify({ version: 3, recipes: {} }), JSON.stringify({ version: "3", recipes: [] }),
    JSON.stringify({ recipes: [] })]) {
    const res = parseImportFile(bad);
    assert(res.errors.length > 0, "errors für " + bad);
    assertEqual(res.recipes.length, 0);
  }
});

test("import: ungültige Rezepte werden mit Index gemeldet, gültige trotzdem importiert", () => {
  const res = parseImportFile(file([r("a", "A"), { id: "b" }, r("c", "C"), null]));
  assertDeepEqual(res.recipes.map((x) => x.id), ["a", "c"]);
  assertEqual(res.errors.length, 2);
  assert(res.errors[0].includes("[1]") && res.errors[1].includes("[3]"), "Index im Fehler");
});

test("import: photos fallen weg, image und andere Felder bleiben, Defaults gesetzt", () => {
  const res = parseImportFile(file([r("a", "A", { photos: [{ id: "drive1", added: "x" }], image: "https://x/y.jpg", tips: "t" })]));
  const got = res.recipes[0];
  assertDeepEqual(got.photos, []);
  assertEqual(got.image, "https://x/y.jpg");
  assertEqual(got.tips, "t");
  assertEqual(got.rating, 0);
});

test("import: ID-Kollision überschreibt nie — frische ID, in renamed gemeldet", () => {
  const existing = [r("a", "Alt")];
  const plan = planImport([r("a", "Neu"), r("b", "B")], existing, () => 1000);
  assertEqual(plan.toAdd.length, 2);
  assertEqual(plan.toAdd[0].name, "Neu");
  assert(plan.toAdd[0].id !== "a", "neue ID");
  assertEqual(plan.toAdd[1].id, "b");
  assertDeepEqual(plan.renamed, [{ from: "a", to: plan.toAdd[0].id, name: "Neu" }]);
  assertEqual(existing[0].name, "Alt");
});

test("import: doppelte IDs innerhalb der Datei werden gleich behandelt", () => {
  const plan = planImport([r("x", "X1"), r("x", "X2")], []);
  const ids = plan.toAdd.map((e) => e.id);
  assertEqual(new Set(ids).size, 2);
  assertEqual(plan.renamed.length, 1);
  assertEqual(plan.renamed[0].name, "X2");
});

test("import: dieselbe Datei zweimal → doppelt hinzugefügt, jeweils frische IDs", () => {
  const incoming = parseImportFile(file([r("a", "A")])).recipes;
  const first = planImport(incoming, []);
  const second = planImport(incoming, first.toAdd);
  assertEqual(second.toAdd.length, 1);
  assert(second.toAdd[0].id !== "a", "frische ID");
  assertEqual(second.renamed.length, 1);
});

test("import: Eingaben werden nicht mutiert", () => {
  const incoming = [r("a", "A")], existing = [r("a", "Alt")];
  const snapA = JSON.stringify(incoming), snapB = JSON.stringify(existing);
  planImport(incoming, existing);
  assertEqual(JSON.stringify(incoming), snapA);
  assertEqual(JSON.stringify(existing), snapB);
});

test("import: frische ID kollidiert nie mit einer ID, die eine frühere Import-Zeile behält", () => {
  const plan = planImport([r("r1000", "Eigen"), r("a", "Neu")], [r("a", "Alt")], () => 1000);
  const ids = plan.toAdd.map((e) => e.id);
  assertEqual(new Set(ids).size, ids.length);
  assert(!ids.includes("a"), "keine Kollision mit Bestand");
});
