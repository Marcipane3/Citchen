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

/* ---------- G1: externer Claude-Edit eines BESTEHENDEN Rezepts ---------- */

test("G1: Claude editiert ein bestehendes Rezept extern → App lädt verlustfrei", () => {
  // Ausgangslage: ein App-Rezept mit eigenen Fotos + offener Notiz.
  const before = {
    version: 3,
    updated: "2026-06-13T09:00:00.000Z",
    recipes: [{
      id: "r01", name: "Süßkartoffel-Curry", category: "Vegetarische Hauptgerichte",
      time: "35 Min", servings: "~4", ingredients: ["2 Süßkartoffeln", "1 Dose Kichererbsen"],
      steps: ["Reis aufsetzen.", "Curry köcheln."], tips: "Joghurt drüber.",
      rating: 4, favorite: true, cookedCount: 3,
      photos: [{ id: "drive-abc-123", added: "2026-06-01T10:00:00.000Z" }],
      feedback: "Mehr Schärfe und brauchte 10 Min länger.",
    }],
  };

  // Claude bearbeitet die Datei in place: arbeitet das Feedback ein, setzt ein
  // Titelbild per URL, ändert/ergänzt Felder — Fotos & app-eigene Felder bleiben.
  const raw = JSON.parse(JSON.stringify(before));
  const r = raw.recipes[0];
  r.ingredients = ["2 Süßkartoffeln", "1 Dose Kichererbsen", "1 rote Chili, fein 🛒"];
  r.steps = ["Reis aufsetzen.", "Curry 25 Min köcheln (statt 15)."];
  r.tips = "Joghurt drüber. Swap: Chili durch Sambal Oelek.";
  r.totalTime = 45;
  r.image = "https://example.com/curry.jpg";
  r.feedback = ""; // erledigt → geleert (SCHEMA-Regel)
  raw.updated = "2026-06-13T12:30:00.000Z"; // neuer als lokal → Drive gewinnt (LWW)

  const { collection, report } = loadCollection(raw);
  assertEqual(report.errors.length, 0, "extern editierte Datei muss sauber validieren: " + report.errors.join("; "));
  const out = collection.recipes[0];

  // Der Edit ist da …
  assertEqual(out.ingredients.length, 3);
  assert(out.ingredients[2].includes("🛒"), "Einkaufs-Marker erhalten");
  assert(out.steps[1].includes("25 Min"), "Schritt-Edit übernommen");
  assert(out.tips.includes("Swap:"), "Tipp-Konvention übernommen");
  assertEqual(out.totalTime, 45);
  assertEqual(out.image, "https://example.com/curry.jpg");
  assertEqual(out.feedback, "", "eingearbeitetes Feedback ist geleert");
  // … und app-eigene Daten sind unangetastet.
  assertEqual(JSON.stringify(out.photos), JSON.stringify(before.recipes[0].photos), "photos NICHT angefasst");
  assertEqual(out.rating, 4); assertEqual(out.favorite, true); assertEqual(out.cookedCount, 3);
  assertEqual(collection.updated, "2026-06-13T12:30:00.000Z", "neuere updated-Marke trägt durch (LWW)");

  // Idempotent: zurückschreiben + erneut laden ändert nichts.
  const second = loadCollection(serializeCollection(collection)).collection;
  assertEqual(JSON.stringify(second.recipes), JSON.stringify(collection.recipes), "Round-Trip stabil");
});

test("G1: Claude hängt ein neues Rezept an (append) → eindeutige ID, valide", () => {
  const { collection } = loadCollection(ORIGINAL);
  const existing = collection.recipes.map((r) => r.id);
  const appended = {
    version: 3, updated: "2026-06-13T13:00:00.000Z",
    recipes: [...collection.recipes, {
      id: "r1718280000000", name: "Neuer Linseneintopf", category: "Suppen & Eintöpfe",
      ingredients: ["200g rote Linsen"], steps: ["Kochen."], toTry: true,
    }],
  };
  const { collection: out, report } = loadCollection(appended);
  assertEqual(report.errors.length, 0, "append muss valide sein: " + report.errors.join("; "));
  assertEqual(out.recipes.length, 106);
  assert(!existing.includes("r1718280000000"), "neue ID war vorher nicht vergeben");
  const added = out.recipes.find((r) => r.id === "r1718280000000");
  assertEqual(added.toTry, true);
  assertEqual(added.feedback, "", "Defaults für app-eigene Felder ergänzt");
});

test("loadCollection: kaputte Eingabe -> leere Sammlung mit Fehlern, kein Crash", () => {
  const { collection, report } = loadCollection(null);
  assertEqual(collection.recipes.length, 0);
  const bad = loadCollection({ version: 3, recipes: [{ id: "x", name: "", category: "Quatsch" }] });
  assertEqual(bad.collection.recipes.length, 1, "defekte Rezepte werden NICHT verworfen");
  assert(bad.report.errors.length > 0, "…aber gemeldet");
});
