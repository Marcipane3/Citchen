// Flow 12 — v2.15.1 „sicherer Rezept-Sync“: Projekt-Claude (oder v1) ändert rezepte.json direkt in
// Drive, während die App offen ist. Die App darf diese Änderungen nie überschreiben (T1), kaputte
// Dateien nie übernehmen (T2) und beim Bearbeiten in einer anderen Sprache nie Übersetzungen nach
// Drive schreiben (T3). Rückfragen (confirm) bestätigt die Fixture automatisch; den „Abbrechen“-Weg
// prüfen die Unit-Tests (tests/test-sync-core.js).
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, menu, tab, card, sheet, fillForm, openRecipe, signIn, syncRecipes, idb } from "../support/app.js";

const FILE = "rezepte.json";
const base = snapshot().recipes;
const claudeRecipe = {
  id: "r1793000000000", name: "E2E Claudes Linsensuppe", category: "Suppen & Eintöpfe", time: "30 Min", servings: "~4",
  lastCooked: "", ingredients: ["200 g rote Linsen"], steps: ["Köcheln."], tips: "",
};
const resume = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

test("T1: Claude fügt ein Rezept hinzu, die App tippt ♥ ohne neu zu laden → beides bleibt in Drive", async ({ device, drive }) => {
  const { page } = await device();
  await openApp(page); await signIn(page);
  const file = drive.find(FILE)[0];

  // Projekt-Claude schreibt — die App läuft weiter und weiß davon nichts.
  const d = drive.read(file.id);
  drive.write(file.id, { ...d, recipes: [...d.recipes, claudeRecipe] });

  await tab(page, "cookbook");
  await card(page, base[0].name).locator(".card-heart").click();
  await expect.poll(() => drive.read(file.id).recipes.find((r) => r.id === base[0].id).favorite).toBe(true);
  const remote = drive.read(file.id).recipes;
  expect(remote.map((r) => r.id)).toContain(claudeRecipe.id);
  expect(remote).toHaveLength(base.length + 1);
  // … und die App zeigt Claudes Rezept direkt danach.
  await expect(card(page, claudeRecipe.name)).toBeVisible();
  await expect(page.locator(".sync-line")).toHaveText("Synchronisiert ✓");
});

test("T1: zurück aus dem Hintergrund → Claudes Änderungen erscheinen ohne Neustart", async ({ device, drive }) => {
  const { page } = await device();
  await openApp(page); await signIn(page);
  const file = drive.find(FILE)[0];
  const d = drive.read(file.id);
  d.recipes[0].tips = "Claude: mit Koriander."; // ohne `updated` zu erhöhen (DG-07)
  drive.write(file.id, { ...d, recipes: [...d.recipes, claudeRecipe] });

  await tab(page, "cookbook");
  await resume(page);
  await expect(card(page, claudeRecipe.name)).toBeVisible();
  await expect.poll(async () => (await idb(page, "recipes", base[0].id)).tips).toBe("Claude: mit Koriander.");
});

test("T2: kaputte Drive-Datei → Rezepte bleiben, Rückfrage, nach „OK“ ist Drive repariert", async ({ device, drive }) => {
  const dev = await device();
  const { page } = dev;
  await openApp(page); await signIn(page);
  const file = drive.find(FILE)[0];
  drive.write(file.id, "{}");

  expect(await syncRecipes(page)).toBe("☁️ Verbunden · Synchronisiert ✓ — Drive-Datei repariert");
  expect(dev.dialogs.map((x) => x.message).join("\n")).toContain("beschädigt");
  expect(drive.read(file.id).recipes).toHaveLength(base.length);
  await tab(page, "cookbook");
  await expect(page.locator(".app-header .sub")).toHaveText(`${base.length} Rezepte`);
});

test("T2: Drive würde viele Rezepte löschen → Rückfrage nennt die Zahl; die alte Sammlung liegt als Sicherung bereit", async ({ device, drive }) => {
  const dev = await device();
  const { page } = dev;
  await openApp(page); await signIn(page);
  const file = drive.find(FILE)[0];
  const d = drive.read(file.id);
  drive.write(file.id, { ...d, recipes: d.recipes.slice(0, 40) });

  await tab(page, "cookbook");
  await resume(page);
  await expect.poll(() => dev.dialogs.map((x) => x.message).join("\n")).toContain(`${base.length - 40} von ${base.length}`);
  await expect(page.locator(".app-header .sub")).toHaveText("40 Rezepte"); // bestätigt → übernommen
  expect((await idb(page, "kv", "recipesBackup")).value.recipes).toHaveLength(base.length);
});

test("T3: Bearbeiten in englischer UI → Drive bleibt deutsch, die Änderung ist sichtbar", async ({ device, drive }) => {
  const { page } = await device();
  const de = base.find((r) => r.id === "r01");
  const en = snapshot("en").recipes.find((r) => r.id === "r01");
  await openApp(page); await signIn(page);
  const file = drive.find(FILE)[0];

  await menu(page, "settings");
  await page.locator('[data-setlang="en"]').click();
  await tab(page, "cookbook");
  const detail = await openRecipe(page, en.name);
  await detail.locator(".edit").click();
  const form = await sheet(page);
  await expect(form.locator(".f-canonical")).toBeVisible();          // Hinweis: deutscher Text
  await expect(form.locator("#f-name")).toHaveValue(de.name);        // Formular zeigt das Original
  await fillForm(form, { time: "99 Min" });
  await form.locator(".save-btn").click();

  await expect.poll(() => drive.read(file.id).recipes.find((r) => r.id === "r01").time).toBe("99 Min");
  const stored = drive.read(file.id).recipes.find((r) => r.id === "r01");
  expect(stored.name).toBe(de.name);
  expect(stored.ingredients).toEqual(de.ingredients);
  expect(stored.steps).toEqual(de.steps);
  await expect(page.locator(".detail-name")).toHaveText(en.name);     // unveränderte Felder bleiben übersetzt
});
