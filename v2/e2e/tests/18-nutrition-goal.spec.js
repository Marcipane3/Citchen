// Flow 18 — Ernährungsziel (M1, #138): in den Einstellungen setzen, neu laden, zurücksetzen.
import { test, expect } from "../support/fixtures.js";
import { openApp, menu } from "../support/app.js";

test("M1: Voreinstellung + 2000 kcal speichern, nach Reload sichtbar; Reset leert", async ({ page }) => {
  await openApp(page);
  await menu(page, "settings");
  await expect(page.locator("#goal-card")).toContainText(/medizinisch/i);
  await page.locator("#goal-preset").selectOption("highProtein");
  await page.locator("#goal-kcal").fill("2000");
  await page.locator("#goal-protein").fill("120");
  await page.locator("#goal-save").click();
  await expect(page.locator("#goal-status")).toHaveText(/gespeichert/i);

  await page.reload();
  await menu(page, "settings");
  await expect(page.locator("#goal-preset")).toHaveValue("highProtein");
  await expect(page.locator("#goal-kcal")).toHaveValue("2000");
  await expect(page.locator("#goal-protein")).toHaveValue("120");

  await page.locator("#goal-reset").click();
  await expect(page.locator("#goal-preset")).toHaveValue("balanced");
  await expect(page.locator("#goal-kcal")).toHaveValue("");
  await expect(page.locator("#goal-protein")).toHaveValue("");
  await page.reload();
  await menu(page, "settings");
  await expect(page.locator("#goal-kcal")).toHaveValue("");
});
