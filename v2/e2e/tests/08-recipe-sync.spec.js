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

test("Beide Geräte ändern (eins offline) → beide Änderungen bleiben, kein Konflikt (v2.15.1, Drei-Wege-Merge)", async ({ device, drive }) => {
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

  // Danach ändert Gerät 2 online ein anderes Rezept.
  await tab(two, "cookbook");
  await card(two, r2.name).locator(".card-heart").click();
  await expect.poll(() => drive.read(file.id).recipes.find((r) => r.id === r2.id).favorite).toBe(true);

  // Gerät 1 wieder online → Abgleich: beide Favoriten auf Drive und auf Gerät 1.
  await one.context().setOffline(false);
  expect(await syncRecipes(one)).toBe("☁️ Verbunden · Synchronisiert ✓");
  const remote = drive.read(file.id).recipes;
  expect(remote.find((r) => r.id === r1.id).favorite).toBe(true);
  expect(remote.find((r) => r.id === r2.id).favorite).toBe(true);
  expect((await idb(one, "recipes", r2.id)).favorite).toBe(true);
  expect((await idb(one, "kv", "collection")).value.dirty).toBe(false);
  await tab(one, "cookbook");
  await expect(card(one, r2.name).locator(".card-heart")).toHaveText("♥");
});

test("T1 / DG-01: Claude fügt auf Drive ein Rezept hinzu, die App tippt ♥ → beides bleibt", async ({ device, drive }) => {
  const one = (await device()).page;
  await openApp(one); await signIn(one);
  const file = drive.find(FILE)[0];
  const [r1] = base;
  // Projekt-Claude schreibt direkt in rezepte.json (die App läuft weiter, ohne neu zu laden).
  drive.write(file.id, (j) => ({ ...j, updated: new Date().toISOString(), recipes: [{ ...base[1], id: "rClaude", name: "Claudes Linsensuppe" }, ...j.recipes] }));

  await tab(one, "cookbook");
  await card(one, r1.name).locator(".card-heart").click();
  await expect.poll(() => drive.read(file.id).recipes.find((r) => r.id === r1.id).favorite).toBe(true);
  expect(drive.read(file.id).recipes.map((r) => r.name)).toContain("Claudes Linsensuppe");
  // … und Claudes Rezept ist nach dem Speichern auch in der App, ohne Neustart.
  await expect(card(one, "Claudes Linsensuppe")).toBeVisible();
  await expect(one.locator(".app-header .sub")).toHaveText(`${base.length + 1} Rezepte`);
});

test("T1: zurück in die App (aus dem Hintergrund) → Drive-Änderungen sind da, ohne etwas anzutippen", async ({ device, drive }) => {
  const one = (await device()).page;
  await openApp(one); await signIn(one);
  const file = drive.find(FILE)[0];
  drive.write(file.id, (j) => ({ ...j, updated: new Date().toISOString(), recipes: [{ ...base[1], id: "rResume", name: "Während du weg warst" }, ...j.recipes] }));
  await tab(one, "cookbook");
  await expect(card(one, "Während du weg warst")).toHaveCount(0);
  // App kommt aus dem Hintergrund zurück (visibilitychange → visible).
  await one.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(card(one, "Während du weg warst")).toBeVisible();
});

test("T2 / DG-05: kaputte Drive-Datei → abgelehnt, Kochbuch bleibt, Speichern überschreibt sie nicht", async ({ device, drive }) => {
  const dev = await device();
  const one = dev.page;
  await openApp(one); await signIn(one);
  const file = drive.find(FILE)[0];
  drive.write(file.id, () => ({}));                     // z. B. ein missglückter externer Schreibvorgang
  const writes = drive.writes.length;

  expect(await syncRecipes(one)).toBe("☁️ Verbunden · Drive-Datei fehlerhaft — lokale Daten behalten");
  await tab(one, "cookbook");
  await expect(one.locator(".app-header .sub")).toHaveText(`${base.length} Rezepte`);
  await card(one, base[0].name).locator(".card-heart").click();
  await expect(one.locator(".sync-line")).toHaveText("Drive-Datei fehlerhaft — lokale Daten behalten");
  expect((await idb(one, "recipes", base[0].id)).favorite).toBe(true);
  expect(drive.writes.length).toBe(writes);             // die kaputte Datei wurde nicht angefasst
  expect(drive.read(file.id)).toEqual({});
  expect(dev.dialogs).toEqual([]);
});

test("T2: Drive-Datei mit nur noch wenigen Rezepten → Rückfrage; Abbrechen behält das lokale Kochbuch", async ({ device, drive }) => {
  const dev = await device();
  const one = dev.page;
  await openApp(one); await signIn(one);
  const file = drive.find(FILE)[0];
  drive.write(file.id, (j) => ({ ...j, recipes: j.recipes.slice(0, 40) }));   // DG-03-Probe: 105 → 40
  one.removeAllListeners("dialog");
  one.on("dialog", (d) => { dev.dialogs.push({ type: d.type(), message: d.message() }); d.dismiss(); });

  expect(await syncRecipes(one)).toBe("☁️ Verbunden · Drive-Datei fehlerhaft — lokale Daten behalten");
  expect(dev.dialogs.at(-1).message).toContain(`${base.length - 40} von ${base.length} Rezepten`);
  expect((await idb(one, "recipes")).length).toBe(base.length);
  expect(drive.read(file.id).recipes).toHaveLength(40);
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
