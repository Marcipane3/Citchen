// Tests: data/decideSync.js — die reine Last-Write-Wins-Entscheidung (K2).
// Das ist die ausführbare Spezifikation der Konfliktregel, BEVOR Epic I2 den Sync auf ein
// zweites Objekt (Einkaufsliste) vervielfacht. Der wichtigste Fall ist `conflict`: eine
// lokale, ungepushte Änderung darf nicht mehr stillschweigend von einem neueren Drive-Stand
// überschrieben werden (vorher: Datenverlust ohne Warnung, qa/findings/bug-hunter.md).
import { test, assertEqual } from "./runner.js";
import { decideSync } from "../src/data/decideSync.js";

// — Erstlauf: keine Remote-Datei → hochladen.
test("decideSync: keine Remote-Datei → create", () => {
  assertEqual(decideSync({ hasRemote: false, localUpdated: "T1", dirty: false }), "create");
  assertEqual(decideSync({ hasRemote: false, localUpdated: "", dirty: true }), "create");
});

// — Saubere lokale Daten (nicht dirty): Remote darf gewinnen.
test("decideSync: sauber, Remote neuer → pull", () => {
  assertEqual(decideSync({ hasRemote: true, localUpdated: "T1", remoteUpdated: "T2", dirty: false, source: "drive" }), "pull");
});

test("decideSync: sauber, erstes echtes Drive-Laden (source≠drive) → pull", () => {
  // Gleicher Stand, aber lokale Quelle ist noch der Snapshot → einmalig vom Drive laden.
  assertEqual(decideSync({ hasRemote: true, localUpdated: "T1", remoteUpdated: "T1", dirty: false, source: "snapshot" }), "pull");
});

test("decideSync: sauber, alles im Gleichstand und schon vom Drive → noop", () => {
  assertEqual(decideSync({ hasRemote: true, localUpdated: "T1", remoteUpdated: "T1", dirty: false, source: "drive" }), "noop");
});

// — Dirty (lokale ungepushte Änderung).
test("decideSync: dirty und lokal nachweislich jünger → push", () => {
  assertEqual(decideSync({ hasRemote: true, localUpdated: "T2", remoteUpdated: "T1", dirty: true, source: "drive" }), "push");
});

test("decideSync: dirty, aber Remote ist NEUER → conflict (kein stilles Überschreiben)", () => {
  // Genau der Datenverlust-Fall aus bug-hunter.md: offline geändert (T1), Drive extern auf T2.
  assertEqual(decideSync({ hasRemote: true, localUpdated: "T1", remoteUpdated: "T2", dirty: true, source: "drive" }), "conflict");
});

test("decideSync: dirty und gleiche Marke → conflict (lokale Änderung wird bewahrt)", () => {
  assertEqual(decideSync({ hasRemote: true, localUpdated: "T1", remoteUpdated: "T1", dirty: true, source: "drive" }), "conflict");
});

// — Robustheit: fehlende/leere Marken kippen nicht in einen Datenverlust.
test("decideSync: dirty mit leeren Marken → conflict statt stillem pull", () => {
  assertEqual(decideSync({ hasRemote: true, localUpdated: "", remoteUpdated: "", dirty: true, source: "drive" }), "conflict");
});

test("decideSync: leere Optionen → create (sicherer Default)", () => {
  assertEqual(decideSync(), "create");
});
