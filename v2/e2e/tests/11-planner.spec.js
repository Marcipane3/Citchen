// Flow 11 (niedrigere Priorität) — Wochenplan → Einkaufsliste: Woche erzeugen, Tag festhalten,
// Rezept selbst wählen, Plan überlebt Neustart, Zutaten der Woche landen auf der Liste.
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, sheet, shoppingNames } from "../support/app.js";

const days = (page) => page.locator("#plan-days .plan-day");
const dayName = (page, d) => page.locator(`.plan-day[data-day="${d}"] .pd-name`);

test("Wochenplan: erzeugen, festhalten, selbst wählen, Neustart, Einkaufsliste erstellen", async ({ device }) => {
  const dev = await device();
  const { page } = dev;
  const r01 = snapshot().recipes.find((r) => r.id === "r01");
  await openApp(page, "planner");
  await expect(page.locator("#plan-days")).toContainText("Noch kein Wochenplan");

  // Ohne Plan keine Einkaufsliste.
  await page.locator("#shopBtn").click();
  expect(dev.dialogs.at(-1)).toMatchObject({ type: "alert", message: "Erst einen Wochenplan erzeugen." });

  await page.locator("#genBtn").click();
  await expect(days(page)).toHaveCount(7);
  await expect(page.locator("#plan-days .pd-name")).toHaveCount(7);

  // Montag festhalten → bleibt bei „Neue Woche“ gleich.
  const monday = await dayName(page, "Mo").textContent();
  await page.locator('.plan-day[data-day="Mo"] .pd-lock').click();
  await expect(page.locator('.plan-day[data-day="Mo"]')).toHaveClass(/locked/);
  await page.locator("#genBtn").click();
  await expect(page.locator("#genBtn")).toBeEnabled();
  await expect(dayName(page, "Mo")).toHaveText(monday);

  // Dienstag selbst wählen (Picker mit Suche) → gewählt + festgehalten.
  await page.locator('.plan-day[data-day="Di"] .pd-pick').click();
  const picker = await sheet(page);
  await picker.locator("#pick-search").fill("süßkartoffel");
  await picker.locator(`[data-pick="${r01.id}"]`).click();
  await expect(dayName(page, "Di")).toHaveText(r01.name);
  await expect(page.locator('.plan-day[data-day="Di"]')).toHaveClass(/locked/);

  // Plan überlebt den Neustart.
  const week = await page.locator("#plan-days .pd-name").allTextContents();
  await page.reload();
  await expect(page.locator("#plan-days .pd-name")).toHaveText(week);

  // Einkaufsliste aus dem Plan → Bestätigung → Wechsel zur Liste mit den Artikeln.
  await page.locator("#shopBtn").click();
  await expect(page).toHaveURL(/#\/shopping$/);
  const msg = dev.dialogs.at(-1);
  const added = Number((/(\d+) Artikel zur Einkaufsliste hinzugefügt/.exec(msg.message) || [])[1]);
  expect(added).toBeGreaterThan(0);
  await expect.poll(async () => (await shoppingNames(page)).length).toBe(added);
});
