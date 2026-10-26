// Flow 6 — Einkaufsliste: eigene + Katalog-Artikel, Mengen, abhaken, aufräumen mit Rückgängig,
// Tab-Badge, Neustart; Rezept-Zutaten auf die Liste (Vorrat wird übersprungen).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, openRecipe, shoppingNames, idb, tab, addedSheet, goToList } from "../support/app.js";

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

  // Alles löschen → Rückgängig (Snackbar, T9) bringt die Artikel zurück
  await page.locator(".sl-clear-all").click();
  await expect(page.locator("#shop-snack")).toContainText("Liste geleert.");
  await expect(badge(page)).toHaveCount(0);
  await page.locator("#shop-snack .sl-undo-btn").click();
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

  // T9 (UX-14): Ergebnis-Blatt statt confirm(): was kam dazu, was wurde übersprungen → „Zur Liste“
  const sheet = await addedSheet(page);
  const added = String(await sheet.locator(".as-line").count());
  expect(Number(added)).toBeGreaterThan(0);
  await expect(sheet.locator(".as-sum")).toContainText(/\(\d+ im Vorrat übersprungen\)/); // Lager + Salz/Pfeffer/Öl
  await expect(sheet.locator(".as-tag", { hasText: "aufaddiert" })).toHaveCount(0);
  expect(dev.dialogs).toEqual([]);
  await goToList(page);

  await expect.poll(() => shoppingNames(page)).toHaveLength(Number(added));
  expect((await shoppingNames(page)).join(" | ")).not.toMatch(/Salz|Pfeffer/);
  await expect(badge(page)).toHaveText(added);
  const before = (await idb(page, "lists", "current")).items;

  // Zweimal hinzufügen = Mengen addiert, keine Duplikate
  await tab(page, "cookbook");
  const again = await openRecipe(page, r.name);
  await again.locator(".add-ing-shop").click();
  await expect((await addedSheet(page)).locator(".as-tag", { hasText: "aufaddiert" })).toHaveCount(Number(added));
  await goToList(page);
  await expect.poll(async () => (await idb(page, "lists", "current")).items.map((x) => x.amount ?? x.qty))
    .toEqual(before.map((x) => (x.amount ?? x.qty) * 2));
  expect(await shoppingNames(page)).toHaveLength(Number(added));
});

/* ---------- v2.15.3: ein Artikel = eine Zeile (T5), Lager schlägt 🛒 (T6) ---------- */

const THAI = "Thai-Style Gemüsecurry";      // „1 Stück Ingwer 🛒“
const RAMEN = "Asiatische Nudelsuppe (Ramen-Art)"; // „1 Stück Ingwer 🛒“
const ingwerRows = (page) => page.locator("#shop-list .sl-item", { hasText: "Ingwer" });

test("T5 / FR-01: Rezept + Kachel-Tipps + zweites Rezept → immer EINE Ingwer-Zeile; Badge zeigt genau sie; Doppel-Tipp verdoppelt nicht", async ({ device }) => {
  const { page } = await device();
  await openApp(page);
  // BH-10: Doppel-Tipp auf „Zutaten auf die Liste“ fügt nur einmal hinzu.
  const detail = await openRecipe(page, THAI);
  await detail.locator(".add-ing-shop").dblclick();
  await goToList(page);
  await expect(ingwerRows(page)).toHaveCount(1);
  await expect(ingwerRows(page).locator(".sl-name")).toHaveText(/^1 Stück Ingwer/);
  await expect(ingwerRows(page).locator(".sl-origin")).toHaveText("aus " + THAI); // T9: Herkunft

  // Kachel „Ingwer“ (Gemüse) → zählt in DIESE Zeile; das Badge zeigt ihre Stückzahl (UX-11).
  await page.locator('#shop-catalog .cat-head[data-sec="Gemüse"]').click();
  const tile = page.locator('#shop-catalog .cat-item[data-name="Ingwer"]');
  await expect(tile.locator(".ci-badge")).toHaveText("1");
  await tile.click();
  await expect(ingwerRows(page)).toHaveCount(1);
  await expect(ingwerRows(page).locator(".sl-name")).toHaveText(/^2 Stück Ingwer/);
  await expect(page.locator("#shop-snack")).toContainText("+1 → 2 Stück Ingwer"); // T9: was der Tipp getan hat
  await expect(tile.locator(".ci-badge")).toHaveText("2");
  await tile.click();
  await expect(tile.locator(".ci-badge")).toHaveText("3");

  // Zweites Ingwer-Rezept → weiter eine Zeile.
  await tab(page, "cookbook");
  await (await openRecipe(page, RAMEN)).locator(".add-ing-shop").click();
  await goToList(page);
  await expect(ingwerRows(page)).toHaveCount(1);
  await expect(ingwerRows(page).locator(".sl-name")).toHaveText(/^4 Stück Ingwer/);
  // T9: „aus 2 Rezepten“ — antippen zeigt die Namen (und hakt NICHT ab).
  const origin = ingwerRows(page).locator(".sl-origin");
  await expect(origin).toHaveText("aus 2 Rezepten");
  await origin.click();
  await expect(origin).toHaveText(`aus ${THAI}, ${RAMEN}`);
  await expect(ingwerRows(page)).not.toHaveClass(/done/);
  const stored = (await idb(page, "lists", "current")).items.filter((x) => !x.deleted && /Ingwer/.test(x.name));
  expect(stored).toHaveLength(1);
});

test("T6: Ingwer im Kühlschrank (Lager) → Rezept mit „Ingwer 🛒“ setzt keinen Ingwer auf die Liste", async ({ device }) => {
  const dev = await device();
  const { page } = dev;
  await openApp(page);
  await tab(page, "lager");
  await page.locator("#fridge-name").fill("Ingwer");
  await page.locator("#fridge-add").click();
  await expect(page.locator("#fridge-list .fi-name", { hasText: "Ingwer" })).toHaveCount(1);

  await tab(page, "cookbook");
  await (await openRecipe(page, THAI)).locator(".add-ing-shop").click();
  await expect((await addedSheet(page)).locator(".as-sum")).toContainText("im Vorrat übersprungen");
  await goToList(page);
  await expect.poll(() => shoppingNames(page)).toEqual(expect.arrayContaining([expect.stringMatching(/Limette/)]));
  await expect(ingwerRows(page)).toHaveCount(0);
});

/* ---------- v2.16b (T9): Rückgängig, Kachel bleibt unter dem Finger, Ergebnis-Blatt ---------- */

test("T9 / UX-13: ✕ und „Erledigte entfernen“ → Snackbar mit Rückgängig; ✕ steht weit weg vom +", async ({ page }) => {
  await openApp(page, "shopping");
  for (const n of ["Hafermilch", "Brot", "Äpfel"]) {
    await page.locator("#shop-custom").fill(n);
    await page.locator("#shop-custom").press("Enter");
  }
  await expect(page.locator("#shop-snack")).toContainText("„Äpfel“ hinzugefügt");

  // ✕ ist deutlich vom + getrennt (vorher 6px).
  const plus = await row(page, "Brot").locator(".sl-inc").boundingBox();
  const x = await row(page, "Brot").locator(".sl-rm").boundingBox();
  expect(x.x - (plus.x + plus.width)).toBeGreaterThanOrEqual(16);

  await row(page, "Brot").locator(".sl-rm").click();
  await expect(row(page, "Brot")).toHaveCount(0);
  await expect(page.locator("#shop-snack")).toContainText("„Brot“ entfernt");
  await page.locator("#shop-snack .sl-undo-btn").click();
  await expect(row(page, "Brot")).toHaveCount(1);
  await expect.poll(async () => (await idb(page, "lists", "current")).items.find((i) => i.name === "Brot").deleted).toBe(false);

  await row(page, "Hafermilch").locator(".sl-name").click();
  await row(page, "Äpfel").locator(".sl-name").click();
  await page.locator(".sl-clear").click();
  await expect(page.locator("#shop-snack")).toContainText("2 erledigte Artikel entfernt");
  await expect(page.locator("#shop-list .sl-item")).toHaveCount(1);
  await page.locator("#shop-snack .sl-undo-btn").click();
  await expect(page.locator("#shop-list .sl-item")).toHaveCount(3);
  await expect(row(page, "Hafermilch")).toHaveClass(/done/);
});

test("T9 / UX-12: Kachel-Tipp lässt die Kachel unter dem Finger — die wachsende Liste schiebt sie nicht weg", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 700 });
  await openApp(page, "shopping");
  // Chrome gleicht das teils per „scroll anchoring“ aus — iPhone-Safari kann das nicht. So wie dort testen:
  await page.addStyleTag({ content: "*, html, body { overflow-anchor: none !important; }" });
  await page.locator('#shop-catalog .cat-head[data-sec="Gemüse"]').click();
  const tile = page.locator('#shop-catalog .cat-item[data-name="Ingwer"]');
  await tile.scrollIntoViewIfNeeded();
  for (const name of ["Ingwer", "Lauch", "Chili"]) {
    const t = page.locator(`#shop-catalog .cat-item[data-name="${name}"]`);
    const before = (await t.boundingBox()).y;
    await t.click();                                      // neue Zeile + evtl. neue Gang-Überschrift oben
    await expect(row(page, name)).toHaveCount(1);
    await expect(t).not.toHaveClass(/just-added/); // die 220-ms-Tipp-Animation (scale) ist vorbei
    expect(Math.abs((await t.boundingBox()).y - before)).toBeLessThanOrEqual(2); // ohne Ausgleich: ~60 px
  }
});

test("T9 / UX-14: Ergebnis-Blatt „Rückgängig“ → die Liste ist wie vorher", async ({ device }) => {
  const { page } = await device();
  await openApp(page, "shopping");
  await page.locator("#shop-custom").fill("Ingwer");
  await page.locator("#shop-custom").press("Enter");
  await tab(page, "cookbook");
  await (await openRecipe(page, THAI)).locator(".add-ing-shop").click();
  const sheet = await addedSheet(page);
  await expect(sheet.locator(".as-line", { hasText: "Ingwer" }).locator(".as-tag")).toHaveText("aufaddiert");
  await sheet.locator(".as-undo").click();
  await expect(sheet.locator(".as-sum")).toContainText("Rückgängig gemacht");
  await sheet.locator(".close").click();
  await page.evaluate(() => { location.hash = "#/shopping"; }); // Rezept-Blatt ist noch offen (Tab-Leiste verdeckt)
  await expect.poll(() => shoppingNames(page)).toEqual(["Ingwer"]);
  await expect(page.locator("#shop-list .sl-name")).toHaveText(/^Ingwer$/);
});
