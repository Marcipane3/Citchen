// Flow 4 — Erfassung mit Review: URL → (Fake-)KI → Entwurf im Formular prüfen → speichern.
// Nie wird etwas ungeprüft gespeichert; ohne Key bleibt die KI ehrlich gesperrt.
import { test, expect } from "../support/fixtures.js";
import { openApp, menu, tab, sheet, fillForm, idb } from "../support/app.js";
// Wire-Werte aus v2/src/ai/models.js (Playwright lädt src/ nicht als ES-Modul; test-ai-usage.js
// bindet dieselben Werte an die Konfiguration).
const CAPTURE_MODEL = "claude-sonnet-5-5";
const CHAT_DEFAULT = "claude-haiku-4-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const KEY = "sk-ant-e2e-not-a-real-key";
const DRAFT = {
  name: "Shakshuka mit Feta",
  category: "frühstück", // KI-Antworten sind nicht immer exakt → tolerant gematcht
  time: "25 Min", servings: "~2",
  ingredients: ["4 Eier", "400g Dosentomaten", "1 Paprika", "100g Feta"],
  steps: ["Paprika anbraten.", "Tomaten 10 Min köcheln.", "Eier hineinsetzen, 6 Min stocken lassen."],
  tips: "Topping: Feta",
};

async function saveKey(page) {
  await menu(page, "settings");
  await page.locator("#set-key").fill(KEY);
  await page.locator("#key-save").click();
  await expect(page.locator("#key-status")).toHaveText(/gespeichert/i);
}

test("Ohne Schlüssel: Erfassung erklärt die Sperre und ruft keine KI auf", async ({ page, ai }) => {
  await openApp(page, "capture");
  await expect(page.locator("main")).toContainText("braucht deinen API-Schlüssel");
  await page.locator("#cap-url").fill("https://example.com/rezept/shakshuka");
  await page.locator("#cap-url-analyze").click();
  await expect(page.locator("#card-url .cap-slot")).toContainText("braucht deinen API-Schlüssel");
  expect(ai.requests).toHaveLength(0);

  // Der manuelle Weg geht immer.
  await page.locator("#cap-manual").click();
  const form = await sheet(page);
  await expect(form.locator(".cat-label")).toHaveText("Rezept-Entwurf prüfen");
});

test("URL-Import: KI-Entwurf wird geprüft, korrigiert und als neues Rezept gespeichert", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await menu(page, "capture");
  await expect(page.locator("main")).toContainText("API-Schlüssel vorhanden");

  ai.reply(JSON.stringify(DRAFT));
  await page.locator("#cap-url").fill("https://example.com/rezept/shakshuka");
  await page.locator("#cap-url").press("Enter"); // C2: Enter reicht

  // Review-Formular ist mit dem Entwurf vorbefüllt — gespeichert ist noch nichts.
  const form = await sheet(page);
  await expect(form.locator(".cat-label")).toHaveText("Rezept-Entwurf prüfen");
  await expect(form.locator("#f-name")).toHaveValue(DRAFT.name);
  await expect(form.locator("#f-cat")).toHaveValue("Frühstück & Brunch");
  await expect(form.locator("#f-ing .frow input")).toHaveCount(4);
  await expect(form.locator("#f-totry")).toBeChecked();
  await expect(page.locator("#card-url .cap-slot")).toContainText("Rezept erkannt");
  await expect(page.locator("#cap-url")).toHaveValue(""); // A1: sauberes Blatt
  expect((await idb(page, "recipes")).some((r) => r.name === DRAFT.name)).toBe(false);

  // Was ging an die API? Nur Anthropic, mit Key-Header, Vision-Modell + web_fetch, URL im Prompt.
  expect(ai.requests).toHaveLength(1);
  const req = ai.requests[0];
  expect(req.url).toBe("https://api.anthropic.com/v1/messages");
  expect(req.headers["x-api-key"]).toBe(KEY);
  expect(req.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  expect(req.body.tools.map((t) => t.name)).toEqual(["web_fetch"]);
  expect(JSON.stringify(req.body.messages)).toContain("https://example.com/rezept/shakshuka");
  // v2.16 (Q1): Erfassung = feste Aufgabe aus ai/models.js (Sonnet 5.5, wenig Denkaufwand, Fallback).
  expect(req.body.model).toBe(CAPTURE_MODEL);
  expect(req.body.output_config).toEqual({ effort: "low" });
  expect(req.body.fallbacks).toBe("default");
  expect(req.headers["anthropic-beta"]).toBe(FALLBACK_BETA);

  // Prüfen + korrigieren, dann speichern → Detail des neuen Rezepts.
  await fillForm(form, { name: "Shakshuka (E2E)" });
  await form.locator(".save-btn").click();
  const detail = await sheet(page);
  await expect(detail.locator(".detail-name")).toHaveText("Shakshuka (E2E)");
  const saved = (await idb(page, "recipes")).find((r) => r.name === "Shakshuka (E2E)");
  expect(saved).toMatchObject({ category: "Frühstück & Brunch", ingredients: DRAFT.ingredients, steps: DRAFT.steps, toTry: true });
});

test("KI-Fehler werden in der Karte erklärt (ungültiger Key, kein Rezept)", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await menu(page, "capture");
  const slot = page.locator("#card-url .cap-slot");

  ai.reply({ status: 401, error: "invalid x-api-key" });
  await page.locator("#cap-url").fill("https://example.com/a");
  await page.locator("#cap-url-analyze").click();
  await expect(slot).toContainText("API-Schlüssel ungültig");
  await expect(slot.locator('a[href="#/settings"]')).toBeVisible();

  ai.reply('{"error":"kein Rezept erkennbar"}');
  await page.locator("#cap-url").fill("https://example.com/b");
  await page.locator("#cap-url-analyze").click();
  await expect(slot).toContainText("Kein Rezept erkannt");
  await expect(page.locator(".overlay")).toHaveCount(0);
});

test("Mehrere auf einmal: Auswahl prüfen, nur Angehakte werden gespeichert", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await menu(page, "capture");

  const second = { ...DRAFT, name: "Linsen-Dal", category: "Asiatisch inspiriert" };
  ai.reply(JSON.stringify({ recipes: [DRAFT, second] }));
  await page.locator("#cap-bulk").fill("Shakshuka … Linsen-Dal …");
  await page.locator("#cap-bulk-text").click();

  const rows = page.locator("#bulk-list .bulk-row");
  await expect(rows).toHaveCount(2);
  await rows.nth(0).locator(".bulk-cb").uncheck();
  await page.locator("#bulk-save").click();
  await expect(page.locator("#card-bulk .cap-slot")).toContainText("1 Rezept(e) gespeichert");

  const names = (await idb(page, "recipes")).map((r) => r.name);
  expect(names).toContain("Linsen-Dal");
  expect(names).not.toContain(DRAFT.name);
});

test("v2.16: Assistent cached den System-Prompt; Einstellungen zeigen den echten Verbrauch pro Aktion", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await expect(page.locator("#usage-box")).toContainText("Noch keine KI-Aufrufe");

  // Q2: zwei Chat-Runden — jedes Mal derselbe System-Prompt als Block mit cache_control.
  await tab(page, "assistant");
  for (const [i, q] of ["Was koche ich heute?", "Und morgen?"].entries()) {
    ai.reply(JSON.stringify({ type: "text", text: `Linsen-Dal ${i + 1}!` }));
    await page.locator("#ai-input").fill(q);
    await page.locator("#ai-send").click();
    await expect(page.locator(".ai-msg.ai")).toHaveCount(i + 1); // erst die Antwort, dann die nächste Frage
    await expect(page.locator(".ai-msg.ai").last()).toContainText(`Linsen-Dal ${i + 1}!`);
  }
  expect(ai.requests).toHaveLength(2);
  const [a, b] = ai.requests.map((r) => r.body);
  expect(a.model).toBe(CHAT_DEFAULT);
  expect(a.system).toHaveLength(1);
  expect(a.system[0].cache_control).toEqual({ type: "ephemeral" });
  expect(a.system[0].text).toContain("KOCHBUCH");
  expect(b.system).toEqual(a.system); // Byte-gleich → Cache-Treffer möglich
  expect(a.output_config).toBeUndefined(); // Haiku 4.5 kennt kein effort
  expect(ai.requests[0].headers["anthropic-beta"]).toBeUndefined();

  // Q3: Fake-API meldet je 10/10 Tokens → 1 Zeile „Assistent“, 2 Aufrufe.
  await menu(page, "settings");
  const rows = page.locator("#usage-box tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Assistent");
  await expect(rows.first().locator("td").nth(1)).toHaveText("2");
  await expect(rows.first().locator("td").nth(2)).toHaveText("10 / 10");
  await expect(page.locator("#usage-box tfoot")).toContainText("Summe");

  await page.locator("#usage-clear").click();
  await expect(page.locator("#usage-box")).toContainText("Noch keine KI-Aufrufe");
});
