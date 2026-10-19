// Flow 2 — Sprachwechsel: UI + Basis-Rezepte wechseln sofort (ohne Reload), gespeichert bleibt
// IMMER kanonisches Deutsch (Drive-Datei wird mit v1 und Projekt-Claude geteilt).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, menu, tab, card, idb } from "../support/app.js";

test("Sprachwechsel DE → ES → DE: Oberfläche und Basis-Rezepte übersetzt, Daten bleiben deutsch", async ({ device }) => {
  const dev = await device();
  const { page } = dev;
  const de = snapshot().recipes.find((r) => r.id === "r01");
  const es = snapshot("es").recipes.find((r) => r.id === "r01");
  expect(es.name).not.toBe(de.name);

  await openApp(page);
  await expect(card(page, de.name)).toBeVisible();

  await menu(page, "settings");
  await page.locator('[data-setlang="es"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator('[data-setlang="es"]')).toHaveClass(/\bon\b/);
  await expect(page.locator("nav.tabbar .tab-lbl").first()).toHaveText("Recetas");

  await tab(page, "cookbook");
  await expect(page.locator(".app-header h1")).toHaveText("Mi recetario");
  await expect(card(page, es.name)).toBeVisible();
  await expect(card(page, de.name)).toHaveCount(0);

  // Favorit in der ES-Ansicht setzen → landet auf dem deutschen Datensatz.
  await card(page, es.name).locator(".card-heart").click();
  await expect.poll(async () => (await idb(page, "recipes", "r01")).favorite).toBe(true);
  const stored = await idb(page, "recipes", "r01");
  expect(stored.name).toBe(de.name);
  expect(stored.ingredients).toEqual(de.ingredients);
  expect(stored.category).toBe(de.category);
  // Regression v2.14.1: nach einem Besuch der Einstellungen schlug jedes Speichern fehl
  // („Speichern fehlgeschlagen“), weil deren Listener nach dem Verlassen weiterliefen.
  expect(dev.dialogs).toEqual([]);

  // Sprache überlebt den Neustart.
  await page.reload();
  await expect(page.locator(".app-header h1")).toHaveText("Mi recetario");

  await menu(page, "settings");
  await page.locator('[data-setlang="de"]').click();
  await tab(page, "cookbook");
  await expect(page.locator(".app-header h1")).toHaveText("Mein Kochbuch");
  await expect(card(page, de.name).locator(".card-heart")).toHaveText("♥");
});
