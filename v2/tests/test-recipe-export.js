// Tests: data/recipeExport.js + features/cookbook/export.js (G2.2) — Export-Datei.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { buildExportFile, exportFileName } from "../src/data/recipeExport.js";
import { deliverExportFile } from "../src/features/cookbook/export.js";

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

test("deliver: AbortError ist still, andere Fehler werden geworfen", async () => {
  await withNavigator({ canShare: () => true, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } },
    async () => { await deliverExportFile({ version: 3, recipes: [] }, "a.json"); });
  let threw = false;
  await withNavigator({ canShare: () => true, share: async () => { throw new Error("boom"); } }, async () => {
    try { await deliverExportFile({ version: 3, recipes: [] }, "a.json"); } catch { threw = true; }
  });
  assert(threw, "anderer Fehler wird geworfen");
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
