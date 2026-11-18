// Tests: Einheiten-Tabelle (R2.1, ADR-R1 §4) — reine Daten + unitFromText.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { readFileSync } from "node:fs";
import { UNITS, UNIT_IDS, unitFromText } from "../src/data/units.js";
import { parseIngredient } from "../src/data/derive.js";
import { splitLine } from "../src/features/shopping/logic.js";

const LANGS = ["de", "en", "es", "da"];

test("units: genau die 18 Einheiten-ids aus ADR §4", () => {
  assertDeepEqual(UNIT_IDS, ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "clove", "slice",
    "bunch", "can", "packet", "jar", "tub", "cube", "cm", "pinch"]);
  assertDeepEqual(Object.keys(UNITS), UNIT_IDS);
});

test("units: kind je Einheit (mass | volume | count | vague)", () => {
  const kinds = { mass: ["g", "kg"], volume: ["ml", "l", "tsp", "tbsp", "cup"],
    count: ["piece", "clove", "slice", "bunch", "can", "packet", "jar", "tub", "cube", "cm"], vague: ["pinch"] };
  for (const [kind, ids] of Object.entries(kinds)) for (const id of ids) assertEqual(UNITS[id].kind, kind, id);
});

test("units: feste Faktoren — Masse in g, Volumen in ml, Prise 0,5 g; Zähl-Einheiten ohne Faktor", () => {
  const fixed = { g: ["g", 1], kg: ["g", 1000], ml: ["ml", 1], l: ["ml", 1000], tsp: ["ml", 5], tbsp: ["ml", 15],
    cup: ["ml", 250], pinch: ["g", 0.5] };
  for (const id of UNIT_IDS) {
    const u = UNITS[id];
    if (fixed[id]) { assertEqual(u.base, fixed[id][0], id + " base"); assertEqual(u.factor, fixed[id][1], id + " factor"); }
    else { assertEqual(u.base, null, id + " base"); assertEqual(u.factor, null, id + " factor"); }
  }
});

test("units: Anzeigenamen in de/en/es/da, nicht leer", () => {
  for (const id of UNIT_IDS) for (const lang of LANGS) {
    const n = UNITS[id].names[lang];
    assert(typeof n === "string" && n.trim().length > 0, `${id}.names.${lang} fehlt`);
  }
  assertEqual(UNITS.tbsp.names.de, "EL");
  assertEqual(UNITS.tsp.names.de, "TL");
  assertEqual(UNITS.packet.names.de, "Päckchen");
});

test("unitFromText: bildet die heutigen Rezept-Einheiten auf ids ab", () => {
  const map = { EL: "tbsp", TL: "tsp", Liter: "l", l: "l", "Päckchen": "packet", "Pck.": "packet", Pck: "packet",
    Dose: "can", Dosen: "can", Prise: "pinch", Prisen: "pinch", Zehe: "clove", Zehen: "clove",
    Scheibe: "slice", Scheiben: "slice", "Stück": "piece", Bund: "bunch", Glas: "jar", Becher: "tub",
    "Würfel": "cube", Tasse: "cup", Tassen: "cup", cm: "cm", g: "g", kg: "kg", ml: "ml" };
  for (const [text, id] of Object.entries(map)) assertEqual(unitFromText(text), id, text);
});

test("unitFromText: Groß-/Kleinschreibung und Leerraum egal; ids bilden auf sich selbst ab", () => {
  assertEqual(unitFromText(" el "), "tbsp");
  assertEqual(unitFromText("G"), "g");
  assertEqual(unitFromText("LITER"), "l");
  for (const id of UNIT_IDS) assertEqual(unitFromText(id), id, id);
});

test("unitFromText: unbekannt → null", () => {
  for (const x of ["Daumen", "Handvoll", "", "  ", null, undefined, 5, "gramm-ish"]) assertEqual(unitFromText(x), null, String(x));
});

test("unitFromText: kennt jede Einheit, die der Parser im Basis-Kochbuch findet", () => {
  const here = new URL("../data/rezepte.snapshot.json", import.meta.url);
  const { recipes } = JSON.parse(readFileSync(here, "utf8"));
  const unknown = new Set();
  for (const r of recipes) for (const line of r.ingredients || []) for (const part of splitLine(line)) {
    const u = parseIngredient(part).unit;
    if (u && unitFromText(u) === null) unknown.add(u);
  }
  assertDeepEqual([...unknown], []);
});
