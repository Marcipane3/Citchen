// Flow 13 — v2.17 „Rezepte schneller finden“ (F4): Sortierung rechts im Suchfeld (pro Gerät
// gemerkt), Suche mit mehreren Wörtern ohne Umlaut-/ß-Stolperer, Zeit-Chips ≤ 15 / ≤ 60.
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, card, sheet, idb } from "../support/app.js";

const base = snapshot().recipes;
const firstCardName = (page) => page.locator("#cards .rcard .rname").first().textContent();

test("Sortieren: neueste zuerst beim ersten Öffnen, A–Z und „zuletzt gekocht“, Wahl übersteht den Neustart", async ({ page }) => {
  await openApp(page);
  const sel = page.locator("#sortSel");
  await expect(sel).toHaveValue("newest");
  expect(await firstCardName(page)).toBe(base[base.length - 1].name); // jüngste Basis-id oben

  await sel.selectOption("az");
  const az = [...base].map((r) => r.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  expect(await firstCardName(page)).toBe(az[0]);

  // „Heute gekocht“ bei einem Rezept → mit „zuletzt gekocht“ steht es oben.
  const pick = base[40];
  await page.locator("#search").fill(pick.name);
  await card(page, pick.name).click();
  const d = await sheet(page);
  await d.locator(".cooked").click();
  await expect.poll(async () => (await idb(page, "recipes", pick.id)).cookedCount).toBe((pick.cookedCount || 0) + 1);
  await page.keyboard.press("Escape");
  await page.locator("#search").fill("");
  await sel.selectOption("lastCooked");
  expect(await firstCardName(page)).toBe(pick.name);

  await page.reload();
  await expect(page.locator("#sortSel")).toHaveValue("lastCooked");
  expect(await firstCardName(page)).toBe(pick.name);
});

test("Suche: mehrere Wörter müssen alle passen; ß und Umlaute egal", async ({ page }) => {
  await openApp(page);
  const curry = base.find((r) => r.id === "r01"); // Süßkartoffel-Curry mit Kichererbsen
  await page.locator("#search").fill("susskartoffel kichererbsen");
  await expect(card(page, curry.name)).toBeVisible();
  const n = await page.locator("#cards .rcard").count();
  expect(n).toBeGreaterThan(0);
  for (const name of await page.locator("#cards .rcard .rname").allTextContents()) {
    const r = base.find((x) => x.name === name);
    const hay = [r.name, ...(r.ingredients || []), r.tips, r.cuisine].join(" ").toLowerCase().replace(/ß/g, "ss").replace(/ü/g, "u");
    expect(hay).toContain("susskartoffel");
    expect(hay).toContain("kichererbsen");
  }
  await page.locator("#search").fill("susskartoffel xyzunbekannt");
  await expect(page.locator("#cards .rcard")).toHaveCount(0);
});

test("Zeit-Chips: ≤ 15 Min zeigt nur schnelle Rezepte", async ({ page }) => {
  await openApp(page);
  const chip = page.locator('[data-chip="__t15"]');
  await expect(chip).toBeVisible();
  await expect(page.locator('[data-chip="__t60"]')).toBeVisible();
  await chip.click();
  const shown = await page.locator("#cards .rcard").count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(base.length);
});
