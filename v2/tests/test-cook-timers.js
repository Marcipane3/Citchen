// Tests: QW-8 (#64) — Schritt-Timer leben außerhalb des gerenderten DOM.
// Reines Modul (features/cooking/timers.js) mit injizierbarer Uhr: Der Zustand (welcher Schritt,
// Endzeit, läuft / abgelaufen) übersteht jedes Neuzeichnen; die Restzeit wird aus der Endzeit
// berechnet, nicht aus einem Zähler. Den Weg durch die Oberfläche prüft e2e 05.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { createTimers } from "../src/features/cooking/timers.js";

const T0 = 1_700_000_000_000;

test("QW-8: start → Restzeit kommt aus der Endzeit (sekundengenau, aufgerundet)", () => {
  const tm = createTimers();
  tm.start(2, 60, T0);
  assertEqual(tm.remaining(2, T0), 60);
  assertEqual(tm.remaining(2, T0 + 30_000), 30);
  assertEqual(tm.remaining(2, T0 + 30_001), 30);
  assertEqual(tm.remaining(2, T0 + 59_999), 1);
  assertEqual(tm.remaining(2, T0 + 60_000), 0);
  assertEqual(tm.remaining(2, T0 + 999_000), 0);
});

test("QW-8: Restzeit hängt nur von der Uhr ab — keine Ticks nötig (Zähler kann nicht pausieren)", () => {
  const tm = createTimers();
  tm.start(0, 600, T0);
  // Zehn Minuten lang fragt niemand nach (anderer Schritt wird gezeigt) → danach stimmt die Zeit trotzdem.
  assertEqual(tm.remaining(0, T0 + 599_000), 1);
});

test("QW-8: running / fired — läuft bis zur Endzeit, danach abgelaufen", () => {
  const tm = createTimers();
  assertEqual(tm.running(1, T0), false);
  assertEqual(tm.fired(1, T0), false);
  tm.start(1, 5, T0);
  assertEqual(tm.running(1, T0 + 4_999), true);
  assertEqual(tm.fired(1, T0 + 4_999), false);
  assertEqual(tm.running(1, T0 + 5_000), false);
  assertEqual(tm.fired(1, T0 + 5_000), true);
  assertEqual(tm.fired(1, T0 + 500_000), true, "abgelaufen bleibt sichtbar, bis gestoppt/neu gestartet");
});

test("QW-8: Schritt ohne Timer → Restzeit 0, läuft nicht, nicht abgelaufen", () => {
  const tm = createTimers();
  assertEqual(tm.remaining(7, T0), 0);
  assertEqual(tm.running(7, T0), false);
  assertEqual(tm.fired(7, T0), false);
});

test("QW-8: Timer sind pro Schritt unabhängig", () => {
  const tm = createTimers();
  tm.start(0, 60, T0);
  tm.start(3, 120, T0 + 10_000);
  assertEqual(tm.remaining(0, T0 + 20_000), 40);
  assertEqual(tm.remaining(3, T0 + 20_000), 110);
  assertEqual(tm.fired(0, T0 + 60_000), true);
  assertEqual(tm.running(3, T0 + 60_000), true);
});

test("QW-8: stop(schritt) entfernt nur diesen Timer", () => {
  const tm = createTimers();
  tm.start(0, 60, T0);
  tm.start(1, 60, T0);
  tm.stop(0);
  assertEqual(tm.running(0, T0 + 1_000), false);
  assertEqual(tm.remaining(0, T0 + 1_000), 0);
  assertEqual(tm.fired(0, T0 + 61_000), false, "gestoppter Timer läuft nicht nachträglich ab");
  assertEqual(tm.running(1, T0 + 1_000), true);
  tm.stop(99); // unbekannter Schritt: kein Fehler
});

test("QW-8: erneutes start auf demselben Schritt ersetzt den Timer (ein Timer pro Schritt)", () => {
  const tm = createTimers();
  tm.start(0, 60, T0);
  assertEqual(tm.fired(0, T0 + 60_000), true);
  tm.start(0, 30, T0 + 70_000);
  assertEqual(tm.fired(0, T0 + 70_000), false);
  assertEqual(tm.remaining(0, T0 + 80_000), 20);
});

test("QW-8: clear() stoppt alle Timer", () => {
  const tm = createTimers();
  tm.start(0, 60, T0);
  tm.start(1, 1, T0);
  tm.clear();
  assertEqual(tm.running(0, T0 + 1_000), false);
  assertEqual(tm.fired(1, T0 + 5_000), false);
  assertEqual(tm.anyRunning(T0 + 1_000), false);
  assertDeepEqual(tm.takeFired(T0 + 100_000), []);
});

test("QW-8: anyRunning — nur solange mindestens ein Timer noch nicht abgelaufen ist", () => {
  const tm = createTimers();
  assertEqual(tm.anyRunning(T0), false);
  tm.start(0, 10, T0);
  tm.start(1, 20, T0);
  assertEqual(tm.anyRunning(T0 + 15_000), true);
  assertEqual(tm.anyRunning(T0 + 20_000), false);
});

test("QW-8: takeFired meldet jeden abgelaufenen Timer genau einmal (Alarm auch für nicht gezeigte Schritte)", () => {
  const tm = createTimers();
  tm.start(0, 10, T0);
  tm.start(4, 20, T0);
  assertDeepEqual(tm.takeFired(T0 + 9_000), []);
  assertDeepEqual(tm.takeFired(T0 + 10_000), [0]);
  assertDeepEqual(tm.takeFired(T0 + 11_000), [], "kein zweiter Alarm für denselben Ablauf");
  assertEqual(tm.fired(0, T0 + 11_000), true, "bleibt abgelaufen, auch nachdem der Alarm gemeldet wurde");
  assertDeepEqual(tm.takeFired(T0 + 25_000), [4]);
  // Neu gestartet → meldet beim nächsten Ablauf wieder.
  tm.start(0, 5, T0 + 30_000);
  assertDeepEqual(tm.takeFired(T0 + 35_000), [0]);
});

test("QW-8: ungültige Dauer startet keinen Timer", () => {
  const tm = createTimers();
  for (const bad of [0, -5, NaN, null, undefined, "abc"]) {
    assertEqual(tm.start(0, bad, T0), false);
    assertEqual(tm.running(0, T0), false);
  }
  assert(tm.start(0, 1, T0) === true);
});
