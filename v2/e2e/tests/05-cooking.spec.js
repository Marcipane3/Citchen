// Flow 5 — Kochmodus: Vollbild ohne Tab-Leiste, Portionen skalieren, Schritte abhaken
// (überlebt Neustart), Schritt-für-Schritt-Ansicht, Timer läuft ab.
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, openRecipe } from "../support/app.js";

const R = snapshot().recipes.find((r) => r.id === "r01"); // Süßkartoffel-Curry, ~4 Portionen, 7 Schritte

test("Kochmodus: aus dem Rezept öffnen, skalieren, abhaken, Seitenansicht, schließen", async ({ page }) => {
  await openApp(page);
  const detail = await openRecipe(page, R.name);
  await detail.locator(".act-cook").click();

  await expect(page).toHaveURL(/#\/cook\/r01$/);
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.locator(".cook h2")).toHaveText(R.name);
  await expect(page.locator("body")).toHaveClass(/no-tabbar/);
  await expect(page.locator(".cook-step")).toHaveCount(R.steps.length);
  await expect(page.locator(".cook-ing")).toHaveCount(R.ingredients.length);

  // Portionen 4 → 2: Mengen halbiert.
  await expect(page.locator(".scaler .val")).toHaveText("4 Portionen");
  await page.locator('[data-scale="-"]').click();
  await page.locator('[data-scale="-"]').click();
  await expect(page.locator(".scaler .val")).toHaveText("2 Portionen");
  await expect(page.locator(".scaler .note")).toHaveText("Mengen angepasst");
  await expect(page.locator(".cook-ing").nth(1)).toContainText("200g Kichererbsen");

  // Schritt 1 + erste Zutat abhaken → nach Neustart weiterhin abgehakt (IndexedDB).
  await page.locator('.cook-step[data-step="0"] .cook-text').click();
  await page.locator('.cook-ing[data-ing="0"]').click();
  await expect(page.locator('.cook-step[data-step="0"]')).toHaveClass(/done/);
  await page.reload();
  await expect(page.locator('.cook-step[data-step="0"]')).toHaveClass(/done/);
  await expect(page.locator('.cook-ing[data-ing="0"]')).toHaveClass(/done/);
  await expect(page.locator('.cook-step[data-step="1"]')).not.toHaveClass(/done/);

  // Schritt für Schritt
  await page.locator('.ms[data-mode="pager"]').click();
  await expect(page.locator(".pager-count")).toHaveText(`Schritt 1 / ${R.steps.length}`);
  await expect(page.locator(".pg-prev")).toBeDisabled();
  await expect(page.locator(".pg-check")).toHaveText("✓ erledigt");
  await page.locator(".pg-next").click();
  await expect(page.locator(".pager-count")).toHaveText(`Schritt 2 / ${R.steps.length}`);
  await expect(page.locator(".pager-text")).toHaveText(R.steps[1]);
  await page.locator(".pg-check").click();
  await expect(page.locator(".pager-step")).toHaveClass(/done/);

  // Fortschritt zurücksetzen (Bestätigung wird akzeptiert)
  await page.locator(".reset-prog").click();
  await expect(page.locator(".pager-step")).not.toHaveClass(/done/);

  // Schließen → Kochbuch, Tab-Leiste wieder da.
  await page.locator(".cook-done-btn").click();
  await expect(page).toHaveURL(/#\/cookbook$/);
  await expect(page.locator("body")).not.toHaveClass(/no-tabbar/);
  await expect(page.locator("nav.tabbar")).toBeVisible();
});

test("Kochmodus: Schritt-Timer zählt herunter und meldet „fertig“", async ({ page }) => {
  await page.clock.install();
  await openApp(page, "cook/r01");
  const timer = page.locator('.cook-step[data-step="2"] .step-timer'); // „Gewürze …, 1 Min anrösten.“
  await expect(timer).toHaveText("⏱ 1′");
  await timer.click();
  await expect(timer).toHaveClass(/running/);
  await expect(timer).toHaveText("⏱ 1:00");
  await page.clock.runFor(30_000);
  await expect(timer).toHaveText("⏱ 0:30");
  await page.clock.runFor(31_000);
  await expect(timer).toHaveClass(/fired/);
  await expect(timer).not.toHaveText(/⏱ \d/);
  // Timer-Klick hakt den Schritt nicht ab.
  await expect(page.locator('.cook-step[data-step="2"]')).not.toHaveClass(/done/);
});

test("Kochmodus mit unbekannter id → zurück zum Kochbuch", async ({ page }) => {
  await openApp(page, "cook/gibt-es-nicht");
  await expect(page).toHaveURL(/#\/cookbook$/);
});
