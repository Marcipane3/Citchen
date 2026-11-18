// Tests: Zutaten-Stamm (R2.1, ADR-R1 §3) — validateMaster + die ausgelieferte v2/data/ingredients.json.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { readFileSync } from "node:fs";
import { validateMaster, foldName, AISLES } from "../src/data/ingredients.js";
import { UNITS, unitFromText } from "../src/data/units.js";
import { CATALOG } from "../src/data/catalog.js";
import { parseIngredient } from "../src/data/derive.js";
import { splitLine } from "../src/features/shopping/logic.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const master = read("../data/ingredients.json");
const snapshot = read("../data/rezepte.snapshot.json");
const byId = new Map(master.ingredients.map((x) => [x.id, x]));
const LANGS = ["de", "en", "es", "da"];

// ---------- Test-Helfer (KEIN Matcher — der kommt mit R3.1) ----------

/** Alle deutschen Suchformen eines Eintrags: Name, Plural, Aliase. */
const germanForms = (rec) => [rec.names.de, rec.plural?.de, ...(rec.aliases?.de || [])].filter(Boolean).map(foldName);
const FORMS = master.ingredients.flatMap((rec) => germanForms(rec).map((form) => ({ form, rec })));

/** Längste deutsche Form, die als ganzes Wort im Text steht („Kokosmilch“ ≠ „Milch“). */
function findRecord(text) {
  const t = foldName(text);
  let best = null;
  for (const x of FORMS) {
    const i = t.indexOf(x.form);
    if (i < 0 || (best && x.form.length <= best.form.length)) continue;
    const before = t[i - 1], after = t[i + x.form.length];
    if ((before && /\p{L}/u.test(before)) || (after && /\p{L}/u.test(after))) continue;
    best = x;
  }
  return best;
}

/** Einzelteile aller Zutatenzeilen des Basis-Kochbuchs: [{ name, amount, unit, raw }]. */
function snapshotParts() {
  const out = [];
  for (const r of snapshot.recipes) for (const line of r.ingredients || []) for (const part of splitLine(line)) {
    const p = parseIngredient(part);
    const names = p.amount === null ? p.item.split(/\s*,\s*/) : [p.item];
    for (const n of names) {
      const name = n.replace(/\(.*?\)/g, "").replace(/\boptional\b/gi, "").split(",")[0].replace(/\s+/g, " ").trim();
      if (name) out.push({ name, amount: p.amount, unit: p.unit, raw: part });
    }
  }
  return out;
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const good = () => ({
  version: 1, sources: {},
  ingredients: [
    { id: "onion", names: { de: "Zwiebel", en: "onion", es: "cebolla", da: "løg" }, aisle: "vegetables", icon: "🧅",
      base: "g", shop: "piece", units: { piece: 80 }, per100: { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
      source: "estimate", staple: false },
    { id: "olive-oil", names: { de: "Olivenöl", en: "olive oil", es: "aceite de oliva", da: "olivenolie" },
      aliases: { de: ["Öl vom Olivenbaum"] }, aisle: "spices", icon: "🫒", base: "g", shop: "ml",
      units: { tbsp: 14 }, density: 0.92, source: "estimate", staple: true },
  ],
});
/** Erwartet: die Änderung macht die Datei ungültig und nennt die Regel im Fehlertext. */
function rejects(rule, mutate) {
  const m = good();
  mutate(m);
  const res = validateMaster(m);
  assertEqual(res.valid, false, rule + ": sollte ungültig sein");
  assert(res.errors.some((e) => e.startsWith(rule + ":")), `${rule}: kein passender Fehler in ${JSON.stringify(res.errors)}`);
}

// ---------- validateMaster ----------

test("validateMaster: gültige Mini-Datei → valid, keine Fehler", () => {
  assertDeepEqual(validateMaster(good()), { valid: true, errors: [] });
});

test("validateMaster: kein Objekt / keine ingredients-Liste → ungültig statt Absturz", () => {
  for (const bad of [null, undefined, "x", [], {}, { ingredients: {} }, { ingredients: [null] }]) {
    assertEqual(validateMaster(bad).valid, false, JSON.stringify(bad));
  }
});

test("validateMaster: doppelte id", () => rejects("id-unique", (m) => { m.ingredients[1].id = "onion"; }));

test("validateMaster: id nicht im Slug-Format", () => {
  for (const id of ["Onion", "rote-zwiebel-", "-x", "a--b", "zwiebel rot", "öl", ""]) rejects("id-format", (m) => { m.ingredients[0].id = id; });
  rejects("id-format", (m) => { delete m.ingredients[0].id; });
});

test("validateMaster: einer der vier Namen fehlt oder ist leer", () => {
  rejects("names", (m) => { delete m.ingredients[0].names.da; });
  rejects("names", (m) => { m.ingredients[0].names.es = "  "; });
  rejects("names", (m) => { delete m.ingredients[0].names; });
});

test("validateMaster: base ist nicht g oder ml", () => {
  rejects("base", (m) => { m.ingredients[0].base = "piece"; });
  rejects("base", (m) => { delete m.ingredients[0].base; });
});

test("validateMaster: shop ist keine bekannte Einheit", () => rejects("shop", (m) => { m.ingredients[0].shop = "Stück"; }));

test("validateMaster: units-Schlüssel ist keine bekannte Einheit", () => rejects("units-key", (m) => { m.ingredients[0].units.EL = 14; }));

test("validateMaster: units-Wert ist keine positive Zahl", () => {
  for (const v of [0, -5, "80", null, NaN]) rejects("units-value", (m) => { m.ingredients[0].units.piece = v; });
});

test("validateMaster: per100-Wert ist keine Zahl ≥ 0", () => {
  for (const v of [-1, "40", null]) rejects("per100", (m) => { m.ingredients[0].per100.kcal = v; });
});

test("validateMaster: derselbe Name/Alias bei zwei Zutaten (Groß-/Kleinschreibung und Akzente egal)", () => {
  rejects("name-unique", (m) => { m.ingredients[1].names.de = "ZWIEBEL"; });
  rejects("name-unique", (m) => { m.ingredients[1].aliases.es = ["Cebollá"]; });
  rejects("name-unique", (m) => { m.ingredients[0].plural = { de: "Olivenöl" }; });
});

test("validateMaster: gleicher Name in VERSCHIEDENEN Sprachen ist erlaubt (de „Paprika“ ≠ en „paprika“)", () => {
  const m = good();
  m.ingredients[1].names.en = "Zwiebel";
  assertEqual(validateMaster(m).valid, true);
});

test("validateMaster: sammelt alle Fehler, bricht nicht beim ersten ab", () => {
  const m = good();
  m.ingredients[0].base = "x";
  m.ingredients[1].shop = "y";
  assertEqual(validateMaster(m).errors.length, 2);
});

test("foldName: Groß-/Kleinschreibung, Akzente und Leerraum egal", () => {
  assertEqual(foldName("  Crème   Fraîche "), "creme fraiche");
  assertEqual(foldName("ÖL"), foldName("öl"));
  assertEqual(foldName("Öl"), "ol"); // Umlaute werden wie Akzente gefaltet — bewusst
});

// ---------- die ausgelieferte Datei ----------

test("ingredients.json: besteht validateMaster", () => {
  assertDeepEqual(validateMaster(master), { valid: true, errors: [] });
});

test("ingredients.json: Kopf — version 1, sources mit Lizenzhinweisen, mindestens 60 Einträge", () => {
  assertEqual(master.version, 1);
  for (const k of ["usda", "frida", "estimate"]) assert(typeof master.sources[k] === "string" && master.sources[k].length > 10, `sources.${k} fehlt`);
  assert(master.ingredients.length >= 60, `nur ${master.ingredients.length} Einträge`);
});

test("ingredients.json: jeder Eintrag hat die Felder aus ADR §3", () => {
  for (const r of master.ingredients) {
    assert(AISLES[r.aisle], `${r.id}: aisle „${r.aisle}“ unbekannt`);
    assert(typeof r.icon === "string" && r.icon.length > 0, `${r.id}: icon fehlt`);
    assert(r.units && typeof r.units === "object", `${r.id}: units fehlt`);
    assertEqual(typeof r.staple, "boolean", `${r.id}: staple`);
    if (r.density !== undefined) assert(typeof r.density === "number" && r.density > 0, `${r.id}: density`);
    if (r.plural) for (const l of Object.keys(r.plural)) assert(LANGS.includes(l), `${r.id}: plural.${l}`);
    if (r.aliases) for (const l of Object.keys(r.aliases)) assert(LANGS.includes(l) && Array.isArray(r.aliases[l]), `${r.id}: aliases.${l}`);
  }
});

test("ingredients.json: die häufigsten Namen aus dem Issue sind enthalten", () => {
  const top = ["Salz", "Zwiebel", "Mehl", "Knoblauch", "Zucker", "Eier", "Dosentomaten", "Olivenöl", "Milch", "Butter",
    "Zimt", "Zucchini", "Kreuzkümmel", "Backpulver", "Paprika", "Öl", "Paprikapulver", "Käse", "Petersilie",
    "Kichererbsen", "Chiliflocken", "Reis", "Sojasoße", "Zitrone", "Sahne", "Gemüsebrühe", "Wasser"];
  const missing = top.filter((n) => !FORMS.some((x) => x.form === foldName(n)));
  assertDeepEqual(missing, []);
});

test("ingredients.json: deckt die 60 häufigsten Zutatennamen des Basis-Kochbuchs ab", () => {
  const count = new Map();
  for (const p of snapshotParts()) count.set(p.name, (count.get(p.name) || 0) + 1);
  const top60 = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, 60).map(([n]) => n);
  assertEqual(top60.length, 60);
  assertDeepEqual(top60.filter((n) => !findRecord(n)), []);
});

test("ingredients.json: icon und aisle stimmen mit dem catalog.js-Eintrag überein, wo es einen gibt", () => {
  const cat = new Map();
  for (const sec of CATALOG) for (const it of sec.items) cat.set(foldName(it.name.replace(/\s*\(.*?\)\s*/g, " ")), { icon: it.icon, section: sec.name });
  let checked = 0;
  for (const r of master.ingredients) {
    const hit = [r.names.de, r.plural?.de].filter(Boolean).map((n) => cat.get(foldName(n))).find(Boolean);
    if (!hit) continue;
    checked++;
    assertEqual(r.icon, hit.icon, `${r.id}: icon`);
    assertEqual(AISLES[r.aisle], hit.section, `${r.id}: aisle`);
  }
  assert(checked >= 40, `nur ${checked} Einträge gegen den Katalog geprüft`);
});

test("AISLES: jeder Schlüssel zeigt auf einen Gang aus catalog.js", () => {
  const sections = CATALOG.map((s) => s.name);
  for (const [key, name] of Object.entries(AISLES)) assert(sections.includes(name), `${key} → „${name}“ ist kein Katalog-Gang`);
});

test("ingredients.json: Umrechnungen aus dem Issue (Stück, Löffel, Dose)", () => {
  assertEqual(byId.get("onion").units.piece, 80);
  assertEqual(byId.get("egg").units.piece, 55);
  assertEqual(byId.get("garlic").units.clove, 3);
  assertEqual(byId.get("oil").units.tbsp, 14);
  assertEqual(byId.get("honey").units.tbsp, 21);
  assertEqual(byId.get("salt").units.tsp, 6);
  for (const r of master.ingredients) if (/-canned$/.test(r.id)) assert(r.units.can > 0, `${r.id}: can fehlt`);
});

test("ingredients.json: die Einkaufs-Einheit (shop) ist umrechenbar", () => {
  for (const r of master.ingredients) {
    const u = UNITS[r.shop];
    const ok = u.kind === "mass" ? r.base === "g" || r.density > 0
      : u.kind === "volume" ? r.base === "ml" || r.density > 0 || r.units[r.shop] > 0
      : r.units[r.shop] > 0;
    assert(ok, `${r.id}: shop „${r.shop}“ lässt sich nicht in ${r.base} umrechnen`);
  }
});

test("ingredients.json: jede Rezeptzeile mit Menge lässt sich für ihre Zutat in g/ml umrechnen", () => {
  const gaps = new Set();
  for (const p of snapshotParts()) {
    if (p.amount === null) continue;
    let name = p.name, unit = p.unit ? unitFromText(p.unit) : "piece";
    // Parser-Lücke bis R3.1: „1,2 Liter Gemüsebrühe“ → Artikel „Liter Gemüsebrühe“ ohne Einheit.
    if (!p.unit && /^Liter\s/.test(name)) { name = name.replace(/^Liter\s+/, ""); unit = "l"; }
    const hit = findRecord(name);
    if (!hit || !unit) continue;
    // „3 Knoblauchzehen“: die Einheit steckt im Namen.
    if (unit === "piece" && /zehen?$/.test(hit.form)) unit = "clove";
    const r = hit.rec, u = UNITS[unit];
    const ok = u.kind === "vague" ? true
      : u.kind === "mass" ? r.base === "g" || r.density > 0
      : u.kind === "volume" ? r.units[unit] > 0 || r.base === "ml" || r.density > 0
      : r.units[unit] > 0;
    if (!ok) gaps.add(`${r.id}: ${unit}  («${p.raw}»)`);
  }
  assertDeepEqual([...gaps], []);
});

// Nährwerte: kcal ≈ 4·Eiweiß + 4·Kohlenhydrate + 9·Fett. Ausnahmen mit Grund — nichts stillschweigend.
const KCAL_EXCEPTIONS = {
  "cinnamon": "Kohlenhydrate sind zu über der Hälfte Ballaststoffe",
  "paprika-powder": "Kohlenhydrate sind zu etwa zwei Dritteln Ballaststoffe",
  "chili-flakes": "Kohlenhydrate sind zu etwa der Hälfte Ballaststoffe",
  "cocoa": "Kohlenhydrate sind zu über der Hälfte Ballaststoffe",
  "baking-powder": "„Kohlenhydrate“ sind größtenteils Carbonate ohne Brennwert",
};

test("ingredients.json: kcal ist plausibel zu den Makros (25 % oder 20 kcal), Ausnahmen dokumentiert", () => {
  const off = [];
  for (const r of master.ingredients) {
    if (!r.per100) continue;
    const { kcal, protein, carbs, fat } = r.per100;
    for (const v of [kcal, protein, carbs, fat]) assert(typeof v === "number", `${r.id}: per100 unvollständig`);
    const calc = 4 * protein + 4 * carbs + 9 * fat;
    const within = Math.abs(kcal - calc) <= Math.max(20, 0.25 * calc);
    if (within === Boolean(KCAL_EXCEPTIONS[r.id])) off.push(`${r.id}: ${kcal} kcal vs. ${Math.round(calc)} berechnet${within ? " (Ausnahme unnötig)" : ""}`);
  }
  assertDeepEqual(off, []);
  for (const id of Object.keys(KCAL_EXCEPTIONS)) assert(byId.has(id), `Ausnahme für unbekannte id ${id}`);
});

test("ingredients.json: ehrliche Quellen — per100 nie ohne source; nur estimate | usda:<id> | frida:<id>", () => {
  for (const r of master.ingredients) {
    if (r.per100) assert(r.source, `${r.id}: per100 ohne source`);
    if (r.source !== undefined) assert(/^(estimate|usda:\d+|frida:\d+)$/.test(r.source), `${r.id}: source „${r.source}“`);
  }
});

test("ingredients.json: in dieser Lieferung wurde keine Quelle nachgeschlagen → alles estimate", () => {
  // R2.1 wurde ohne Zugriff auf USDA/Frida geschrieben. Wer eine echte id einträgt, nimmt sie hier auf.
  const LOOKED_UP = [];
  const claimed = master.ingredients.filter((r) => r.source && r.source !== "estimate").map((r) => r.id);
  assertDeepEqual(claimed, LOOKED_UP);
});
