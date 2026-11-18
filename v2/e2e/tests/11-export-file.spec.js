// Flow 11b — G2.2: ☰ → „Ganzes Kochbuch als Import-Datei“ lädt rezepte-förmige JSON ohne persönliche Felder.
import { readFileSync } from "node:fs";
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, menu } from "../support/app.js";

const base = snapshot().recipes;

test("Menü: ganzes Kochbuch als Import-Datei — alle Rezepte, keine persönlichen Felder", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { delete navigator.canShare; }); // Headless: Download statt Share-Sheet
  const dl = page.waitForEvent("download");
  await menu(page, "__exportFile");
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^citchen-rezepte-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(readFileSync(await d.path(), "utf8"));
  expect(file.version).toBe(3);
  expect(file.recipes).toHaveLength(base.length);
  for (const r of file.recipes) {
    for (const k of ["photos", "feedback", "favorite", "rating", "cookedCount", "lastCooked"]) expect(r).not.toHaveProperty(k);
  }
});
