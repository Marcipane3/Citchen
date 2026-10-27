// Flow 10 — Update vom vorigen Build: Ein Gerät hat den alten Release installiert (Service Worker +
// Cache + eigene Daten). Dann wird der aktuelle Stand „deployt“ (gleiche Adresse). Erwartet:
// neuer Build spätestens beim zweiten Öffnen, alter Cache weg, Daten unverändert, offline weiter ok.
// Zweimal: vom echten Vorgänger (git; sein Worker ist der des letzten Releases) und von einem
// synthetischen Vorgänger mit dem AKTUELLEN Worker — so ist auch der Update-Weg geprüft, den der
// nächste Release vorfindet.
import { test, expect, CURRENT_BUILD } from "../support/fixtures.js";
import { openApp, tab, card, sheet, fillForm, addItem, shoppingNames, waitForServiceWorker, waitForUpdateApplied, escapeRe } from "../support/app.js";
import { materializePreviousBuild, cacheOf } from "../support/previous-build.js";
import { REPO_ROOT } from "../support/server.js";
import { rmSync } from "node:fs";

test.use({ serviceWorkers: "allow" });

for (const from of ["vorigen Build", "aktuellen Worker"]) {
  test(`Update vom ${from}: neuer Build kommt an, alter Cache wird gelöscht, Daten bleiben`, async ({ device, server }, testInfo) => {
    // Unter Last (volle Suite, 4 Worker) dauert schon das install des neuen SW (addAll, ~1 MB) Sekunden.
    test.setTimeout(60_000);
    const prev = materializePreviousBuild({ synthetic: from !== "vorigen Build" });
    testInfo.annotations.push({ type: "previous build", description: `${prev.build} (${prev.source})` });
    const CACHE = cacheOf(REPO_ROOT);
    expect(prev.build, "BUILD wurde nicht erhöht").not.toBe(CURRENT_BUILD);
    expect(prev.cache, "SW-CACHE wurde nicht erhöht — Nutzer bekämen alte Module").not.toBe(CACHE);

    try {
      // 1. Alter Release ist installiert und benutzt.
      server.setRoot(prev.root);
      const { page } = await device({ server });
      await openApp(page);
      const buildLine = page.locator(".build-line");
      await expect(buildLine).toHaveText(`Build ${prev.build}`);
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

      // 3. Nutzer öffnet die App wieder — neuer Build spätestens beim zweiten Öffnen.
      //    Das erste Öffnen läuft noch über den alten Worker (alter Build) und stößt das Update an:
      //    der neue Worker lädt die ganze Shell (addAll) und übernimmt. Zwischen zwei echten Starts
      //    vergeht diese Zeit; früher hat der Test stattdessen im 2-s-Takt neu geladen und damit nur
      //    das stückweise Nachladen des alten Workers gemessen (bis v2.16, s. sw.js).
      await tab(page, "cookbook");
      let opens = 1;
      await page.reload();
      await expect(buildLine).toHaveText(new RegExp(`^Build (${escapeRe(prev.build)}|${escapeRe(CURRENT_BUILD)})$`));
      if ((await buildLine.textContent()) !== `Build ${CURRENT_BUILD}`) {
        await waitForUpdateApplied(page, CACHE);
        opens++;
        await page.reload();
      }
      await expect(buildLine, "neuer Build braucht zu viele Neustarts").toHaveText(`Build ${CURRENT_BUILD}`);
      testInfo.annotations.push({ type: "opens until new build", description: String(opens) });

      // Alter Cache ist weg, der neue Worker steuert. Ein Worker bis v2.16 kann seinen Cache noch
      // kurz NACH der Aktivierung des neuen wieder anlegen (Hintergrund-Update außerhalb der Event-
      // Lebenszeit) — der neue liest nie daraus und räumt ihn beim nächsten Öffnen weg. Ab v2.16.1
      // passiert das nicht mehr: dann muss er sofort und ohne weiteres Öffnen weg sein.
      await waitForServiceWorker(page, CACHE);
      if (prev.atomic) {
        await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 15_000 }).toEqual([CACHE]);
      } else {
        await expect(async () => {
          await page.reload();
          expect(await page.evaluate(() => caches.keys())).toEqual([CACHE]);
        }).toPass({ timeout: 15_000 });
      }

      // Daten aus dem alten Build sind unverändert da.
      await expect(card(page, "E2E vor dem Update")).toBeVisible();
      await tab(page, "shopping");
      await expect.poll(() => shoppingNames(page)).toEqual(["Update-Milch"]);

      // 4. Nach dem Update klappt auch der Offline-Start mit dem NEUEN Build.
      await tab(page, "cookbook");
      await page.context().setOffline(true);
      await page.reload(); // index.html ist network-first → fällt auf den Cache zurück
      await expect(buildLine).toHaveText(`Build ${CURRENT_BUILD}`);
      await expect(card(page, "E2E vor dem Update")).toBeVisible();
    } finally {
      rmSync(prev.root, { recursive: true, force: true });
    }
  });
}
