// Flow 14 — G2.3: ☰ → „Rezepte aus Datei importieren“ (Dateiwahl, Ergebnis-Blatt, Persistenz, Fehler, offline).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, waitForCookbook, menu, sheet } from "../support/app.js";

const base = snapshot().recipes;
const recipe = (id, name) => ({ id, name, category: "Vegetarische Hauptgerichte", ingredients: ["1 Zwiebel"], steps: ["Kochen"], time: "10 Min" });
const jsonFile = (recipes) => ({ name: "import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 3, updated: "2026-10-27T00:00:00Z", recipes })) });

async function pick(page, file) {
  const chooser = page.waitForEvent("filechooser");
  await menu(page, "__importFile");
  await (await chooser).setFiles(file);
  return sheet(page);
}

test("Import: Menüeintrag öffnet Dateiwahl für .json", async ({ page }) => {
  await openApp(page);
  await page.locator("#menuBtn").click();
  await expect(page.locator('.sheet .menu-item[data-go="__importFile"]')).toContainText("Rezepte aus Datei importieren");
  const chooser = page.waitForEvent("filechooser");
  await page.locator('.sheet .menu-item[data-go="__importFile"]').click();
  expect(await chooser).toBeTruthy();
});

test("Import: Ergebnis-Blatt, neue Rezepte im Kochbuch und nach Reload, neue ID bei Kollision, offline", async ({ page, context }) => {
  await openApp(page);
  await waitForCookbook(page);
  await context.setOffline(true);
  const s = await pick(page, jsonFile([recipe("imp-1", "Importtopf Alpha"), { id: "kaputt" }, { ...recipe(base[0].id, "Kollisionsrezept") }]));
  await expect(s.locator(".import-summary")).toHaveText("2 importiert · 1 übersprungen · 1 mit neuer ID");
  await expect(s.locator(".import-reasons li")).toHaveCount(1);
  await s.locator(".import-done").click();
  await page.locator("#search").fill("Importtopf Alpha");
  await expect(page.locator("#cards .rcard")).toHaveCount(1);
  await page.locator("#search").fill("Kollisionsrezept");
  await expect(page.locator("#cards .rcard")).toHaveCount(1);
  await page.reload();
  await waitForCookbook(page);
  await page.locator("#search").fill("Importtopf Alpha");
  await expect(page.locator("#cards .rcard")).toHaveCount(1);
  // Das Original mit der kollidierenden ID blieb unverändert.
  await page.locator("#search").fill(base[0].name);
  await expect(page.locator("#cards .rcard").first()).toBeVisible();
});

test("Import: Round-Trip Export → Import ergibt dieselben Felder", async ({ page }) => {
  await openApp(page);
  await waitForCookbook(page);
  await page.evaluate(() => { delete navigator.canShare; });
  const dl = page.waitForEvent("download");
  await menu(page, "__exportFile");
  const path = await (await dl).path();
  const s = await pick(page, path);
  await expect(s.locator(".import-summary")).toContainText(`${base.length} importiert · 0 übersprungen · ${base.length} mit neuer ID`);
});

test("Import: ungültige Datei zeigt Fehler und ändert nichts", async ({ page }) => {
  await openApp(page);
  await waitForCookbook(page);
  const before = await page.locator("#cards .rcard").count();
  const s = await pick(page, { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{kein json") });
  await expect(s.locator(".import-summary")).toContainText("Nichts importiert");
  await s.locator(".import-done").click();
  await expect(page.locator("#cards .rcard")).toHaveCount(before);
});
