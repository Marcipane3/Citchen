// Tests: migrate.js — verlustfreie Migration, geprüft gegen die ECHTE rezepte.json
// (105 Rezepte, Schema v3). Kein Netz nötig: Datei liegt im Repo.
import { test, assert, assertEqual } from "./runner.js";
import { loadCollection, serializeCollection, toFileString } from "../src/data/migrate.js";
import { validateCollection } from "../src/data/schema.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Echte Datei vom Repo-Root (identisch mit v2/data/rezepte.snapshot.json)
const RAW = readFileSync(join(__dirname, "..", "data", "rezepte.snapshot.json"), "utf8");
const ORIGINAL = JSON.parse(RAW);

// Die sechs Felder, die v1.normalize()/withDefaults ergänzen darf — sonst NICHTS.
const DEFAULT_FIELDS = new Set(["rating", "photos", "favorite", "cookedCount", "image", "feedback"]);

test("Echte Datei: 105 Rezepte, Version 3, validiert sauber", () => {
  assertEqual(ORIGINAL.recipes.length, 105);
  assertEqual(ORIGINAL.version, 3);
  const v = validateCollection(ORIGINAL);
  assert(v.valid, "Bestandsdaten müssen valide sein:\n" + v.errors.join("\n"));
});

test("loadCollection: lädt alle 105 Rezepte, keine Validierungsfehler", () => {
  const { collection, report } = loadCollection(ORIGINAL);
  assertEqual(collection.recipes.length, 105);
  assertEqual(report.errors.length, 0, report.errors.join("\n"));
});

test("Verlustfreiheit: jedes Original-Feld bleibt mit identischem Wert erhalten", () => {
  const { collection } = loadCollection(ORIGINAL);
  const byId = new Map(collection.recipes.map((r) => [r.id, r]));
  for (const orig of ORIGINAL.recipes) {
    const mig = byId.get(orig.id);
    assert(mig, `Rezept ${orig.id} fehlt nach Migration`);
    for (const [k, v] of Object.entries(orig)) {
      assertEqual(JSON.stringify(mig[k]), JSON.stringify(v), `Feld ${k} von ${orig.id} verändert`);
    }
  }
});

test("Verlustfreiheit: nur die 6 v1-Default-Felder dürfen hinzukommen", () => {
  const { collection } = loadCollection(ORIGINAL);
  const byId = new Map(collection.recipes.map((r) => [r.id, r]));
  for (const orig of ORIGINAL.recipes) {
    const mig = byId.get(orig.id);
    for (const k of Object.keys(mig)) {
      if (!(k in orig)) {
        assert(DEFAULT_FIELDS.has(k), `Unerlaubtes neues Feld "${k}" in ${orig.id}`);
      }
    }
  }
});

test("Pending Feedback (r01) übersteht Migration unangetastet", () => {
  const { collection } = loadCollection(ORIGINAL);
  const r01 = collection.recipes.find((r) => r.id === "r01");
  const orig = ORIGINAL.recipes.find((r) => r.id === "r01");
  assert(orig.feedback.length > 0, "Vorbedingung: r01 hat Feedback");
  assertEqual(r01.feedback, orig.feedback);
});

test("Round-Trip: serialize(load(x)) erneut geladen = identisch (Fixpunkt)", () => {
  const first = loadCollection(ORIGINAL).collection;
  const serialized = serializeCollection(first);
  const second = loadCollection(serialized).collection;
  assertEqual(JSON.stringify(first.recipes), JSON.stringify(second.recipes), "Migration muss idempotent sein");
  assertEqual(serialized.version, 3);
  assertEqual(serialized.updated, ORIGINAL.updated, "updated darf ohne setUpdated nicht verändert werden");
});

test("Round-Trip: Umlaute & Emojis bytegenau erhalten", () => {
  const { collection } = loadCollection(ORIGINAL);
  const out = toFileString(collection);
  for (const probe of ["Süßkartoffel-Curry", "Käsespätzle mit Röstzwiebeln", "Frühstück & Brunch", "🛒"]) {
    assert(out.includes(probe), `"${probe}" fehlt nach Serialisierung`);
  }
});

test("toFileString: setUpdated stempelt neue ISO-Zeit (v1.save-Verhalten)", () => {
  const { collection } = loadCollection(ORIGINAL);
  const fixed = "2026-06-09T20:00:00.000Z";
  const out = JSON.parse(toFileString(collection, { setUpdated: true, now: () => fixed }));
  assertEqual(out.updated, fixed);
  assertEqual(out.version, 3);
});

test("loadCollection: kaputte Eingabe -> leere Sammlung mit Fehlern, kein Crash", () => {
  const { collection, report } = loadCollection(null);
  assertEqual(collection.recipes.length, 0);
  const bad = loadCollection({ version: 3, recipes: [{ id: "x", name: "", category: "Quatsch" }] });
  assertEqual(bad.collection.recipes.length, 1, "defekte Rezepte werden NICHT verworfen");
  assert(bad.report.errors.length > 0, "…aber gemeldet");
});
