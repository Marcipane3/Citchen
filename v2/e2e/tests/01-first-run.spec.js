// Flow 1 — Erststart: frisches Gerät, keine Sprache gewählt, kein Konto, kein Key.
import { test, expect, CURRENT_BUILD, snapshot } from "../support/fixtures.js";
import { idb } from "../support/app.js";

test("Erststart: Sprachauswahl, Basis-Rezepte aus dem Snapshot, Tab-Leiste, Build-Stempel", async ({ device }) => {
  const { page } = await device({ lang: null });
  await page.goto("/v2/");

  // Sprachauswahl erscheint vor allem anderen und bietet alle vier Sprachen.
  const modal = page.locator(".lang-overlay");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".lang-btn")).toHaveCount(4);
  await modal.locator('[data-lang="en"]').click();
  await expect(modal).toHaveCount(0);

  // Kochbuch in der gewählten Sprache, gefüllt aus dem gebündelten Snapshot.
  const base = snapshot().recipes;
  await expect(page.locator(".app-header h1")).toHaveText("My Cookbook");
  await expect(page.locator(".app-header .sub")).toHaveText(`${base.length} recipes`);
  await expect(page.locator("#cards .rcard")).toHaveCount(base.length);
  await expect(page.locator("nav.tabbar .tab-lbl")).toHaveText(["Recipes", "Stock", "Shopping", "Plan", "AI"]);
  await expect(page.locator(".build-line")).toHaveText(`Build ${CURRENT_BUILD}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // Lokal gespeichert: IndexedDB enthält die Sammlung, Herkunft = Snapshot, nichts „dirty“.
  expect((await idb(page, "recipes")).length).toBe(base.length);
  const meta = await idb(page, "kv", "collection");
  expect(meta.value).toMatchObject({ source: "snapshot", dirty: false, fileId: null });

  // Zweiter Start: keine Sprachauswahl mehr.
  await page.reload();
  await expect(page.locator("#cards .rcard").first()).toBeVisible();
  await expect(page.locator(".lang-overlay")).toHaveCount(0);
});

test("Ohne Anmeldung: Einkaufsliste bleibt lokal, Anmelden wird angeboten", async ({ page }) => {
  await page.goto("/v2/#/shopping");
  await expect(page.locator("#shop-sync .sl-login")).toBeVisible();
  await expect(page.locator("#shop-sync")).toContainText("Nur auf diesem Gerät");
});
