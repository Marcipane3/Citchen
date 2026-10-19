// Flow 9 — Offline-Start: einmal online geöffnet (Service Worker cacht die Shell), dann ohne Netz
// neu gestartet. Jede Ansicht muss laden — fehlt ein Modul im SW-SHELL, bricht genau das hier.
import { test, expect, CURRENT_BUILD, snapshot } from "../support/fixtures.js";
import { openApp, tab, menu, card, sheet, fillForm, waitForServiceWorker } from "../support/app.js";
import { cacheOf } from "../support/previous-build.js";
import { REPO_ROOT } from "../support/server.js";

test.use({ serviceWorkers: "allow" });

test("Offline-Start: App, Daten und alle Ansichten kommen aus dem Cache", async ({ device, server }) => {
  const { page } = await device({ server });
  const CACHE = cacheOf(REPO_ROOT);
  await openApp(page);
  await waitForServiceWorker(page, CACHE);

  // Eigene Daten anlegen (IndexedDB) — müssen offline genauso da sein.
  await page.locator("#addBtn").click();
  const form = await sheet(page);
  await fillForm(form, { name: "E2E Offline-Eintopf", ingredients: ["1 Zwiebel"], steps: ["Kochen."] });
  await form.locator(".save-btn").click();
  await expect(card(page, "E2E Offline-Eintopf")).toBeVisible();

  await page.context().setOffline(true); // Gerät UND Server offline (auch der Service Worker erreicht nichts)
  const served = server.stats.served;
  await page.reload();
  await expect(page.locator(".build-line")).toHaveText(`Build ${CURRENT_BUILD}`);
  await expect(page.locator("#cards .rcard")).toHaveCount(snapshot().recipes.length + 1);
  await expect(card(page, "E2E Offline-Eintopf")).toBeVisible();

  // Jede Ansicht lädt offline (lazy importierte Module eingeschlossen).
  await tab(page, "shopping");
  await expect(page.locator("#shop-catalog .cat-head").first()).toBeVisible();
  await tab(page, "planner");
  await page.locator("#genBtn").click();
  await expect(page.locator("#plan-days .plan-day")).toHaveCount(7);
  await tab(page, "lager");
  await expect(page.locator(".app-header h1")).toHaveText("Lager");
  await tab(page, "assistant");
  await expect(page.locator(".app-header h1")).toBeVisible();
  await menu(page, "capture");
  await expect(page.locator("main")).toContainText("braucht deinen API-Schlüssel");
  await menu(page, "guide");
  await expect(page.locator("main")).toContainText(CURRENT_BUILD.split("-v")[1]);
  await menu(page, "match");
  await expect(page.locator(".app-header h1")).toBeVisible();

  // Sprachwechsel offline: übersetzter Snapshot kommt ebenfalls aus dem Cache.
  const en = snapshot("en").recipes.find((r) => r.id === "r01");
  await menu(page, "settings");
  await page.locator('[data-setlang="en"]').click();
  await tab(page, "cookbook");
  await expect(card(page, en.name)).toBeVisible();

  // Kochmodus offline
  await page.goto("/v2/#/cook/r01");
  await expect(page.locator(".cook h2")).toHaveText(en.name);

  // Beweis: nichts davon kam vom Server.
  expect(server.stats.served).toBe(served);
  expect(server.stats.refused).toBeGreaterThan(0); // network-first index.html hat es versucht
});

test("Ohne Netz und ohne Cache zeigt der Browser nichts — der Service Worker ist also nötig", async ({ device, server }) => {
  // Gegenprobe, damit der Offline-Test nicht zufällig über den HTTP-Cache grün wird.
  const { page } = await device({ server });
  await page.context().setOffline(true);
  await expect(page.goto("/v2/")).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
});
