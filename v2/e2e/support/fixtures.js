// fixtures.js — Gemeinsame Test-Bausteine.
//  - `drive` / `ai`: pro Test frische Fakes (FakeDrive wird von allen Geräten des Tests geteilt).
//  - `device(opts)`: öffnet ein „Gerät“ = eigener Browser-Kontext (eigenes IndexedDB/localStorage)
//    mit verdrahtetem Netz. Mehrere Geräte pro Test = Partner-/Mehrgeräte-Szenarien.
//  - `page`: das Standard-Gerät (Marcel, Deutsch) für Ein-Geräte-Tests.
// Jeder Test schlägt fehl, wenn die Seite eine ungefangene Ausnahme wirft (Anlass: v2.10,
// leerer Bildschirm durch einen Syntaxfehler, den keine Unit-Suite bemerkte).
// Netz: ALLES außer dem lokalen Server ist blockiert oder gefälscht — die Suite braucht weder
// Internet noch Google-Konto noch API-Key und schreibt nie in echte Daten.

import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDrive, GIS_SCRIPT, GAPI_SCRIPT } from "./fake-google.js";
import { FakeAnthropic } from "./fake-anthropic.js";
import { REPO_ROOT, startServer } from "./server.js";

export { expect };

/** BUILD-Stempel des Arbeitsstands (v2/src/version.js). */
export const CURRENT_BUILD = /BUILD\s*=\s*"([^"]+)"/.exec(readFileSync(join(REPO_ROOT, "v2/src/version.js"), "utf8"))[1];

/** Basis-Rezepte (kanonisch deutsch) und eine Übersetzung — Erwartungswerte für Tests. */
export function snapshot(lang = "") {
  const f = lang ? `rezepte.snapshot.${lang}.json` : "rezepte.snapshot.json";
  return JSON.parse(readFileSync(join(REPO_ROOT, "v2/data", f), "utf8"));
}

/**
 * Netz eines Kontexts verdrahten. Routen laufen in umgekehrter Registrier-Reihenfolge.
 * context.setOffline() wirkt in Playwright NICHT auf gefälschte (fulfill) Antworten und NICHT auf
 * Fetches des Service Workers — deshalb merkt sich `net.offline` den Zustand (Fakes antworten dann
 * mit Netzfehler) und schaltet einen geräteeigenen Server (`server`) mit ab.
 */
export async function wireNetwork(context, { drive, ai, local, server = null }) {
  const net = { offline: false };
  const setOffline = context.setOffline.bind(context);
  // Auch Anfragen des Service Workers ignorieren setOffline → eigener Server wird mit abgeschaltet.
  context.setOffline = async (v) => { net.offline = !!v; if (server) server.setDown(v); await setOffline(v); };
  const online = (handler) => (route) => (net.offline ? route.abort("internetdisconnected") : handler(route));

  // Zuletzt geprüft: lokaler Server darf durch, alles andere ist hart blockiert.
  await context.route(() => true, (route) => {
    const u = new URL(route.request().url());
    if (local.some((origin) => u.origin === origin) || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    return route.abort("blockedbyclient");
  });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/css", "access-control-allow-origin": "*" }, body: "" }));
  await context.route("https://accounts.google.com/gsi/client", online((route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/javascript" }, body: GIS_SCRIPT })));
  await context.route("https://apis.google.com/js/api.js", online((route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/javascript" }, body: GAPI_SCRIPT })));
  await context.route(/^https:\/\/www\.googleapis\.com\//, online((route) => drive.handle(route)));
  await context.route(/^https:\/\/api\.anthropic\.com\//, online((route) => ai.handle(route)));
}

export const test = base.extend({
  drive: async ({}, use) => { await use(new FakeDrive()); },
  ai: async ({}, use) => { await use(new FakeAnthropic()); },

  device: async ({ browser, baseURL, serviceWorkers, viewport, drive, ai }, use, testInfo) => {
    const opened = [];
    const local = [new URL(baseURL).origin];

    /**
     * Neues Gerät. user = Google-Konto beim Anmelden (null = Anmelden schlägt fehl),
     * lang = vorgewählte UI-Sprache (null = echter Erststart mit Sprachauswahl),
     * server = eigener Server aus `startServer()` (Service-Worker-Tests: echtes Offline, Deploys).
     */
    async function device({ user = "marcel", lang = "de", server = null } = {}) {
      if (server) local.push(server.url);
      const context = await browser.newContext({ baseURL: server ? server.url : baseURL, serviceWorkers, viewport });
      await wireNetwork(context, { drive, ai, local, server });
      await context.addInitScript(({ user, lang }) => {
        window.__E2E_USER = user;
        try { if (lang && !localStorage.getItem("kochv2_lang")) localStorage.setItem("kochv2_lang", lang); } catch (e) { /* egal */ }
      }, { user, lang });

      const page = await context.newPage();
      const dev = { context, page, user, errors: [], dialogs: [] };
      page.on("pageerror", (e) => dev.errors.push(e.message));
      // alert/confirm/prompt: immer bestätigen (prompt mit Vorgabewert) und mitschreiben.
      page.on("dialog", (d) => {
        dev.dialogs.push({ type: d.type(), message: d.message() });
        (d.type() === "prompt" ? d.accept(d.defaultValue()) : d.accept()).catch(() => {});
      });
      opened.push(dev);
      return dev;
    }

    await use(device);

    for (const d of opened) await d.context.close().catch(() => {});
    const errors = opened.flatMap((d) => d.errors.map((e) => `[${d.user}] ${e}`));
    if (errors.length) testInfo.annotations.push({ type: "pageerror", description: errors.join("\n") });
    expect(errors, "ungefangene Fehler im Browser").toEqual([]);
  },

  /** Eigener Server nur für diesen Test (setDown/setRoot betreffen niemand anderen). */
  server: async ({}, use) => {
    const s = await startServer();
    await use(s);
    await s.close();
  },

  page: async ({ device }, use) => {
    const { page } = await device();
    await use(page);
  },
});
