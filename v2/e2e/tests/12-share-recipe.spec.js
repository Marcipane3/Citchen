// Flow 12 — G2.4: Rezept-Detail → „Teilen“ kopiert lesbares englisches Markdown (Zwischenablage-Pfad).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, waitForCookbook, openRecipe } from "../support/app.js";

const r = snapshot().recipes.find((x) => x.name && x.ingredients?.length && x.steps?.length);

test("Detail: Teilen ohne Share-Sheet kopiert Markdown und bestätigt „Kopiert“", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    delete navigator.share; // Headless: Zwischenablage-Pfad
    window.__clip = null;
    navigator.clipboard.writeText = async (x) => { window.__clip = x; };
  });
  await waitForCookbook(page);
  const s = await openRecipe(page, r.name);
  const btn = s.locator(".act-share");
  await btn.click();
  await expect(btn).toHaveText(/✓/);
  const md = await page.evaluate(() => window.__clip);
  expect(md).toContain(`# ${r.name}`);
  expect(md).toContain("## Ingredients");
  expect(md).toContain("## Instructions");
  expect(md).not.toContain("Zutaten");
});
