// Flow 15 — Assistenten-Anweisungen (Q4.2, #70): in den Einstellungen bearbeiten, speichern,
// fehlende Variablen wieder einfügen, zurücksetzen — und was davon beim Assistenten ankommt.
import { test, expect } from "../support/fixtures.js";
import { openApp, menu, tab } from "../support/app.js";

const KEY = "sk-ant-e2e-not-a-real-key";
const PIRATE = "Antworte wie ein Pirat, Arrr!";

async function saveKey(page) {
  await menu(page, "settings");
  await page.locator("#set-key").fill(KEY);
  await page.locator("#key-save").click();
  await expect(page.locator("#key-status")).toHaveText(/gespeichert/i);
}

/** Aus dem Modul der App (keine Kopie im Test). */
const fromPrompts = (page, name) => page.evaluate(async (n) => {
  const m = await import("/v2/src/ai/prompts.js");
  return typeof m[n] === "function" ? m[n]() : m[n];
}, name);

const systemText = (req) => req.body.system[0].text;

async function ask(page, ai, q) {
  const before = ai.requests.length;
  ai.reply(JSON.stringify({ type: "text", text: "Ahoi!" }));
  await tab(page, "assistant");
  await page.locator("#ai-input").fill(q);
  await page.locator("#ai-send").click();
  await expect.poll(() => ai.requests.length).toBe(before + 1);
  return ai.requests.at(-1);
}

test("Q4.2: eigene Anweisungen speichern → nächste Anfrage trägt sie + festen Teil; Reset → wieder Default", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  const DEFAULT = await fromPrompts(page, "DEFAULT_INSTRUCTIONS");
  const fixed = await fromPrompts(page, "appendedFixedPart");

  // Abschnitt unter dem Koch-Profil: Textfeld mit aktuellem Text, fünf Variablen, Speichern/Zurücksetzen.
  const cards = page.locator(".set-card");
  const profIdx = await cards.evaluateAll((els) => els.findIndex((e) => e.querySelector("#prof-save")));
  await expect(cards.nth(profIdx + 1)).toHaveId("instr-card");
  await expect(page.locator("#instr-card h3")).toHaveText(/Assistenten-Anweisungen/);
  await expect(page.locator("#instr-text")).toHaveValue(DEFAULT);
  await expect(page.locator("#instr-vars li")).toHaveCount(5);
  for (const v of ["profile", "stock", "fridge", "recipes", "language"]) {
    await expect(page.locator("#instr-vars")).toContainText(`{${v}}`);
  }

  // Fester Teil: eingeklappt, nur lesbar, genau der Text aus prompts.js.
  await expect(page.locator("#instr-fixed")).not.toHaveAttribute("open", /.*/);
  await expect(page.locator("#instr-fixed-text")).toBeHidden();
  expect(await page.locator("#instr-fixed-text").evaluate((e) => e.textContent)).toBe(fixed);
  await page.locator("#instr-fixed summary").click();
  await expect(page.locator("#instr-fixed-text")).toBeVisible();
  expect(await page.locator("#instr-fixed-text").evaluate((e) => e.isContentEditable)).toBe(false);
  expect(await page.locator("#instr-fixed textarea, #instr-fixed input, #instr-fixed [contenteditable]").count()).toBe(0);

  // Bearbeiten + speichern → die nächste Anfrage trägt den Text, dahinter der feste Teil.
  const edited = PIRATE + "\n" + DEFAULT;
  await page.locator("#instr-text").fill(edited);
  await page.locator("#instr-save").click();
  await expect(page.locator("#instr-status")).toHaveText("✓ Anweisungen gespeichert.");
  await expect(page.locator("#instr-warn")).toBeHidden();
  const custom = systemText(await ask(page, ai, "Was koche ich heute?"));
  expect(custom.startsWith("Antworte wie ein Pirat, Arrr!\nDu bist der Koch-Assistent")).toBe(true);
  expect(custom.endsWith(fixed)).toBe(true);

  // Reset (mit Bestätigung) → Text wieder Default, nächste Anfrage = Default-Prompt.
  await menu(page, "settings");
  await expect(page.locator("#instr-text")).toHaveValue(edited); // überlebt den Routenwechsel
  await page.locator("#instr-reset").click();
  await expect(page.locator("#instr-status")).toHaveText("✓ Standard-Anweisungen wiederhergestellt.");
  await expect(page.locator("#instr-text")).toHaveValue(DEFAULT);
  const def = systemText(await ask(page, ai, "Und morgen?"));
  expect(def).not.toContain("Pirat");
  expect(def.startsWith("Du bist der Koch-Assistent")).toBe(true);
  expect(def.endsWith(fixed)).toBe(false); // ohne eigene Vorlage keine Zusatz-Regel 5
  expect(def.endsWith(fixed.slice(0, fixed.indexOf("\n5.")))).toBe(true);
});

test("Q4.2: fehlende Variable → Warnung nennt sie; „Wieder einfügen“ hängt sie an; „Trotzdem speichern“ speichert wie getippt", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  const DEFAULT = await fromPrompts(page, "DEFAULT_INSTRUCTIONS");

  // {recipes} entfernt → Warnung, nichts gespeichert.
  const noRecipes = DEFAULT.replace("{recipes}", "");
  await page.locator("#instr-text").fill(noRecipes);
  await page.locator("#instr-save").click();
  await expect(page.locator("#instr-warn")).toBeVisible();
  await expect(page.locator("#instr-warn-text")).toContainText("{recipes}");
  await expect(page.locator("#instr-warn-text")).not.toContainText("{stock}");
  await expect(page.locator("#instr-status")).toHaveText("");

  // „Wieder einfügen“ → am Ende in eigener Zeile, gespeichert.
  await page.locator("#instr-addback").click();
  await expect(page.locator("#instr-status")).toHaveText("✓ Anweisungen gespeichert.");
  await expect(page.locator("#instr-warn")).toBeHidden();
  const back = await page.locator("#instr-text").inputValue();
  expect(back.endsWith("\n{recipes}")).toBe(true);
  expect(back).toBe(noRecipes + "\n{recipes}");
  const sys = systemText(await ask(page, ai, "Was koche ich heute?"));
  expect(sys).toContain("KOCHBUCH (");

  // Zwei fehlen → beide genannt; „Trotzdem speichern“ speichert genau den getippten Text.
  await menu(page, "settings");
  await page.locator("#instr-text").fill(PIRATE + " {profile} {stock} {fridge}");
  await page.locator("#instr-save").click();
  await expect(page.locator("#instr-warn-text")).toContainText("{recipes}, {language}");
  await page.locator("#instr-anyway").click();
  await expect(page.locator("#instr-status")).toHaveText("✓ Anweisungen gespeichert.");
  await expect(page.locator("#instr-text")).toHaveValue(PIRATE + " {profile} {stock} {fridge}");
  const anyway = systemText(await ask(page, ai, "Und jetzt?"));
  expect(anyway.startsWith(PIRATE + " KOCH-PROFIL:")).toBe(true);
  expect(anyway).not.toContain("KOCHBUCH (");
});

test("Q4.2: leerer Text speichern = Zurücksetzen; HTML im Text bleibt Text", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  const DEFAULT = await fromPrompts(page, "DEFAULT_INSTRUCTIONS");

  const html = '<img src=x onerror="window.__pwned=1"> {profile}{stock}{fridge}{recipes}{language}';
  await page.locator("#instr-text").fill(html);
  await page.locator("#instr-save").click();
  await expect(page.locator("#instr-status")).toHaveText("✓ Anweisungen gespeichert.");
  await menu(page, "settings"); // neu rendern: Text wird über .value wieder eingefüllt
  await expect(page.locator("#instr-text")).toHaveValue(html);
  await expect(page.locator("#instr-card img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();

  await page.locator("#instr-text").fill("   \n ");
  await page.locator("#instr-save").click();
  await expect(page.locator("#instr-warn")).toBeHidden();
  await expect(page.locator("#instr-status")).toHaveText("✓ Standard-Anweisungen wiederhergestellt.");
  await expect(page.locator("#instr-text")).toHaveValue(DEFAULT);
  const sys = systemText(await ask(page, ai, "Was koche ich heute?"));
  expect(sys.startsWith("Du bist der Koch-Assistent")).toBe(true);
});

test("Q4.2: Planner-Anfrage bleibt bei den Default-Anweisungen", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator("#instr-text").fill(PIRATE + " {profile}{stock}{fridge}{recipes}{language}");
  await page.locator("#instr-save").click();
  await expect(page.locator("#instr-status")).toHaveText("✓ Anweisungen gespeichert.");

  await tab(page, "planner");
  await page.locator("#genBtn").click();
  await expect(page.locator("#plan-days .plan-day")).toHaveCount(7);
  await page.evaluate(() => { window.prompt = () => "Mehr Pasta"; });
  ai.reply(JSON.stringify({ type: "plan", days: {}, note: "" }));
  await page.locator("#aiBtn").click();
  await expect.poll(() => ai.requests.length).toBe(1);
  const sys = JSON.stringify(ai.requests[0].body.system);
  expect(sys).not.toContain("Pirat");
  expect(sys).toContain("Du bist der Koch-Assistent");
});
