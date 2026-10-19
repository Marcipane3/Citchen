// app.js — Bedien-Helfer für die Koch-App (Selektoren an EINER Stelle, damit UI-Änderungen
// nur hier nachgezogen werden müssen).

import { expect } from "@playwright/test";

/** App öffnen (optional direkt auf einer Route) und warten, bis sie gerendert hat. */
export async function openApp(page, route = "") {
  await page.goto("/v2/" + (route ? "#/" + route : ""));
  await expect(page.locator("nav.tabbar .tab")).toHaveCount(5); // gemountet (im Kochmodus versteckt)
  await expect(page.locator("#app > *").first()).toBeAttached();
}

/** Kochbuch offen und Karten gerendert. */
export async function waitForCookbook(page) {
  await expect(page.locator("#cards .rcard").first()).toBeVisible();
}

/** Tab der unteren Leiste antippen: cookbook | lager | shopping | planner | assistant. */
export async function tab(page, go) {
  await page.locator(`nav.tabbar .tab[data-go="${go}"]`).click();
}

/** Eintrag im ☰-Menü: match | capture | settings | guide | __export | __login. */
export async function menu(page, go) {
  await page.locator("#menuBtn").click();
  await page.locator(`.sheet .menu-item[data-go="${go}"]`).click();
}

/** Karte im Kochbuch per exaktem Namen. */
export function card(page, name) {
  return page.locator("#cards .rcard").filter({ has: page.locator(".rname", { hasText: new RegExp(`^${escapeRe(name)}$`) }) });
}

/** Oberstes offenes Sheet (Detail, Formular, Menü …). Sheets sind 450 ms gegen Geister-Klicks gesperrt. */
export async function sheet(page) {
  const s = page.locator(".overlay .sheet").last();
  await expect(s).toBeVisible();
  await expect(s).not.toHaveAttribute("style", /pointer-events:\s*none/);
  return s;
}

/** Rezept-Detail per Suche öffnen. */
export async function openRecipe(page, name) {
  await page.locator("#search").fill(name);
  await card(page, name).click();
  const s = await sheet(page);
  await expect(s.locator(".detail-name")).toHaveText(name);
  return s;
}

/** Formular (neu/bearbeiten/Entwurf) ausfüllen. Nur übergebene Felder werden gesetzt. */
export async function fillForm(form, { name, category, time, ingredients, steps, tips } = {}) {
  if (name !== undefined) await form.locator("#f-name").fill(name);
  if (category !== undefined) await form.locator("#f-cat").selectOption(category);
  if (time !== undefined) await form.locator("#f-time").fill(time);
  if (ingredients) await fillRows(form.locator("#f-ing"), ingredients);
  if (steps) await fillRows(form.locator("#f-steps"), steps);
  if (tips !== undefined) await form.locator("#f-tips").fill(tips);
}

async function fillRows(editor, values) {
  // Vorhandene Zeilen leeren, dann der Reihe nach füllen (fehlende Zeilen per „+ Zeile“).
  const inputs = editor.locator(".frow input");
  for (let i = (await inputs.count()) - 1; i >= values.length; i--) await editor.locator(".frow .rm").nth(i).click();
  for (let i = 0; i < values.length; i++) {
    if ((await inputs.count()) <= i) await editor.locator(".addrow").click();
    await inputs.nth(i).fill(values[i]);
  }
}

/** Mit (Fake-)Google anmelden über Einstellungen und auf den ersten Rezept-Sync warten. */
export async function signIn(page) {
  await menu(page, "settings");
  await page.locator("#drive-connect").click();
  await expect(page.locator("#drive-status")).toHaveText("☁️ Verbunden · Synchronisiert ✓");
}

/** Rezept-Sync von Hand anstoßen (Einstellungen → „Jetzt synchronisieren“); gibt den Status zurück. */
export async function syncRecipes(page) {
  if (!(await page.locator("#drive-sync").isVisible().catch(() => false))) await menu(page, "settings");
  await page.locator("#drive-sync").click();
  await expect(page.locator("#drive-sync")).toBeEnabled();
  return page.locator("#drive-status").textContent();
}

/* ---------- Einkaufsliste ---------- */

/** Auf der Einkaufsliste mit Google verbinden und warten, bis die Liste in Drive liegt. */
export async function connectList(page) {
  await page.locator("#shop-sync .sl-login").click();
  await expect(page.locator("#shop-sync")).toContainText("In deinem Google Drive");
  await expect(page.locator("#shop-sync")).toContainText(/Aktualisiert um/);
}

/** Eigenen Artikel hinzufügen. */
export async function addItem(page, name) {
  await page.locator("#shop-custom").fill(name);
  await page.locator("#shop-custom").press("Enter");
  await expect(page.locator("#shop-list .sl-name", { hasText: name })).toHaveCount(1);
}

/** 🔄 antippen und warten, bis der Abgleich durch ist. */
export async function refreshList(page) {
  const btn = page.locator("#shop-sync .sl-refresh");
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.locator("#shop-sync")).not.toContainText("Synchronisiere");
  await expect(page.locator("#shop-sync .sl-refresh")).toBeEnabled();
}

/** Namen der nicht gelöschten Artikel einer einkaufsliste.json (Drive-Inhalt). */
export function liveNames(file) {
  return (file.items || []).filter((x) => !x.deleted).map((x) => x.name).sort();
}

/** Einen Wert aus IndexedDB (DB "koch-v2") lesen — kanonische, gespeicherte Daten. */
export function idb(page, store, key) {
  return page.evaluate(([store, key]) => new Promise((ok, fail) => {
    const open = indexedDB.open("koch-v2");
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(store, "readonly").objectStore(store);
      const req = key === undefined ? tx.getAll() : tx.get(key);
      req.onsuccess = () => { open.result.close(); ok(req.result); };
      req.onerror = () => fail(req.error);
    };
  }), [store, key]);
}

/** Sichtbare (nicht gelöschte) Einkaufsartikel-Namen auf dem Bildschirm. */
export async function shoppingNames(page) {
  return page.locator("#shop-list .sl-item .sl-name").evaluateAll((els) =>
    els.map((e) => (e.firstChild ? e.firstChild.textContent : e.textContent).trim()));
}

/** Warten, bis der Service Worker aktiv ist, die Seite steuert und `cache` (die Shell) angelegt hat. */
export async function waitForServiceWorker(page, cache) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect.poll(() => page.evaluate((c) => caches.keys().then((k) => k.includes(c)), cache)).toBe(true);
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
