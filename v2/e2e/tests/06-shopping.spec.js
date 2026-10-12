// Flow 6 — Einkaufsliste: eigene + Katalog-Artikel, Mengen, abhaken, aufräumen mit Rückgängig,
// Tab-Badge, Neustart; Rezept-Zutaten auf die Liste (Vorrat wird übersprungen).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, openRecipe, shoppingNames, idb, tab } from "../support/app.js";

const badge = (page) => page.locator('nav.tabbar .tab[data-go="shopping"] .tab-badge');
const row = (page, name) => page.locator("#shop-list .sl-item").filter({ has: page.locator(".sl-name", { hasText: name }) });

test("Einkaufsliste: hinzufügen, Menge, abhaken, aufräumen, Rückgängig, Neustart", async ({ page }) => {
  await openApp(page, "shopping");
  await expect(page.locator("#shop-sub")).toHaveText("leer");
  await expect(badge(page)).toHaveCount(0);

  // Eigener Artikel per Enter
  await page.locator("#shop-custom").fill("Hafermilch");
  await page.locator("#shop-custom").press("Enter");
  await expect(row(page, "Hafermilch")).toHaveCount(1);
  await expect(page.locator("#shop-sub")).toHaveText("1 offen");
  await expect(badge(page)).toHaveText("1");

  // Katalog: Sektion aufklappen, Artikel zweimal antippen → Menge 2
  await page.locator('#shop-catalog .cat-head[data-sec="Gemüse"]').click();
  const karotten = page.locator('#shop-catalog .cat-item[data-name="Karotten"]');
  await karotten.click();
  await karotten.click();
  await expect(karotten.locator(".ci-badge")).toHaveText("2");
  await expect(row(page, "Karotten").locator(".sl-qty")).toHaveText("2");
  await row(page, "Karotten").locator(".sl-inc").click();
  await expect(row(page, "Karotten").locator(".sl-qty")).toHaveText("3");
  await row(page, "Karotten").locator(".sl-dec").click();
  await expect(row(page, "Karotten").locator(".sl-qty")).toHaveText("2");
  await expect(badge(page)).toHaveText("2");

  // Abhaken → zählt als erledigt, Badge zählt nur Offene
  await row(page, "Hafermilch").locator(".sl-name").click();
  await expect(row(page, "Hafermilch")).toHaveClass(/done/);
  await expect(page.locator("#shop-sub")).toHaveText("1 offen · 1 erledigt");
  await expect(badge(page)).toHaveText("1");

  // Erledigte entfernen → Tombstone (damit die Löschung den Partner erreicht)
  await page.locator(".sl-clear").click();
  await expect(row(page, "Hafermilch")).toHaveCount(0);
  await expect.poll(async () => (await idb(page, "lists", "current")).items.find((x) => x.name === "Hafermilch")?.deleted).toBe(true);

  // Alles löschen → Rückgängig bringt die Artikel zurück
  await page.locator(".sl-clear-all").click();
  await expect(page.locator("#shop-list .sl-undo")).toContainText("Liste geleert.");
  await expect(badge(page)).toHaveCount(0);
  await page.locator(".sl-undo-btn").click();
  await expect(row(page, "Karotten").locator(".sl-qty")).toHaveText("2");

  // Sortierung A–Z bleibt nach Neustart, Liste auch
  await page.locator('.sl-sortbtn[data-sort="alpha"]').click();
  await page.reload();
  await expect(row(page, "Karotten").locator(".sl-qty")).toHaveText("2");
  await expect(page.locator('.sl-sortbtn[data-sort="alpha"]')).toHaveClass(/\bon\b/);
  await expect(badge(page)).toHaveText("1");

  // Katalogsuche
  await page.locator("#shop-search").fill("zitr");
  await expect(page.locator('#shop-catalog .cat-item[data-name="Zitronen"]')).toBeVisible();
});

test("Rezept → Einkaufsliste: Zutaten zusammengefasst, Vorrat übersprungen, Wechsel zur Liste", async ({ device }) => {
  const dev = await device();
  const { page } = dev;
  const r = snapshot().recipes.find((x) => x.id === "r01");
  await openApp(page);
  const detail = await openRecipe(page, r.name);
  await detail.locator(".add-ing-shop").click();

  // Bestätigung „Zur Liste wechseln?“ wird akzeptiert → Einkaufsliste
  await expect(page).toHaveURL(/#\/shopping$/);
  const msg = dev.dialogs.at(-1);
  expect(msg.type).toBe("confirm");
  const [, added, skipped] = /(\d+) Artikel zur Einkaufsliste hinzugefügt \((\d+) im Vorrat übersprungen\)/.exec(msg.message) || [];
  expect(Number(added)).toBeGreaterThan(0);
  expect(Number(skipped)).toBeGreaterThan(0); // Vorrat (Lager) + Salz/Pfeffer/Öl gelten als vorhanden

  await expect.poll(() => shoppingNames(page)).toHaveLength(Number(added));
  expect((await shoppingNames(page)).join(" | ")).not.toMatch(/Salz|Pfeffer/);
  await expect(badge(page)).toHaveText(added);
  const before = (await idb(page, "lists", "current")).items;

  // Zweimal hinzufügen = Mengen addiert, keine Duplikate
  await tab(page, "cookbook");
  const again = await openRecipe(page, r.name);
  await again.locator(".add-ing-shop").click();
  await expect(page).toHaveURL(/#\/shopping$/);
  await expect.poll(async () => (await idb(page, "lists", "current")).items.map((x) => x.amount ?? x.qty))
    .toEqual(before.map((x) => (x.amount ?? x.qty) * 2));
  expect(await shoppingNames(page)).toHaveLength(Number(added));
});
