// Tests: v2.16b (T9) — Einkaufsliste verständlicher: Herkunft jeder Zeile (UX-10), Rückgängig für
// jede Aktion (UX-11/13), Ergebnis nach „Auf die Liste“ (UX-14). Rein: shopping/logic.js.
// Die Ansicht selbst (Snackbar, Neu-Hinweis, Kachel unter dem Finger) prüft e2e 06 + 07.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  originOf, snapshotItems, changedIds, undoChange, addSummary, mergeItems, aggregateIngredients, addOne,
} from "../src/features/shopping/logic.js";

const NOW = "2026-10-27T10:00:00.000Z";
const at = (min) => new Date(Date.parse(NOW) + min * 60000).toISOString();
const row = (id, name, extra = {}) => ({ id, name, cat: "Sonstiges", icon: "🛒", qty: 1, done: false, amount: null, unit: null, updated: at(0), author: "local", deleted: false, ...extra });

/* ---------- Herkunft (UX-10) ---------- */

test("T9 / UX-10: originOf — Rezepte, Wochenplan, Freund, anderes Gerät", () => {
  assertDeepEqual(originOf(row("a", "Ingwer", { sources: ["r1", "r2"], plan: true }), { device: "d-me" }),
    { recipes: ["r1", "r2"], plan: true, friend: null, other: false });
  assertEqual(originOf(row("b", "Brot", { author: "friend:Anna" })).friend, "Anna");
  assertEqual(originOf(row("c", "Brot", { author: "friend" })).friend, "", "Freund ohne Namen");
  assert(originOf(row("d", "Milch", { by: "d-partner" }), { device: "d-me" }).other, "anderes Gerät");
  assert(!originOf(row("e", "Milch", { by: "d-me" }), { device: "d-me" }).other, "dieses Gerät");
  assert(!originOf(row("f", "Milch"), { device: "d-me" }).other, "alte Zeile ohne `by` → keine Aussage");
});

test("T9: Wochenplan-Herkunft bleibt, wenn der Plan in eine vorhandene Zeile aufaddiert", () => {
  const list = [row("a", "Ingwer", { nameDe: "Ingwer", amount: 1, unit: "Stück" })];
  const out = mergeItems(list, [{ name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", qty: 1, sources: ["r9"], plan: true }], at(1));
  assertEqual(out[0].plan, true);
  assertDeepEqual(out[0].sources, ["r9"]);
});

/* ---------- Rückgängig (UX-11, UX-13) ---------- */

test("T9 / UX-13: ✕ rückgängig → Zeile wieder offen, mit NEUER Marke (sonst gewinnt beim Partner die Löschung)", () => {
  const items = [row("a", "Milch"), row("b", "Brot")];
  const before = snapshotItems(items);
  items[0].deleted = true; items[0].updated = at(1);
  const ids = changedIds(before, items);
  assertDeepEqual(ids, ["a"]);
  assertEqual(undoChange(items, before, ids, at(2)), 1);
  assertEqual(items[0].deleted, false);
  assertEqual(items[0].updated, at(2));
  assertEqual(items[1].updated, at(0), "unbeteiligte Zeile unverändert");
});

test("T9 / UX-11: Kachel-Tipp rückgängig — neue Zeile wird gelöscht, aufaddierte zurückgesetzt", () => {
  const items = [row("a", "Ingwer", { amount: 2, unit: "Stück" })];
  const before = snapshotItems(items);
  addOne(items, { name: "Ingwer" }, { now: at(1), id: "n1" });     // +1 → 3 Stück
  addOne(items, { name: "Hafermilch" }, { now: at(1), id: "n2" }); // neu
  const ids = changedIds(before, items);
  assertDeepEqual(ids.sort(), ["a", "n2"]);
  undoChange(items, before, ids, at(2));
  assertEqual(items[0].amount, 2);
  assertEqual(items.find((x) => x.id === "n2").deleted, true);
});

test("T9: Rückgängig nimmt NUR die eigene Aktion zurück — was ein Abgleich dazwischen änderte, bleibt", () => {
  const items = [row("a", "Milch"), row("b", "Brot")];
  const before = snapshotItems(items);
  items[0].done = true; items[0].updated = at(1);            // die Aktion
  const ids = changedIds(before, items);
  items[1].qty = 5; items[1].updated = at(2);                 // Partner-Abgleich danach
  items.push(row("c", "Äpfel", { updated: at(2) }));          // … und ein neuer Partner-Artikel
  undoChange(items, before, ids, at(3));
  assertEqual(items[0].done, false);
  assertEqual(items[1].qty, 5, "Partner-Änderung bleibt");
  assertEqual(items[2].deleted, false, "Partner-Artikel bleibt");
});

test("T9: Rückgängig entfernt Felder, die die Aktion neu angelegt hat (z. B. `more`)", () => {
  const items = [row("a", "Joghurt", { amount: 200, unit: "g" })];
  const before = snapshotItems(items);
  Object.assign(items[0], { more: [{ amount: 2, unit: "EL" }], updated: at(1) });
  undoChange(items, before, changedIds(before, items), at(2));
  assert(!("more" in items[0]));
});

/* ---------- Ergebnis nach „Auf die Liste“ (UX-14) ---------- */

test("T9 / UX-14: addSummary — neu vs. aufaddiert, mit der Zeile, wie sie jetzt aussieht", () => {
  const before = [row("a", "Ingwer", { nameDe: "Ingwer", amount: 1, unit: "Stück" }), row("x", "Feta", { deleted: true })];
  const recipe = { id: "r", name: "R", category: "Vegetarische Hauptgerichte", ingredients: ["1 Stück Ingwer, gerieben 🛒", "200g Feta 🛒", "1 Limette 🛒"] };
  const { items } = aggregateIngredients([recipe]);
  const after = mergeItems(before, items, at(1));
  assertDeepEqual(addSummary(before, after, items), [
    { label: "2 Stück Ingwer", merged: true },
    { label: "200g Feta", merged: false },   // nur ein Tombstone da → neu (wiederbelebt)
    { label: "1 Limette", merged: false },
  ]);
});
