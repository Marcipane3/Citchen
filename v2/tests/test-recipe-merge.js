// Tests: data/recipeMerge.js (v2.15.1, Epic T1/T2) — reine Funktionen, die Spezifikation der
// sicheren Rezept-Synchronisation: Drei-Wege-Merge pro Rezept + Prüfung eingehender Drive-Dateien.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { mergeRecipes, inspectRemote, sameRecipe, suspiciousDrop, RemoteRejected } from "../src/data/recipeMerge.js";

const r = (id, name, extra = {}) => ({ id, name, category: "Vegetarische Hauptgerichte", ...extra });
const names = (list) => list.map((x) => x.name);
const ids = (list) => list.map((x) => x.id);

/* ---------- Drei-Wege-Merge ---------- */

test("merge: nur Drive geändert → Drive-Stand", () => {
  const base = [r("a", "A")], local = [r("a", "A")], remote = [r("a", "A von Claude")];
  assertDeepEqual(names(mergeRecipes({ base, local, remote }).merged), ["A von Claude"]);
});

test("merge: nur lokal geändert → lokaler Stand", () => {
  const base = [r("a", "A")], local = [r("a", "A lokal")], remote = [r("a", "A")];
  assertDeepEqual(names(mergeRecipes({ base, local, remote }).merged), ["A lokal"]);
});

test("merge: beide geändert → pro Feld; bei demselben Feld gewinnt lokal; als Konflikt gemeldet", () => {
  const base = [r("a", "A", { rating: 0, time: "10 Min" })];
  const local = [r("a", "A", { rating: 5, time: "15 Min" })];
  const remote = [r("a", "A neu", { rating: 0, time: "20 Min" })];
  const { merged, conflicts } = mergeRecipes({ base, local, remote });
  assertDeepEqual(merged[0], r("a", "A neu", { rating: 5, time: "15 Min" }));
  assertDeepEqual(conflicts, ["a"]);
});

test("merge: Feld lokal entfernt bleibt entfernt; auf Drive hinzugefügtes Feld kommt dazu", () => {
  const base = [r("a", "A", { feedback: "zu salzig" })];
  const local = [r("a", "A", { rating: 3 })];                         // feedback geleert (gelöscht) + rating neu
  const remote = [r("a", "A", { feedback: "zu salzig", nutrition: "520 kcal" })];
  const m = mergeRecipes({ base, local, remote }).merged[0];
  assertEqual(m.feedback, undefined);
  assertEqual(m.rating, 3);
  assertEqual(m.nutrition, "520 kcal");
});

test("merge: neue Rezepte beider Seiten bleiben; neue lokale vorn, dann Drive-Reihenfolge", () => {
  const base = [r("a", "A")];
  const local = [r("l", "Lokal neu"), r("a", "A")];
  const remote = [r("c", "Claude neu"), r("a", "A")];
  assertDeepEqual(ids(mergeRecipes({ base, local, remote }).merged), ["l", "c", "a"]);
});

test("merge: auf Drive gelöscht + lokal unverändert → gelöscht (und gemeldet)", () => {
  const base = [r("a", "A"), r("b", "B")], local = [r("a", "A"), r("b", "B")], remote = [r("a", "A")];
  const out = mergeRecipes({ base, local, remote });
  assertDeepEqual(ids(out.merged), ["a"]);
  assertDeepEqual(out.removedRemotely, ["b"]);
});

test("merge: auf Drive gelöscht, aber lokal bearbeitet → bleibt (Bearbeiten schlägt Löschen)", () => {
  const base = [r("b", "B")], local = [r("b", "B lokal")], remote = [];
  assertDeepEqual(names(mergeRecipes({ base, local, remote }).merged), ["B lokal"]);
});

test("merge: lokal gelöscht + Drive unverändert → bleibt gelöscht; Drive geändert → kommt zurück", () => {
  const base = [r("a", "A"), r("b", "B")];
  assertDeepEqual(ids(mergeRecipes({ base, local: [r("a", "A")], remote: base }).merged), ["a"]);
  assertDeepEqual(ids(mergeRecipes({ base, local: [r("a", "A")], remote: [r("a", "A"), r("b", "B neu")] }).merged), ["a", "b"]);
});

test("merge ohne Basis: Vereinigung (nichts wird gelöscht); Unterschiede nach `prefer`", () => {
  const local = [r("a", "A lokal"), r("l", "nur lokal")], remote = [r("a", "A Drive"), r("c", "nur Drive")];
  const viaRemote = mergeRecipes({ base: null, local, remote, prefer: "remote" }).merged;
  assertDeepEqual(names(viaRemote).sort(), ["A Drive", "nur Drive", "nur lokal"]);
  const viaLocal = mergeRecipes({ base: null, local, remote, prefer: "local" }).merged;
  assertDeepEqual(names(viaLocal).sort(), ["A lokal", "nur Drive", "nur lokal"]);
});

test("merge: identische Seiten → unverändert, keine Konflikte", () => {
  const list = [r("a", "A"), r("b", "B")];
  const out = mergeRecipes({ base: list, local: list, remote: list });
  assertDeepEqual(out.merged, list);
  assertDeepEqual([out.conflicts, out.removedRemotely], [[], []]);
});

test("sameRecipe: Schlüsselreihenfolge egal, Werte nicht", () => {
  assert(sameRecipe({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
  assert(!sameRecipe({ a: 1 }, { a: 2 }));
  assert(!sameRecipe({ a: [1, 2] }, { a: [2, 1] }));
});

/* ---------- Eingangsprüfung ---------- */

const rejects = (json, code) => {
  try { inspectRemote(json); } catch (e) { assert(e instanceof RemoteRejected, "falscher Fehlertyp"); assertEqual(e.code, code); return; }
  throw new Error("nicht abgelehnt: " + JSON.stringify(json));
};

test("inspectRemote: lehnt Nicht-Objekte, fehlende Rezeptliste und neueres Format ab", () => {
  rejects(null, "notObject");
  rejects([], "notObject");
  rejects("text", "notObject");
  rejects({}, "noRecipes");
  rejects({ version: 3, recipes: null }, "noRecipes");
  rejects({ version: 3, Rezepte: [] }, "noRecipes");
  rejects({ version: 4, recipes: [] }, "newerFormat");
});

test("inspectRemote: leere Liste ist gültig (Löschen wird dann über den Merge + Rückfrage geregelt)", () => {
  const { collection, notes } = inspectRemote({ version: 3, recipes: [] });
  assertDeepEqual([collection.recipes, notes], [[], []]);
});

test("inspectRemote: rettet Einträge statt sie zu verlieren — fehlende id, doppelte id, null", () => {
  const { collection, notes } = inspectRemote({
    version: 3, updated: "2026-10-19T10:00:00.000Z",
    recipes: [r("a", "A"), null, { name: "ohne id", category: "Vegetarische Hauptgerichte" }, r("a", "doppelt")],
  }, { now: () => 1000 });
  assertDeepEqual(names(collection.recipes), ["A", "ohne id", "doppelt"]);
  assertEqual(new Set(ids(collection.recipes)).size, 3, "ids eindeutig");
  assertEqual(collection.recipes[0].id, "a", "die erste behält ihre id");
  assertEqual(notes.length, 3);
  assertEqual(collection.updated, "2026-10-19T10:00:00.000Z");
});

test("inspectRemote: ergänzt v1-Defaults wie loadCollection (rating, favorite …)", () => {
  const { collection } = inspectRemote({ version: 3, recipes: [r("a", "A")] });
  assertEqual(collection.recipes[0].rating, 0);
  assertEqual(collection.recipes[0].favorite, false);
});

test("suspiciousDrop: ab 5 Rezepten oder ab 20 % fragen (Marcel 2026-10-26)", () => {
  assert(!suspiciousDrop(0, 105));
  assert(!suspiciousDrop(1, 105));
  assert(!suspiciousDrop(4, 105));
  assert(suspiciousDrop(5, 105));           // früher erst ab 22 von 105
  assert(suspiciousDrop(20, 105));
  assert(suspiciousDrop(65, 105));          // Probe aus DG-03: 105 → 40
  assert(suspiciousDrop(105, 105));
  assert(!suspiciousDrop(1, 10));           // 10 %
  assert(suspiciousDrop(2, 10));            // 20 %
  assert(suspiciousDrop(3, 10));
  assert(!suspiciousDrop(0, 0));
});
