// Tests: QW-2 (#63) — der Kochmodus merkt sich den Portions-Faktor pro Rezept auf diesem Gerät.
// Reiner Helfer (features/cooking/portions.js) gegen einen Speicher-Stub; den Weg durch die
// Oberfläche (ändern → schließen → wieder öffnen) prüft e2e 05.
import { test, assertEqual, assertDeepEqual } from "./runner.js";
import { getFactor, setFactor, clearFactor, targetFor, PORTIONS_KEY } from "../src/features/cooking/portions.js";

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    has: (k) => m.has(k),
  };
}

test("QW-2: gewählter Faktor wird pro Rezept-id gespeichert und wieder gelesen", () => {
  const s = memStore();
  setFactor("r01", 0.5, s);
  setFactor("r02", 3, s);
  assertEqual(getFactor("r01", s), 0.5);
  assertEqual(getFactor("r02", s), 3);
  assertDeepEqual(JSON.parse(s.getItem(PORTIONS_KEY)), { r01: 0.5, r02: 3 });
});

test("QW-2: Rezept ohne gespeicherten Wert → Faktor 1", () => {
  assertEqual(getFactor("r01", memStore()), 1);
  const s = memStore();
  setFactor("r02", 2, s);
  assertEqual(getFactor("r01", s), 1);
});

test("QW-2: zurück auf die eigene Portionsgröße (Faktor 1) entfernt den Wert", () => {
  const s = memStore();
  setFactor("r01", 0.5, s);
  setFactor("r02", 2, s);
  setFactor("r01", 1, s);
  assertDeepEqual(JSON.parse(s.getItem(PORTIONS_KEY)), { r02: 2 });
  setFactor("r02", 1, s);
  assertEqual(s.has(PORTIONS_KEY), false, "leere Karte → Schlüssel ganz weg");
});

test("QW-2: clearFactor entfernt nur das eine Rezept", () => {
  const s = memStore();
  setFactor("r01", 0.5, s);
  setFactor("r02", 2, s);
  clearFactor("r01", s);
  assertEqual(getFactor("r01", s), 1);
  assertEqual(getFactor("r02", s), 2);
});

test("QW-2: kaputtes gespeichertes JSON wird toleriert (lesen = 1, schreiben repariert)", () => {
  for (const broken of ["{nicht json", "null", "[1,2]", "\"text\"", "42"]) {
    const s = memStore({ [PORTIONS_KEY]: broken });
    assertEqual(getFactor("r01", s), 1, `lesen bei ${broken}`);
    setFactor("r01", 2, s);
    assertEqual(getFactor("r01", s), 2, `schreiben bei ${broken}`);
  }
});

test("QW-2: unbrauchbare Einzelwerte zählen als nicht gespeichert", () => {
  const s = memStore({ [PORTIONS_KEY]: JSON.stringify({ a: "2", b: -1, c: 0, d: null, e: 1e999, f: 2 }) });
  for (const id of ["a", "b", "c", "d", "e"]) assertEqual(getFactor(id, s), 1, id);
  assertEqual(getFactor("f", s), 2);
  setFactor("f", NaN, s);
  assertEqual(getFactor("f", s), 1, "ungültiger Faktor wird nicht gespeichert, sondern entfernt");
});

test("QW-2: Speicher wirft (privater Modus) → kein Fehler, Faktor 1", () => {
  const boom = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assertEqual(getFactor("r01", boom), 1);
  setFactor("r01", 2, boom);
  clearFactor("r01", boom);
});

test("QW-2: ids wie „__proto__“ verschmutzen nichts", () => {
  const s = memStore();
  setFactor("__proto__", 2, s);
  assertEqual(getFactor("__proto__", s), 2);
  assertEqual(getFactor("toString", s), 1);
  assertEqual({}.polluted, undefined);
});

test("QW-2: targetFor — Ziel-Portionen aus Faktor, gerundet und auf 1…24 begrenzt", () => {
  assertEqual(targetFor(4, 0.5), 2);
  assertEqual(targetFor(4, 1), 4);
  assertEqual(targetFor(3, 2 / 3), 2);
  assertEqual(targetFor(4, 100), 24);
  assertEqual(targetFor(4, 0.01), 1);
  assertEqual(targetFor(null, 1.5), null, "ohne Zahl bei servings gibt es kein Ziel, nur den ×-Faktor");
});
