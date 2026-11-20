// Flow 16 — Assistent schlägt Rezept-Änderungen vor (G3.2, #73): Rezept anhängen, Wunsch tippen,
// Bestätigungskarte (nur was sich ändert), nichts gespeichert vor „Änderung übernehmen“ — und „✎ Bearbeiten“
// bleibt ohne Schlüssel die volle Alternative.
import { test, expect, snapshot } from "../support/fixtures.js";
import { openApp, menu, sheet, openRecipe, fillForm, idb } from "../support/app.js";

const KEY = "sk-ant-e2e-not-a-real-key";
const BASE = snapshot().recipes.find((r) => r.id === "r01");

async function saveKey(page) {
  await menu(page, "settings");
  await page.locator("#set-key").fill(KEY);
  await page.locator("#key-save").click();
  await expect(page.locator("#key-status")).toHaveText(/gespeichert/i);
}

/** Das geänderte Rezept, wie es das Modell schicken würde (komplett, plus Störfelder, die nie ankommen dürfen). */
function veganUpdate() {
  const ingredients = BASE.ingredients.map((l) => (l === "Reis als Beilage" ? "Quinoa als Beilage <b>bio</b>" : l));
  return {
    type: "update", id: "r01", intro: "Mit Quinoa statt Reis. <img src=x onerror=\"window.__xss=1\">",
    recipe: { ...BASE, name: BASE.name + " und Quinoa", ingredients, favorite: false, rating: 0, origin: "shared" },
  };
}

test("#73: Rezept anhängen → Wunsch → Karte zeigt nur die Änderung → nichts gespeichert → übernehmen hält Herz und Bewertung", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator('nav.tabbar .tab[data-go="cookbook"]').click();

  // Herz + 4 Sterne setzen, damit wir sehen, dass sie die Änderung überleben.
  let detail = await openRecipe(page, BASE.name);
  await detail.locator(".heart").click();
  await detail.locator('[data-rate] .star[data-v="4"]').click();
  await expect.poll(async () => (await idb(page, "recipes", "r01")).rating).toBe(4);
  const before = await idb(page, "recipes", "r01");
  expect(before.favorite).toBe(true);

  // „✎ Bearbeiten“ steht direkt neben „✨ Mit Assistent ändern“.
  await expect(detail.locator(".edit + .act-ai-change")).toHaveText("✨ Mit Assistent ändern");
  await detail.locator(".act-ai-change").click();
  await expect(page).toHaveURL(/#\/assistant$/);
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.locator("#ai-attach")).toContainText(BASE.name);

  ai.reply(JSON.stringify(veganUpdate()));
  await page.locator("#ai-input").fill("mach es vegan");
  await page.locator("#ai-send").click();
  await expect.poll(() => ai.requests.length).toBe(1);
  await expect(page.locator("#ai-attach")).toHaveCount(0); // gilt nur für diese eine Nachricht

  // Die Anfrage trägt den vollen deutschen Rezepttext (Zutaten + Schritte), nichts Persönliches.
  const sent = ai.requests[0].body.messages.at(-1).content;
  for (const line of [...BASE.ingredients, ...BASE.steps]) expect(sent).toContain(JSON.stringify(line));
  expect(sent).toContain("mach es vegan");
  expect(sent).not.toContain('"rating"');

  // Bestätigungskarte: Name, geänderte Felder alt → neu, + / − Zeilen; Modelltext nur als Text.
  const card = page.locator(".ai-update");
  await expect(card).toBeVisible();
  await expect(card.locator(".sug-name")).toHaveText(BASE.name);
  await expect(card.locator('[data-field="name"] .upd-old')).toHaveText(BASE.name);
  await expect(card.locator('[data-field="name"] .upd-new')).toHaveText(BASE.name + " und Quinoa");
  await expect(card.locator('[data-field="ingredients"] .upd-add')).toHaveText(["+ Quinoa als Beilage <b>bio</b>"]);
  await expect(card.locator('[data-field="ingredients"] .upd-rm')).toHaveText(["− Reis als Beilage"]);
  await expect(card.locator(".upd-field")).toHaveCount(2);
  await expect(card.locator("b:text('bio')")).toHaveCount(0);
  await expect(page.locator(".ai-msg.ai")).toContainText('<img src=x onerror="window.__xss=1">');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  // Nichts gespeichert, bevor „Änderung übernehmen“ getippt ist — auch nicht nach „Erst ansehen“.
  await card.locator("[data-preview-update]").click();
  const pv = await sheet(page);
  await expect(pv.locator(".detail-name")).toHaveText(BASE.name + " und Quinoa");
  await expect(pv.locator("ul li")).toContainText(["Quinoa als Beilage <b>bio</b>"]);
  await expect(pv.locator("#pv-save")).toHaveText("✅ Änderung übernehmen");
  await pv.locator(".close").click();
  await expect(page.locator(".overlay")).toHaveCount(0);
  expect(await idb(page, "recipes", "r01")).toEqual(before);
  expect((await idb(page, "recipes")).length).toBe(snapshot().recipes.length);

  // Übernehmen → Inhalt geändert; Herz, Bewertung, Koch-Daten und (fehlendes) origin unverändert.
  await card.locator("[data-apply-update]").click();
  await expect(card.locator("[data-apply-update]")).toHaveText("✓ Übernommen");
  await expect.poll(async () => (await idb(page, "recipes", "r01")).name).toBe(BASE.name + " und Quinoa");
  const after = await idb(page, "recipes", "r01");
  expect(after.ingredients).toContain("Quinoa als Beilage <b>bio</b>");
  expect(after.ingredients).not.toContain("Reis als Beilage");
  for (const f of ["favorite", "rating", "cookedCount", "lastCooked", "photos", "feedback"]) expect(after[f]).toEqual(before[f]);
  expect("origin" in after).toBe(false);
  expect((await idb(page, "recipes")).length).toBe(snapshot().recipes.length);
});

test("#73: Änderung ohne Unterschied → nur Text, keine Karte", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator('nav.tabbar .tab[data-go="cookbook"]').click();
  const detail = await openRecipe(page, BASE.name);
  await detail.locator(".act-ai-change").click();
  ai.reply(JSON.stringify({ type: "update", id: "r01", intro: "Schon vegan!", recipe: { ...BASE } }));
  await page.locator("#ai-input").fill("mach es vegan");
  await page.locator("#ai-send").click();
  await expect(page.locator(".ai-msg.ai")).toHaveText("Der Vorschlag ändert nichts am Rezept — es bleibt, wie es ist.");
  await expect(page.locator(".ai-update")).toHaveCount(0);
});

test("#73: offener Chat — Änderungswunsch → Knopf öffnet „Mit Assistent ändern“; unbekannte id → nur Text", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator('nav.tabbar .tab[data-go="assistant"]').click();

  ai.reply(JSON.stringify({ type: "change", id: "r99", intro: "Welches Rezept meinst du?" }));
  await page.locator("#ai-input").fill("mach das Curry vegan");
  await page.locator("#ai-send").click();
  await expect(page.locator(".ai-msg.ai").last()).toHaveText("Welches Rezept meinst du?");
  await expect(page.locator("[data-change-recipe]")).toHaveCount(0);

  ai.reply(JSON.stringify({ type: "change", id: "r01", intro: "Das geht über das Rezept selbst." }));
  await page.locator("#ai-input").fill("mach das Süßkartoffel-Curry vegan");
  await page.locator("#ai-send").click();
  const btn = page.locator('[data-change-recipe="r01"]');
  await expect(btn).toHaveText(`✨ „${BASE.name}“ mit Assistent ändern`);
  await expect(page.locator("#ai-attach")).toHaveCount(0);
  await btn.click();
  await expect(page.locator("#ai-attach")).toContainText(BASE.name);
  await expect(page.locator("#ai-input")).toHaveAttribute("placeholder", /Was soll sich ändern/);
  await page.locator("#ai-detach").click();
  await expect(page.locator("#ai-attach")).toHaveCount(0);
});

test("#73: ohne Schlüssel — kein Assistenten-Knopf, „✎ Bearbeiten“ ändert eine Zutat und speichert", async ({ page, ai }) => {
  await openApp(page);
  const detail = await openRecipe(page, BASE.name);
  await expect(detail.locator(".act-ai-change")).toHaveCount(0);
  await expect(detail.locator(".edit")).toBeVisible();
  await detail.locator(".edit").click();
  const form = await sheet(page);
  const ingredients = BASE.ingredients.map((l) => (l === "Reis als Beilage" ? "Couscous als Beilage" : l));
  await fillForm(form, { ingredients });
  await form.locator(".save-btn").click();
  await expect.poll(async () => (await idb(page, "recipes", "r01")).ingredients).toEqual(ingredients);
  expect(ai.requests.length).toBe(0);
});

test("#73 B1: übernommene Karte bleibt nach Tab-Wechsel deaktiviert", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator('nav.tabbar .tab[data-go="cookbook"]').click();
  const detail = await openRecipe(page, BASE.name);
  await detail.locator(".act-ai-change").click();
  ai.reply(JSON.stringify(veganUpdate()));
  await page.locator("#ai-input").fill("mach es vegan");
  await page.locator("#ai-send").click();
  const apply = page.locator(".ai-update [data-apply-update]");
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(apply).toHaveText("✓ Übernommen");
  await expect.poll(async () => (await idb(page, "recipes", "r01")).ingredients).toContain("Quinoa als Beilage <b>bio</b>");

  await page.locator('nav.tabbar .tab[data-go="cookbook"]').click();
  await page.locator('nav.tabbar .tab[data-go="assistant"]').click();
  await expect(page.locator(".ai-update [data-apply-update]")).toBeDisabled();
  await expect(page.locator(".ai-update [data-apply-update]")).toHaveText("✓ Übernommen");
});

test("#73 B4: neues Rezept aus dem Assistenten → Karte → „In Kochbuch speichern“ legt es an", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator('nav.tabbar .tab[data-go="assistant"]').click();
  const count = snapshot().recipes.length;
  const recipe = {
    name: "Testsuppe B4", category: BASE.category, servings: "2", time: "20 Min",
    ingredients: ["1 Zwiebel", "500 ml Brühe"], steps: ["Zwiebel anbraten.", "Brühe zugeben und kochen."],
  };
  ai.reply(JSON.stringify({ type: "recipe", intro: "Hier ein Vorschlag.", recipe }));
  await page.locator("#ai-input").fill("eine einfache Suppe");
  await page.locator("#ai-send").click();
  const save = page.locator(".ai-recipe [data-save-recipe]");
  await expect(save).toBeVisible();
  await save.click();
  await expect.poll(async () => (await idb(page, "recipes")).length).toBe(count + 1);
  expect((await idb(page, "recipes")).some((r) => r.name === "Testsuppe B4")).toBe(true);
});

// ---- #74 (G3.3): Assistent löscht nur selbst angelegte Rezepte ----
const MINE = {
  name: "E2E Eigene Suppe", category: "Suppen & Eintöpfe", time: "20 Min",
  ingredients: ["1 Zwiebel", "500 ml Brühe"], steps: ["Zwiebel anbraten.", "Brühe zugeben."],
};

async function createOwn(page) {
  await page.locator("#addBtn").click();
  const form = await sheet(page);
  await fillForm(form, MINE);
  await form.locator(".save-btn").click();
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect.poll(async () => (await idb(page, "recipes")).find((r) => r.name === MINE.name)?.origin).toBe("user");
  return (await idb(page, "recipes")).find((r) => r.name === MINE.name);
}

async function ask(page, ai, reply, text) {
  ai.reply(JSON.stringify(reply));
  await page.locator("#ai-input").fill(text);
  await page.locator("#ai-send").click();
}

test("#74: Grundrezept löschen → Hinweis, kein Knopf, Rezept bleibt; im Rezept selbst weiter löschbar", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  await page.locator('nav.tabbar .tab[data-go="assistant"]').click();
  await ask(page, ai, { type: "delete", id: "r01", intro: "Okay, weg damit." }, "lösche das Curry");
  await expect(page.locator(".ai-msg.ai").last()).toContainText("löscht nur Rezepte, die du selbst angelegt hast");
  await expect(page.locator("[data-delete-recipe]")).toHaveCount(0);
  expect(await idb(page, "recipes", "r01")).toBeDefined();
  // manuell weiterhin möglich
  await page.locator('nav.tabbar .tab[data-go="cookbook"]').click();
  const detail = await openRecipe(page, BASE.name);
  await expect(detail.locator(".del")).toBeVisible();
});

test("#74: eigenes Rezept → Karte → Abbrechen: bleibt; Bestätigen: gelöscht, Karte zeigt „Gelöscht“", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  const mine = await createOwn(page);
  await page.locator('nav.tabbar .tab[data-go="assistant"]').click();
  await ask(page, ai, { type: "delete", id: mine.id, intro: "Verstanden." }, "lösche meine Suppe");
  const card = page.locator(".ai-delete");
  await expect(card.locator(".sug-name")).toHaveText(MINE.name);
  const btn = card.locator("[data-delete-recipe]");
  await expect(btn).toHaveText("🗑 Rezept löschen");
  expect(await idb(page, "recipes", mine.id)).toBeDefined(); // Karte allein löscht nichts

  page.removeAllListeners("dialog");
  page.once("dialog", (d) => { expect(d.message()).toBe("Rezept wirklich löschen?"); d.dismiss(); });
  await btn.click();
  await expect(btn).toBeEnabled();
  expect(await idb(page, "recipes", mine.id)).toBeDefined();

  page.once("dialog", (d) => d.accept());
  await btn.click();
  await expect(btn).toHaveText("✓ Gelöscht");
  await expect.poll(async () => await idb(page, "recipes", mine.id)).toBeUndefined();
});

test("#74: alte Karte löscht nichts, wenn das Rezept inzwischen kein Eigenes mehr ist", async ({ page, ai }) => {
  await openApp(page);
  await saveKey(page);
  const mine = await createOwn(page);
  await page.locator('nav.tabbar .tab[data-go="assistant"]').click();
  await ask(page, ai, { type: "delete", id: mine.id, intro: "Okay." }, "lösche meine Suppe");
  const btn = page.locator("[data-delete-recipe]");
  await expect(btn).toBeVisible();

  // Rezept wechselt die Herkunft (gespeichert ohne origin) — Karte ist veraltet.
  await page.evaluate(async (id) => {
    const { updateRecipe } = await import("/v2/src/store.js");
    await updateRecipe(id, (x) => { delete x.origin; });
  }, mine.id);
  expect("origin" in (await idb(page, "recipes", mine.id))).toBe(false);

  const dialogs = [];
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => { dialogs.push(d.type()); d.accept(); });
  await btn.click();
  await expect.poll(() => dialogs).toEqual(["alert"]); // Hinweis, keine Löschbestätigung
  expect(await idb(page, "recipes", mine.id)).toBeDefined();
});
