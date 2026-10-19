// Flow 3 — Rezept anlegen, bearbeiten, löschen (ohne Anmeldung: rein lokal, überlebt Neustart).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, card, sheet, fillForm, openRecipe, idb } from "../support/app.js";

const NEW = {
  name: "E2E Rote Linsensuppe",
  category: "Suppen & Eintöpfe",
  time: "30 Min",
  ingredients: ["200g rote Linsen", "1 Zwiebel", "2 Karotten"],
  steps: ["Zwiebel anschwitzen.", "Linsen und Karotten 20 Min köcheln."],
  tips: "Topping: Zitrone",
};

test("Rezept anlegen → bearbeiten → nach Neustart noch da → löschen", async ({ device }) => {
  const dev = await device();
  const { page } = dev;
  const base = snapshot().recipes.length;
  await openApp(page);

  // Ohne Name wird nicht gespeichert.
  await page.locator("#addBtn").click();
  let form = await sheet(page);
  await expect(form.locator(".cat-label")).toHaveText("Neues Rezept");
  await form.locator(".save-btn").click();
  expect(dev.dialogs.at(-1)).toMatchObject({ type: "alert", message: "Name fehlt" });

  // Anlegen
  await fillForm(form, NEW);
  await form.locator(".save-btn").click();
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.locator(".app-header .sub")).toHaveText(`${base + 1} Rezepte`);
  await expect(page.locator("#cards .rcard").first().locator(".rname")).toHaveText(NEW.name); // neu = vorn
  await expect(page.locator(".sync-line")).toHaveText("Lokal gespeichert");

  const saved = (await idb(page, "recipes")).find((r) => r.name === NEW.name);
  expect(saved).toMatchObject({ category: NEW.category, time: NEW.time, ingredients: NEW.ingredients, steps: NEW.steps, tips: NEW.tips });
  expect(saved.id).toMatch(/^r\d+$/);
  expect((await idb(page, "kv", "collection")).value.dirty).toBe(true);

  // Suche nach Zutat findet es; Detail zeigt Zutaten + Schritte.
  await page.locator("#search").fill("linsen");
  await expect(card(page, NEW.name)).toBeVisible();
  let detail = await openRecipe(page, NEW.name);
  await expect(detail.locator(".ing-list li")).toHaveCount(3);
  await expect(detail.locator("ol li")).toHaveText(NEW.steps);

  // Bearbeiten: Formular ist vorbefüllt; nach dem Speichern zurück im Detail.
  await detail.locator(".edit").click();
  form = await sheet(page);
  await expect(form.locator(".cat-label")).toHaveText("Rezept bearbeiten");
  await expect(form.locator("#f-name")).toHaveValue(NEW.name);
  await expect(form.locator("#f-cat")).toHaveValue(NEW.category);
  await fillForm(form, { name: NEW.name + " mit Kokos", ingredients: [...NEW.ingredients, "200ml Kokosmilch"] });
  await form.locator(".save-btn").click();
  detail = await sheet(page);
  await expect(detail.locator(".detail-name")).toHaveText(NEW.name + " mit Kokos");
  await expect(detail.locator(".ing-list li")).toHaveCount(4);
  const edited = await idb(page, "recipes", saved.id);
  expect(edited.name).toBe(NEW.name + " mit Kokos");

  // Neustart: Änderung ist da, alte Fassung nicht (gleiche id, kein Duplikat).
  await page.reload();
  await expect(card(page, NEW.name + " mit Kokos")).toBeVisible();
  await expect(card(page, NEW.name)).toHaveCount(0);
  await expect(page.locator(".app-header .sub")).toHaveText(`${base + 1} Rezepte`);

  // Löschen (Bestätigung wird akzeptiert)
  detail = await openRecipe(page, NEW.name + " mit Kokos");
  await detail.locator(".del").click();
  expect(dev.dialogs.at(-1)).toMatchObject({ type: "confirm", message: "Rezept wirklich löschen?" });
  await expect(page.locator(".overlay")).toHaveCount(0);
  await page.locator("#search").fill("");
  await expect(page.locator(".app-header .sub")).toHaveText(`${base} Rezepte`);
  expect(await idb(page, "recipes", saved.id)).toBeUndefined();
});

test("Favorit, Bewertung und „Heute gekocht“ werden gespeichert", async ({ page }) => {
  const r = snapshot().recipes[1];
  await openApp(page);
  const detail = await openRecipe(page, r.name);
  await detail.locator(".heart").click();
  await detail.locator('[data-rate] .star[data-v="4"]').click();
  await detail.locator(".cooked").click();
  await expect(detail.locator(".cooked")).toHaveText("✓ Eingetragen!");

  await expect.poll(async () => {
    const x = await idb(page, "recipes", r.id);
    return [x.favorite, x.rating, x.cookedCount];
  }).toEqual([true, 4, (r.cookedCount || 0) + 1]);
  const month = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  expect((await idb(page, "recipes", r.id)).lastCooked).toBe(month);
});
