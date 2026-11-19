// Tests: data/recipeExport.js + features/cookbook/export.js (G2.2) — Export-Datei.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { buildExportFile, exportFileName } from "../src/data/recipeExport.js";
import { RECIPE_FIELDS, PERSONAL_FIELDS } from "../src/data/schema.js";
import { deliverExportFile, exportFile, exportMarkdown } from "../src/features/cookbook/export.js";
import { localizeRecipes, buildLangMap } from "../src/data/baseLang.js";

const full = () => ({
  id: "r1", name: "Süßkartoffel-Curry", category: "Vegetarische Hauptgerichte", time: "30 Min", servings: "2",
  ingredients: ["1 Süßkartoffel"], steps: ["Kochen"], tips: "Scharf", tags: ["curry"], effort: "alltag",
  difficulty: "einfach", cuisine: "Indisch", season: "Herbst", image: "https://x/y.jpg",
  photos: [{ id: "d1", added: "x" }], feedback: "toll", favorite: true, rating: 5, cookedCount: 3, lastCooked: "2026-10-01",
});

test("export: Dateiform {version:3, updated, recipes}, Inhaltsfelder bleiben inkl. image", () => {
  const f = buildExportFile([full()], new Date("2026-10-31T10:00:00Z"));
  assertEqual(f.version, 3);
  assertEqual(f.updated, "2026-10-31T10:00:00.000Z");
  assertEqual(f.recipes.length, 1);
  const r = f.recipes[0];
  for (const k of ["name", "category", "time", "servings", "ingredients", "steps", "tips", "tags", "effort", "difficulty", "cuisine", "season", "image"]) {
    assertDeepEqual(r[k], full()[k], k);
  }
});

test("export: photos, feedback, favorite, rating, cookedCount, lastCooked fehlen (G2-Q1)", () => {
  const r = buildExportFile([full()]).recipes[0];
  for (const k of ["photos", "feedback", "favorite", "rating", "cookedCount", "lastCooked"]) {
    assert(!(k in r), k + " darf nicht in der Datei stehen");
  }
});

test("export: Eingabe bleibt unverändert, Werte bleiben kanonisch deutsch", () => {
  const input = [full()];
  const before = JSON.stringify(input);
  const out = buildExportFile(input);
  assertEqual(JSON.stringify(input), before);
  assertEqual(out.recipes[0].category, "Vegetarische Hauptgerichte");
  out.recipes[0].ingredients.push("x");
  assertEqual(input[0].ingredients.length, 1);
});

test("export: Dateiname — ein Rezept bereinigt, Fallback, mehrere mit Datum", () => {
  assertEqual(exportFileName([{ name: 'Mac / "Cheese": a*b?<c>|d\\e' }]), "Mac-Cheese-abcde.citchen.json");
  assertEqual(exportFileName([{ name: "Süßkartoffel Curry" }]), "Süßkartoffel-Curry.citchen.json");
  assertEqual(exportFileName([{ name: "///" }]), "rezept.citchen.json");
  const long = exportFileName([{ name: "a".repeat(100) }]);
  assertEqual(long, "a".repeat(60) + ".citchen.json");
  assertEqual(exportFileName([{ name: "A" }, { name: "B" }], new Date("2026-10-31T12:00:00Z")), "citchen-rezepte-2026-10-31.json");
});

async function withNavigator(stub, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: stub, configurable: true, writable: true });
  try { await fn(); } finally {
    if (had) Object.defineProperty(globalThis, "navigator", had); else delete globalThis.navigator;
  }
}

test("deliver: canShare({files}) true → navigator.share mit der Datei", async () => {
  let shared = null;
  await withNavigator({ canShare: () => true, share: async (d) => { shared = d; } }, async () => {
    await deliverExportFile({ version: 3, recipes: [] }, "x.citchen.json");
  });
  assertEqual(shared.files.length, 1);
  assertEqual(shared.files[0].name, "x.citchen.json");
});

function withDownloadStub() {
  const clicks = [];
  const realDoc = globalThis.document, realURL = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }) };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
  return { clicks, restore() { globalThis.document = realDoc; URL.createObjectURL = realURL; URL.revokeObjectURL = realRevoke; } };
}

test("deliver: AbortError ist still (kein Download, kein Fehler)", async () => {
  const dl = withDownloadStub();
  try {
    await withNavigator({ canShare: () => true, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } },
      async () => { await deliverExportFile({ version: 3, recipes: [] }, "a.json"); });
  } finally { dl.restore(); }
  assertDeepEqual(dl.clicks, []);
});

test("deliver: anderer Share-Fehler (z. B. NotAllowedError) → Download statt Fehler (BH-15)", async () => {
  const dl = withDownloadStub();
  let threw = false;
  try {
    await withNavigator({ canShare: () => true, share: async () => { const e = new Error("boom"); e.name = "NotAllowedError"; throw e; } },
      async () => { try { await deliverExportFile({ version: 3, recipes: [] }, "a.citchen.json"); } catch { threw = true; } });
  } finally { dl.restore(); }
  assert(!threw, "Share-Fehler darf nicht geworfen werden");
  assertDeepEqual(dl.clicks, ["a.citchen.json"]);
});

test("exportFile: Builder-Fehler wirft nie synchron, sondern als abgelehntes Promise (BH-15)", async () => {
  const view = localizeRecipes([full()], buildLangMap([{ id: "r1", name: "Translated", ingredients: ["x"], steps: ["y"], tips: "z" }]));
  let p;
  try { p = exportFile(view); } catch { assert(false, "exportFile wirft synchron"); }
  assert(p && typeof p.then === "function", "exportFile liefert kein Promise");
  let rejected = false;
  await p.catch(() => { rejected = true; });
  assert(rejected, "Promise wird nicht abgelehnt");
});

test("deliver: ohne canShare → Download-Link mit Dateiname", async () => {
  const clicks = [];
  const realDoc = globalThis.document, realURL = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }) };
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
  try {
    await withNavigator({}, async () => { await deliverExportFile({ version: 3, recipes: [] }, "d.citchen.json"); });
  } finally {
    globalThis.document = realDoc; URL.createObjectURL = realURL; URL.revokeObjectURL = realRevoke;
  }
  assertDeepEqual(clicks, ["d.citchen.json"]);
});

test("export: origin ist Vertragsfeld, nicht persönlich, und bleibt in der Datei (#72)", () => {
  assert(RECIPE_FIELDS.includes("origin"), "origin fehlt in RECIPE_FIELDS");
  assert(!PERSONAL_FIELDS.includes("origin"), "origin darf kein persönliches Feld sein");
  const [mine, baseRecipe] = buildExportFile([{ ...full(), origin: "user" }, { ...full(), id: "r2" }]).recipes;
  assertEqual(mine.origin, "user");
  assert(!("origin" in baseRecipe), "Grundrezept bekommt beim Export kein origin");
});

// DG-17: der Marker überlebt Kopien, erreicht aber nie Datei oder Speicher.
const localizedCopy = () => localizeRecipes([full()], buildLangMap([{ id: "r1", name: "Translated", ingredients: ["x"], steps: ["y"], tips: "z" }]))[0];
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

test("DG-17: lokalisierte Kopie per {...r} wird von buildExportFile und exportMarkdown abgelehnt", () => {
  const copy = { ...localizedCopy() };
  assert(throws(() => buildExportFile([copy])), "buildExportFile lässt {...r}-Kopie durch");
  assert(throws(() => exportMarkdown([copy])), "exportMarkdown lässt {...r}-Kopie durch");
});

test("DG-17: lokalisierte Kopie per Object.assign({}, r) wird von buildExportFile und exportMarkdown abgelehnt", () => {
  const copy = Object.assign({}, localizedCopy());
  assert(throws(() => buildExportFile([copy])), "buildExportFile lässt Object.assign-Kopie durch");
  assert(throws(() => exportMarkdown([copy])), "exportMarkdown lässt Object.assign-Kopie durch");
});

test("DG-17: Marker erscheint nie in JSON/structuredClone; deutsche Rezepte exportieren unverändert", () => {
  const view = localizedCopy();
  const json = JSON.stringify(view);
  assertDeepEqual(Object.keys(JSON.parse(json)).sort(), Object.keys(full()).sort());
  assertEqual(Object.getOwnPropertySymbols(structuredClone(view)).length, 0);
  assertEqual(Object.getOwnPropertySymbols(JSON.parse(json)).length, 0);
  const de = [full(), { ...full(), id: "r2" }];
  // Feste Uhr: sonst kann `updated` zwischen den beiden Aufrufen um 1 ms springen (#95).
  const now = new Date("2026-01-01T00:00:00Z");
  assertEqual(JSON.stringify(buildExportFile(de, now)), JSON.stringify(buildExportFile(JSON.parse(JSON.stringify(de)), now)));
  assertEqual(JSON.stringify(buildExportFile(de, now)).includes("localized"), false);
});
