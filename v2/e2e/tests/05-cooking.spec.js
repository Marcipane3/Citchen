// Flow 5 — Kochmodus: Vollbild ohne Tab-Leiste, Portionen skalieren, Schritte abhaken
// (überlebt Neustart), Schritt-für-Schritt-Ansicht, Timer läuft ab.
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, openRecipe, idb } from "../support/app.js";

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
  await expect(page.locator('.cook-ing[data-ing="0"]')).toHaveClass(/done/);
  // Erst neu laden, wenn beide Haken in IndexedDB stehen (das Speichern ist asynchron).
  await expect.poll(async () => {
    const p = (await idb(page, "kv", "progress:r01"))?.value;
    return !!(p && p.steps[0] && p.ings[0]);
  }).toBe(true);
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

test("Kochmodus merkt sich die Portionen pro Rezept (QW-2): ändern → schließen → wieder öffnen", async ({ page }) => {
  await openApp(page, "cook/r01");
  await expect(page.locator(".scaler .val")).toHaveText("4 Portionen");
  await expect(page.locator(".scaler .note")).toHaveCount(0);
  await page.locator('[data-scale="-"]').click();
  await page.locator('[data-scale="-"]').click();
  await expect(page.locator(".scaler .val")).toHaveText("2 Portionen");

  // Schließen und aus dem Rezept wieder öffnen → gleiche Portionen, Mengen skaliert, Hinweis da.
  await page.locator(".cook-top .close").click();
  await expect(page).toHaveURL(/#\/cookbook$/);
  const detail = await openRecipe(page, R.name);
  await detail.locator(".act-cook").click();
  await expect(page.locator(".scaler .val")).toHaveText("2 Portionen");
  await expect(page.locator(".scaler .note")).toHaveText("Mengen angepasst");
  await expect(page.locator(".cook-ing").nth(1)).toContainText("200g Kichererbsen");

  // Nur dieses Rezept, nur auf dem Gerät: ein anderes Rezept öffnet ohne „Mengen angepasst“.
  const other = snapshot().recipes.find((r) => r.id !== "r01" && (r.ingredients || []).length);
  await page.goto("/v2/#/cook/" + other.id);
  await expect(page.locator(".cook h2")).toHaveText(other.name);
  await expect(page.locator(".scaler .note")).toHaveCount(0);

  // Zurück auf die eigene Portionsgröße → gespeicherter Wert weg, auch nach Neustart.
  await page.goto("/v2/#/cook/r01");
  await expect(page.locator(".scaler .val")).toHaveText("2 Portionen");
  await page.locator('[data-scale="+"]').click();
  await page.locator('[data-scale="+"]').click();
  await expect(page.locator(".scaler .val")).toHaveText("4 Portionen");
  expect(await page.evaluate(() => localStorage.getItem("kochv2_cookPortions"))).toBeNull();
  await page.reload();
  await expect(page.locator(".scaler .val")).toHaveText("4 Portionen");
  await expect(page.locator(".scaler .note")).toHaveCount(0);
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

// QW-8 (#64): Timer-Zustand lebt außerhalb des DOM — Neuzeichnen stoppt keinen Timer mehr.
// Zählt Vibrationen statt echter Töne: der Alarm (Piepton + Vibration) ist ein Aufruf.
async function countAlarms(page) {
  await page.addInitScript(() => {
    window.__alarms = 0;
    Object.defineProperty(Navigator.prototype, "vibrate", { configurable: true, value: () => { window.__alarms++; return true; } });
  });
}
const alarms = (page) => page.evaluate(() => window.__alarms);

test("Kochmodus: Schritt-Timer läuft weiter über Schrittwechsel, Portionen und Ansichtswechsel (QW-8)", async ({ page }) => {
  await page.clock.install();
  await openApp(page, "cook/r01");
  await page.locator('.ms[data-mode="pager"]').click();
  await page.locator(".pg-next").click();
  await page.locator(".pg-next").click();
  await expect(page.locator(".pager-count")).toHaveText(`Schritt 3 / ${R.steps.length}`); // „… 1 Min anrösten.“
  const timer = page.locator(".pager-timer");
  await timer.click();
  await expect(timer).toHaveClass(/running/);
  await expect(timer).toHaveText("⏱ 1:00");
  await page.clock.runFor(10_000);
  await expect(timer).toHaveText("⏱ 0:50");

  // Nächster Schritt: dessen Timer läuft nicht; der von Schritt 3 zählt im Hintergrund weiter.
  await page.locator(".pg-next").click();
  await expect(page.locator(".pager-count")).toHaveText(`Schritt 4 / ${R.steps.length}`);
  await expect(timer).not.toHaveClass(/running/);
  await page.clock.runFor(10_000);
  await page.locator(".pg-prev").click();
  await expect(page.locator(".pager-count")).toHaveText(`Schritt 3 / ${R.steps.length}`);
  await expect(timer).toHaveClass(/running/);
  await expect(timer).toHaveText("⏱ 0:40");

  // Portionen ändern stoppt den Timer nicht und setzt ihn nicht zurück.
  await page.locator('[data-scale="-"]').click();
  await expect(page.locator(".scaler .val")).toHaveText("3 Portionen");
  await expect(timer).toHaveClass(/running/);
  await expect(timer).toHaveText("⏱ 0:40");
  await page.clock.runFor(5_000);
  await expect(timer).toHaveText("⏱ 0:35");

  // Wechsel in die Übersicht: derselbe Timer, am richtigen Schritt.
  await page.locator('.ms[data-mode="list"]').click();
  const listTimer = page.locator('.cook-step[data-step="2"] .step-timer');
  await expect(listTimer).toHaveClass(/running/);
  await expect(listTimer).toHaveText("⏱ 0:35");
  await expect(page.locator(".step-timer.running")).toHaveCount(1);

  // Klick auf den laufenden Timer stoppt ihn (wie bisher).
  await listTimer.click();
  await expect(listTimer).not.toHaveClass(/running/);
  await expect(listTimer).toHaveText("⏱ 1′");
});

test("Kochmodus: Timer läuft ab, während ein anderer Schritt gezeigt wird → Alarm + „fertig“ bei Rückkehr (QW-8)", async ({ page }) => {
  await countAlarms(page);
  await page.clock.install();
  await openApp(page, "cook/r01");
  await page.locator('.ms[data-mode="pager"]').click();
  await page.locator(".pg-next").click();
  await page.locator(".pg-next").click();
  const timer = page.locator(".pager-timer");
  await timer.click();
  await expect(timer).toHaveText("⏱ 1:00");
  await page.locator(".pg-next").click();
  await expect(page.locator(".pager-count")).toHaveText(`Schritt 4 / ${R.steps.length}`);
  expect(await alarms(page)).toBe(0);
  await page.clock.runFor(61_000);
  expect(await alarms(page)).toBe(1); // signalisiert, obwohl Schritt 3 nicht gezeigt wird
  await expect(timer).not.toHaveClass(/fired/); // Schritt 4 hat keinen abgelaufenen Timer
  await page.locator(".pg-prev").click();
  await expect(timer).toHaveClass(/fired/);
  await expect(timer).not.toHaveText(/⏱ \d/);
  await page.clock.runFor(30_000);
  expect(await alarms(page)).toBe(1); // genau ein Alarm pro Ablauf
});

test("Kochmodus verlassen stoppt alle Timer — kein Alarm mehr danach (QW-8)", async ({ page }) => {
  await countAlarms(page);
  await page.clock.install();
  await openApp(page, "cook/r01");
  const timer = page.locator('.cook-step[data-step="2"] .step-timer');
  await timer.click();
  await expect(timer).toHaveClass(/running/);
  await page.clock.runFor(10_000);
  await page.locator(".cook-top .close").click();
  await expect(page).toHaveURL(/#\/cookbook$/);
  await page.clock.runFor(120_000);
  expect(await alarms(page)).toBe(0);
  // Wieder öffnen: frischer Zustand, nichts läuft, nichts ist „fertig“.
  await page.goto("/v2/#/cook/r01");
  await expect(timer).toHaveText("⏱ 1′");
  await expect(page.locator(".step-timer.running, .step-timer.fired")).toHaveCount(0);
});

test("Kochmodus mit unbekannter id → zurück zum Kochbuch", async ({ page }) => {
  await openApp(page, "cook/gibt-es-nicht");
  await expect(page).toHaveURL(/#\/cookbook$/);
});
