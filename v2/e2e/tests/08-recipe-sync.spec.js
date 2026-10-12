// Flow 8 — Rezepte über Google Drive (rezepte.json, file-level last-write-wins + decideSync).
// Zwei Geräte DESSELBEN Kontos. Diese Tests halten das heutige Verhalten fest, damit der
// Sync-Kern-Umbau (P1) es nicht unbemerkt ändert.
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, tab, card, sheet, fillForm, openRecipe, signIn, syncRecipes, idb } from "../support/app.js";

const FILE = "rezepte.json";
const base = snapshot().recipes;

async function addRecipe(page, name) {
  await tab(page, "cookbook");
  await page.locator("#addBtn").click();
  const form = await sheet(page);
  await fillForm(form, { name, ingredients: ["1 Zutat"], steps: ["Kochen."] });
  await form.locator(".save-btn").click();
  await expect(page.locator(".overlay")).toHaveCount(0);
}

test("Erstlauf legt rezepte.json an; Rezept auf Gerät 1 → nach Neustart auf Gerät 2; Änderung zurück", async ({ device, drive }) => {
  const one = (await device()).page;
  await openApp(one);
  await signIn(one);

  // Erstlauf: lokale Sammlung (Snapshot) wird hochgeladen, genau eine Datei.
  await expect.poll(() => drive.find(FILE).length).toBe(1);
  const file = drive.find(FILE)[0];
  expect(drive.read(file.id).recipes).toHaveLength(base.length);
  expect((await idb(one, "kv", "collection")).value).toMatchObject({ fileId: file.id, dirty: false, source: "drive" });

  // Anlegen → sofort in place nach Drive (gleiche Datei-ID, keine zweite Datei).
  await addRecipe(one, "E2E Gerät-1-Rezept");
  await expect(one.locator(".sync-line")).toHaveText("Synchronisiert ✓");
  await expect.poll(() => drive.read(file.id).recipes.map((r) => r.name)).toContain("E2E Gerät-1-Rezept");
  expect(drive.find(FILE)).toHaveLength(1);
  const remote = drive.read(file.id);
  expect(remote.updated).toBe((await idb(one, "kv", "collection")).value.updated);
  expect(remote.version).toBeGreaterThanOrEqual(3);

  // Gerät 2 (frisch): nach dem Anmelden ist das Rezept da — Drive gewinnt über den Snapshot.
  const two = (await device()).page;
  await openApp(two);
  await signIn(two);
  await tab(two, "cookbook");
  await expect(card(two, "E2E Gerät-1-Rezept")).toBeVisible();
  await expect(two.locator(".app-header .sub")).toHaveText(`${base.length + 1} Rezepte`);
  expect(drive.find(FILE)).toHaveLength(1);

  // Gerät 2 benennt um → Gerät 1 sieht es nach einem Neustart (Token bleibt gespeichert).
  const d = await openRecipe(two, "E2E Gerät-1-Rezept");
  await d.locator(".edit").click();
  const form = await sheet(two);
  await fillForm(form, { name: "E2E von Gerät 2 geändert" });
  await form.locator(".save-btn").click();
  await expect.poll(() => drive.read(file.id).recipes.map((r) => r.name)).toContain("E2E von Gerät 2 geändert");

  await one.reload();
  await expect(card(one, "E2E von Gerät 2 geändert")).toBeVisible();
  await expect(card(one, "E2E Gerät-1-Rezept")).toHaveCount(0);
});

test("Offline geändert, Drive inzwischen neuer → Konflikt: lokale Änderung bleibt, Drive wird nicht überschrieben", async ({ device, drive }) => {
  const one = (await device()).page;
  const two = (await device()).page;
  await openApp(one); await signIn(one);
  await openApp(two); await signIn(two);
  const file = drive.find(FILE)[0];
  const [r1, r2] = base;

  // Gerät 1 offline: Favorit setzen → nur lokal, „dirty“.
  await one.context().setOffline(true);
  await tab(one, "cookbook");
  await card(one, r1.name).locator(".card-heart").click();
  await expect(one.locator(".sync-line")).toHaveText("Lokal gespeichert");
  expect((await idb(one, "kv", "collection")).value.dirty).toBe(true);

  // Danach ändert Gerät 2 online ein anderes Rezept → Drive ist jetzt neuer.
  await tab(two, "cookbook");
  await card(two, r2.name).locator(".card-heart").click();
  await expect.poll(() => drive.read(file.id).recipes.find((r) => r.id === r2.id).favorite).toBe(true);

  // Gerät 1 wieder online, Sync → Konflikt (K2): nichts wird still überschrieben.
  await one.context().setOffline(false);
  expect(await syncRecipes(one)).toBe("☁️ Verbunden · Konflikt — lokale Änderung behalten, Sync ausstehend");
  expect((await idb(one, "recipes", r1.id)).favorite).toBe(true);
  expect((await idb(one, "kv", "collection")).value.dirty).toBe(true);
  const remote = drive.read(file.id).recipes;
  expect(remote.find((r) => r.id === r2.id).favorite).toBe(true);
  expect(remote.find((r) => r.id === r1.id).favorite).toBeFalsy();
});

test("Offline geändert und jünger als Drive → wird beim nächsten Sync hochgeladen (file-level last-write-wins)", async ({ device, drive }) => {
  const one = (await device()).page;
  const two = (await device()).page;
  await openApp(one); await signIn(one);
  await openApp(two); await signIn(two);
  const file = drive.find(FILE)[0];
  const [r1, r2] = base;

  // Erst ändert Gerät 2 online, DANACH Gerät 1 offline → lokal ist jünger.
  await tab(two, "cookbook");
  await card(two, r2.name).locator(".card-heart").click();
  await expect.poll(() => drive.read(file.id).recipes.find((r) => r.id === r2.id).favorite).toBe(true);
  await one.context().setOffline(true);
  await tab(one, "cookbook");
  await card(one, r1.name).locator(".card-heart").click();
  await expect(one.locator(".sync-line")).toHaveText("Lokal gespeichert");

  await one.context().setOffline(false);
  expect(await syncRecipes(one)).toBe("☁️ Verbunden · Synchronisiert ✓");
  const remote = drive.read(file.id).recipes;
  expect(remote.find((r) => r.id === r1.id).favorite).toBe(true);
  // Bekannte Grenze des Datei-Modells: Gerät 2's ältere Änderung ist damit weg (P1 / V3 beachten).
  expect(remote.find((r) => r.id === r2.id).favorite).toBeFalsy();
  expect((await idb(one, "kv", "collection")).value.dirty).toBe(false);
});

test("Abgemeldet: Trennen stoppt den Sync, Daten bleiben lokal", async ({ device, drive }) => {
  const one = (await device()).page;
  await openApp(one); await signIn(one);
  const file = drive.find(FILE)[0];
  const writes = drive.writes.length;
  await one.locator("#drive-disconnect").click(); // Bestätigung wird akzeptiert
  await expect(one.locator("#drive-status")).toHaveText("Nicht verbunden — Daten nur lokal auf diesem Gerät.");
  await addRecipe(one, "E2E nur lokal");
  await expect(one.locator(".sync-line")).toHaveText("Lokal gespeichert");
  expect(drive.writes.length).toBe(writes);
  expect(drive.read(file.id).recipes.map((r) => r.name)).not.toContain("E2E nur lokal");
  // Neustart: keine lautlose Wieder-Anmeldung.
  await one.reload();
  await expect(card(one, "E2E nur lokal")).toBeVisible();
  await expect(one.locator("#shop-sync")).toHaveCount(0);
  expect(drive.writes.length).toBe(writes);
});
