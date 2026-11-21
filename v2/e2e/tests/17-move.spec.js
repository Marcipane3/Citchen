// Flow 17 — P5 (#108): Einstellungen → „Umzug auf die neue Adresse“. Alte Adresse exportiert,
// neue (leerer Browser-Speicher = frischer Kontext) importiert. Rezepte trägt Drive.
import { readFileSync } from "node:fs";
import { test, expect } from "../support/fixtures.js";
import { openApp, menu, tab, card, sheet, signIn, idb } from "../support/app.js";

const KEY = "sk-ant-e2e-not-a-real-key";

async function exportMoveFile(page, { answer } = {}) {
  await page.evaluate(() => { delete navigator.canShare; });
  const dl = page.waitForEvent("download");
  await page.locator("#move-export").click();
  if (answer) await (await sheet(page)).locator(answer).click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^citchen-umzug-\d{4}-\d{2}-\d{2}\.json$/);
  return readFileSync(await d.path(), "utf8");
}

async function importMoveFile(page, file) {
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#move-import").click();
  await (await chooser).setFiles(file);
}

const moveFile = (data) => ({ name: "umzug.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ kind: "citchen-move", version: 1, created: "2026-12-03T12:00:00Z", data })) });

/** Nach dem Import lädt die App neu (Hinweis per alert, den das Fixture bestätigt). */
async function waitForReload(dev) {
  await expect.poll(() => dev.dialogs.some((d) => d.message.includes("Umzug übernommen"))).toBe(true);
  await dev.page.waitForLoadState("load");
  await expect(dev.page.locator("nav.tabbar .tab")).toHaveCount(5);
}

test("Umzug: Vorrat + Profil exportieren, frische Adresse importiert → alles wieder da; KI-Schlüssel nie in der Datei", async ({ device }) => {
  const old = await device();
  await openApp(old.page);
  // Daten, die nur im Browser liegen: Kühlschrank, Koch-Profil — und ein KI-Schlüssel
  await tab(old.page, "lager");
  await old.page.locator("#fridge-name").fill("Ingwer");
  await old.page.locator("#fridge-add").click();
  await expect(old.page.locator("#fridge-list .fi-name", { hasText: "Ingwer" })).toHaveCount(1);
  await menu(old.page, "settings");
  await old.page.locator("#prof-level").fill("Umzugs-Profi");
  await old.page.locator("#prof-save").click();
  await expect(old.page.locator("#prof-status")).toHaveText(/gespeichert/);
  await old.page.locator("#set-key").fill(KEY);
  await old.page.locator("#key-save").click();

  // Vor dem Export sichtbar: privat, Schlüssel neu eingeben
  await expect(old.page.locator("#move-private")).toBeVisible();
  await expect(old.page.locator("#move-private")).toContainText("privat");
  await expect(old.page.locator("#move-card")).toContainText("KI-Schlüssel ist nicht in der Datei");

  // Nicht mit Drive verbunden → Hinweis, „Trotzdem exportieren“
  const text = await exportMoveFile(old.page, { answer: ".move-warn-local .move-yes" });
  expect(text).not.toContain(KEY);
  const file = JSON.parse(text);
  expect(file.data.fridge).toEqual([expect.objectContaining({ name: "Ingwer" })]);
  expect(file.data.profile.level).toBe("Umzugs-Profi");

  // Neue Adresse: leerer Speicher
  const fresh = await device({ user: "marcel" });
  await openApp(fresh.page);
  await menu(fresh.page, "settings");
  await importMoveFile(fresh.page, { name: "umzug.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await waitForReload(fresh);

  expect((await idb(fresh.page, "kv", "cookProfile")).value.level).toBe("Umzugs-Profi");
  await tab(fresh.page, "lager");
  await expect(fresh.page.locator("#fridge-list .fi-name", { hasText: "Ingwer" })).toHaveCount(1);
  await menu(fresh.page, "settings");
  await expect(fresh.page.locator("#set-key")).toHaveValue("");
});

test("Umzug: vorhandene Daten → Rückfrage; „Behalten“ lässt sie, füllt nur Leeres; „Ersetzen“ übernimmt", async ({ device }) => {
  const dev = await device();
  const { page } = dev;
  await openApp(page);
  await menu(page, "settings");
  await page.locator("#prof-level").fill("Schon hier");
  await page.locator("#prof-save").click();
  await expect(page.locator("#prof-status")).toHaveText(/gespeichert/);
  const file = moveFile({ profile: { level: "Aus der Datei" }, fridge: [{ name: "Feta", menge: "200 g" }] });

  await importMoveFile(page, file);
  let s = await sheet(page);
  await expect(s.locator(".move-conflicts li")).toHaveText(["Koch-Profil"]);
  await s.locator(".move-no").click();
  await waitForReload(dev);
  expect((await idb(page, "kv", "cookProfile")).value.level).toBe("Schon hier");
  expect((await idb(page, "kv", "lagerFridge")).value).toEqual([{ name: "Feta", menge: "200 g" }]);

  dev.dialogs.length = 0;
  await menu(page, "settings");
  await importMoveFile(page, file);
  s = await sheet(page);
  await s.locator(".move-yes").click();
  await waitForReload(dev);
  expect((await idb(page, "kv", "cookProfile")).value.level).toBe("Aus der Datei");
});

test("Umzug: Rezept-Datei oder kaputte Datei → klare Meldung, nichts geändert", async ({ page }) => {
  await openApp(page);
  await menu(page, "settings");
  await importMoveFile(page, { name: "rezepte.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 3, recipes: [] })) });
  await expect(page.locator("#move-status")).toContainText("keine Umzugs-Datei");
  await importMoveFile(page, { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{kaputt") });
  await expect(page.locator("#move-status")).toContainText("kein gültiges JSON");
  expect(await idb(page, "kv", "cookProfile")).toBeUndefined();
});

test("Umzug: ungesyncte Rezept-Änderung → Hinweis, „Zuerst synchronisieren“, dann die Datei", async ({ page }) => {
  await openApp(page);
  await signIn(page);
  const name = (await idb(page, "recipes")).map((r) => r.name).sort()[0];
  await page.context().setOffline(true);
  await tab(page, "cookbook");
  await card(page, name).locator(".card-heart").click();
  await expect(page.locator(".sync-line")).toHaveText("Lokal gespeichert");
  expect((await idb(page, "kv", "collection")).value.dirty).toBe(true);

  // Noch offline Export tippen (online stößt die App den Abgleich sofort selbst an)
  await menu(page, "settings");
  const s = page.locator(".overlay .sheet .move-warn-dirty");
  const text = exportMoveFile(page);
  await expect(s).toBeVisible();
  await expect(s).toContainText("noch nicht auf Google Drive");
  await page.context().setOffline(false);
  await (await sheet(page)).locator(".move-yes").click();
  JSON.parse(await text);
  expect((await idb(page, "kv", "collection")).value.dirty).toBe(false);
});
