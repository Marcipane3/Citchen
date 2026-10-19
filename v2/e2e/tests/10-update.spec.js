// Flow 10 — Update vom vorigen Build: Ein Gerät hat den alten Release installiert (Service Worker +
// Cache + eigene Daten). Dann wird der aktuelle Stand „deployt“ (gleiche Adresse). Erwartet:
// neuer Build spätestens beim zweiten Öffnen, alter Cache weg, Daten unverändert, offline weiter ok.
import { test, expect, CURRENT_BUILD } from "../support/fixtures.js";
import { openApp, tab, card, sheet, fillForm, addItem, shoppingNames, waitForServiceWorker } from "../support/app.js";
import { materializePreviousBuild, cacheOf } from "../support/previous-build.js";
import { REPO_ROOT } from "../support/server.js";
import { rmSync } from "node:fs";

test.use({ serviceWorkers: "allow" });

test("Update vom vorigen Build: neuer Build kommt an, alter Cache wird gelöscht, Daten bleiben", async ({ device, server }, testInfo) => {
  const prev = materializePreviousBuild();
  testInfo.annotations.push({ type: "previous build", description: `${prev.build} (${prev.source})` });
  const CACHE = cacheOf(REPO_ROOT);
  expect(prev.build, "BUILD wurde nicht erhöht").not.toBe(CURRENT_BUILD);
  expect(prev.cache, "SW-CACHE wurde nicht erhöht — Nutzer bekämen alte Module").not.toBe(CACHE);

  try {
    // 1. Alter Release ist installiert und benutzt.
    server.setRoot(prev.root);
    const { page } = await device({ server });
    await openApp(page);
    await expect(page.locator(".build-line")).toHaveText(`Build ${prev.build}`);
    await waitForServiceWorker(page, prev.cache);

    await page.locator("#addBtn").click();
    const form = await sheet(page);
    await fillForm(form, { name: "E2E vor dem Update", ingredients: ["1 Zwiebel"], steps: ["Kochen."] });
    await form.locator(".save-btn").click();
    await expect(card(page, "E2E vor dem Update")).toBeVisible();
    await tab(page, "shopping");
    await addItem(page, "Update-Milch");

    // 2. Deploy des aktuellen Stands unter derselben Adresse.
    server.setRoot(REPO_ROOT);

    // 3. Nutzer öffnet die App wieder (höchstens zweimal, bis der neue Build sichtbar ist).
    await tab(page, "cookbook");
    let opens = 0;
    await expect(async () => {
      opens++;
      await page.reload();
      await expect(page.locator(".build-line")).toHaveText(`Build ${CURRENT_BUILD}`, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    expect(opens, "neuer Build braucht zu viele Neustarts").toBeLessThanOrEqual(2);
    testInfo.annotations.push({ type: "opens until new build", description: String(opens) });

    // Alter Cache ist weg, neuer vollständig da. Achtung: der neue Build kann schon sichtbar sein,
    // BEVOR der neue Service Worker aktiv ist — der alte SW lädt im Hintergrund nach (stale-while-
    // revalidate) und legt die neuen Dateien in SEINEN Cache. Gelöscht wird erst bei der Aktivierung
    // des neuen SW (nach dessen addAll); darauf mit großzügigem Zeitlimit warten.
    await waitForServiceWorker(page, CACHE);
    await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 30_000 }).toEqual([CACHE]);

    // Daten aus dem alten Build sind unverändert da.
    await expect(card(page, "E2E vor dem Update")).toBeVisible();
    await tab(page, "shopping");
    await expect.poll(() => shoppingNames(page)).toEqual(["Update-Milch"]);

    // 4. Nach dem Update klappt auch der Offline-Start mit dem NEUEN Build.
    await tab(page, "cookbook");
    await page.context().setOffline(true);
    await page.reload(); // index.html ist network-first → fällt auf den Cache zurück
    await expect(page.locator(".build-line")).toHaveText(`Build ${CURRENT_BUILD}`);
    await expect(card(page, "E2E vor dem Update")).toBeVisible();
  } finally {
    rmSync(prev.root, { recursive: true, force: true });
  }
});
