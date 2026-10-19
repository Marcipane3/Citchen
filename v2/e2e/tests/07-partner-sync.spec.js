// Flow 7 — Geteilte Einkaufsliste mit Partner (I2): zwei Google-Konten, zwei Geräte, EINE
// einkaufsliste.json in Marcels Drive. Automatisierte Fassung des Tests aus v2/docs/SHARING.md
// (P3 bleibt der echte Test mit zwei echten Konten auf echten Handys).
import { test, expect } from "../support/fixtures.js";
import { openApp, sheet, connectList, addItem, refreshList, shoppingNames, liveNames, idb } from "../support/app.js";

const LIST = "einkaufsliste.json";

/** Marcel legt seine Liste an und gibt sie frei; Partner verbindet sich per Picker. */
async function linkPartners({ device, drive }) {
  const A = (await device({ user: "marcel" })).page;
  const B = (await device({ user: "partner" })).page;

  await openApp(A, "shopping");
  await connectList(A);
  await addItem(A, "Hafermilch");
  await expect.poll(() => drive.find(LIST, "marcel").length).toBe(1);
  const file = drive.find(LIST, "marcel")[0];
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Hafermilch"]);
  drive.share(file.id, "partner"); // „Freigeben“ in Google Drive

  await openApp(B, "shopping");
  await connectList(B);
  await addItem(B, "Brot"); // stand schon vor dem Verbinden auf B's eigener Liste
  await expect.poll(() => liveNames(drive.read(drive.find(LIST, "partner")[0].id))).toEqual(["Brot"]);
  await B.locator("#shop-sync .sl-partner").click();
  const s = await sheet(B);
  await s.locator(".sl-pick").click();
  await expect(B.locator(".overlay")).toHaveCount(0);
  await expect(B.locator("#shop-sync")).toContainText("Geteilte Liste");
  return { A, B, file };
}

test("Partner verbinden: Listen werden zusammengeführt, beide Seiten sehen Neues und Löschungen", async ({ device, drive }) => {
  const { A, B, file } = await linkPartners({ device, drive });

  // B sieht Marcels Artikel, B's Artikel ist nicht verloren und liegt jetzt in Marcels Datei.
  await expect.poll(() => shoppingNames(B)).toEqual(expect.arrayContaining(["Hafermilch", "Brot"]));
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Brot", "Hafermilch"]);
  expect((await idb(B, "kv", "listMeta")).value).toMatchObject({ fileId: file.id, linked: true });
  expect(drive.find(LIST)).toHaveLength(2); // B's eigene Datei bleibt bestehen (für „Trennen“)

  // Marcel holt B's Artikel per 🔄.
  await refreshList(A);
  await expect.poll(() => shoppingNames(A)).toEqual(expect.arrayContaining(["Hafermilch", "Brot"]));

  // Marcel löscht → Tombstone in Drive → verschwindet bei B (CR-01: kam früher wieder).
  await A.locator("#shop-list .sl-item", { hasText: "Hafermilch" }).locator(".sl-rm").click();
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Brot"]);
  await refreshList(B);
  await expect.poll(() => shoppingNames(B)).toEqual(["Brot"]);

  // B hakt ab → Marcel sieht es abgehakt.
  await B.locator("#shop-list .sl-name", { hasText: "Brot" }).click();
  await expect.poll(() => drive.read(file.id).items.find((x) => x.name === "Brot").done).toBe(true);
  await refreshList(A);
  await expect(A.locator("#shop-list .sl-item", { hasText: "Brot" })).toHaveClass(/done/);
  await expect(A.locator('nav.tabbar .tab[data-go="shopping"] .tab-badge')).toHaveCount(0);
});

test("Ein Abgleich ohne Änderung schreibt nicht nach Drive (CR-02)", async ({ device, drive }) => {
  const { A, file } = await linkPartners({ device, drive });
  await refreshList(A);
  await refreshList(A);
  const before = drive.writes.filter((w) => w.id === file.id).length;
  await refreshList(A);
  await refreshList(A);
  expect(drive.writes.filter((w) => w.id === file.id).length).toBe(before);
});

test("Beide offline bearbeiten, dann gleichzeitig online: kein Artikel geht verloren", async ({ device, drive }) => {
  const { A, B, file } = await linkPartners({ device, drive });
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Brot", "Hafermilch"]);
  await refreshList(A);

  await A.context().setOffline(true);
  await B.context().setOffline(true);
  await addItem(A, "Äpfel");
  await addItem(B, "Bananen");
  await B.locator("#shop-list .sl-item", { hasText: "Brot" }).locator(".sl-rm").click();
  // Offline bleibt alles lokal (und nichts erreicht Drive).
  await A.waitForTimeout(1500); // länger als die Push-Bündelung (1,2 s)
  expect(liveNames(drive.read(file.id))).toEqual(["Brot", "Hafermilch"]);

  await Promise.all([A.context().setOffline(false), B.context().setOffline(false)]);

  // Eventual consistency: nach ein paar 🔄 haben beide Geräte UND Drive denselben Stand.
  const expected = ["Bananen", "Hafermilch", "Äpfel"].sort();
  await expect(async () => {
    await refreshList(A);
    await refreshList(B);
    expect((await shoppingNames(A)).sort()).toEqual(expected);
    expect((await shoppingNames(B)).sort()).toEqual(expected);
    expect(liveNames(drive.read(file.id))).toEqual(expected);
  }).toPass({ timeout: 20_000 });
});

test("Trennen: Partner ist zurück auf der eigenen Liste und behält die Artikel", async ({ device, drive }) => {
  const { B, file } = await linkPartners({ device, drive });
  await expect.poll(() => shoppingNames(B)).toEqual(expect.arrayContaining(["Hafermilch", "Brot"]));
  await B.locator("#shop-sync .sl-partner").click();
  const s = await sheet(B);
  await s.locator(".sl-unlink").click(); // Bestätigung wird akzeptiert
  await expect(B.locator("#shop-sync")).toContainText("In deinem Google Drive");

  const own = drive.find(LIST, "partner")[0];
  expect((await idb(B, "kv", "listMeta")).value).toMatchObject({ fileId: own.id, linked: false });
  await expect.poll(() => liveNames(drive.read(own.id))).toEqual(["Brot", "Hafermilch"]);
  // Neues landet nicht mehr bei Marcel.
  await addItem(B, "Nur für mich");
  await expect.poll(() => liveNames(drive.read(own.id))).toContain("Nur für mich");
  expect(liveNames(drive.read(file.id))).not.toContain("Nur für mich");
});

// Regression (gefunden von P2, behoben mit P1 „ein Sync-Kern“): Lief beim Verbinden gerade ein
// Abgleich (z. B. der gebündelte Push nach einer Eingabe), schrieb dieser am Ende die alte Meta
// zurück → `linked` wieder false, Verbindung still verloren. Seit v2.15 stellt der Sync-Kern das
// Verbinden in seine Warteschlange HINTER den laufenden Abgleich und ändert Meta nur per Patch.
test("Verbinden während eines laufenden Abgleichs verliert die Verbindung nicht", async ({ device, drive }) => {
  const A = (await device({ user: "marcel" })).page;
  const B = (await device({ user: "partner" })).page;
  await openApp(A, "shopping");
  await connectList(A);
  await addItem(A, "Hafermilch");
  await expect.poll(() => drive.find(LIST, "marcel").length).toBe(1);
  const file = drive.find(LIST, "marcel")[0];
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Hafermilch"]);
  drive.share(file.id, "partner");

  await openApp(B, "shopping");
  await connectList(B);
  await drive.idle();
  drive.latency = 1500; // langsames Netz: ein Abgleich dauert ~3 s (lesen + schreiben)
  await addItem(B, "Brot");
  await B.locator("#shop-sync .sl-partner").click();
  const s = await sheet(B);
  await expect.poll(() => drive.pending, { timeout: 5_000 }).toBeGreaterThan(0); // Push läuft
  await s.locator(".sl-pick").click();
  await expect(B.locator(".overlay")).toHaveCount(0, { timeout: 15_000 });
  await drive.idle();
  drive.latency = 0;

  expect((await idb(B, "kv", "listMeta")).value).toMatchObject({ fileId: file.id, linked: true });
  await expect(B.locator("#shop-sync")).toContainText("Geteilte Liste");
});

/* ---------- v2.15.2: Liste sicher machen (T4, T10) ---------- */

/** So hat v2.10 Rezept-Zutaten nach Drive geschrieben: ohne id, ohne updated (FR-01 „Ingwer“). */
const LEGACY_INGWER = { name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", cat: "Obst & Gemüse", icon: "🫚", qty: 1, done: false, sources: ["r1749400081000"] };
const ingwerRows = async (page) => (await shoppingNames(page)).filter((n) => n.includes("Ingwer")).length;

test("T4 / FR-01: Ingwer ohne id in der Drive-Datei → wiederholte Abgleiche bleiben bei EINER Zeile, Löschen bleibt", async ({ device, drive }) => {
  const A = (await device({ user: "marcel" })).page;
  await openApp(A, "shopping");
  await connectList(A);
  await addItem(A, "Hafermilch");
  await expect.poll(() => drive.find(LIST, "marcel").length).toBe(1);
  const file = drive.find(LIST, "marcel")[0];
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Hafermilch"]);
  drive.write(file.id, (j) => ({ ...j, items: [...j.items, { ...LEGACY_INGWER }] }));

  for (let i = 1; i <= 5; i++) {
    await refreshList(A);
    expect(await ingwerRows(A), `Zeilen nach Abgleich ${i}`).toBe(1);
    expect(liveNames(drive.read(file.id))).toEqual(["Hafermilch", "Ingwer"]);
  }
  expect(drive.read(file.id).items.every((x) => typeof x.id === "string" && x.id)).toBe(true);

  // Löschen bleibt — auch über Abgleiche und einen Neustart hinweg.
  await A.locator("#shop-list .sl-item", { hasText: "Ingwer" }).locator(".sl-rm").click();
  await expect.poll(() => liveNames(drive.read(file.id))).toEqual(["Hafermilch"]);
  for (let i = 0; i < 3; i++) await refreshList(A);
  await A.reload();
  await refreshList(A);
  expect(await ingwerRows(A)).toBe(0);
  expect(liveNames(drive.read(file.id))).toEqual(["Hafermilch"]);
});

test("T10 / AR-11: HTML in der Partner-Datei wird als Text angezeigt, nie ausgeführt", async ({ device, drive }) => {
  const { A, file } = await linkPartners({ device, drive });
  const now = new Date().toISOString();
  drive.write(file.id, (j) => ({ ...j, items: [...j.items,
    { id: "evil1", name: '<img src=x onerror="window.__xss=1">Milch', icon: "<b id=pwn>x</b>", cat: "<i id=pwn2>Kat</i>", qty: 2, done: false, updated: now, author: "partner", deleted: false },
    { id: "evil2", name: "Eier", icon: '<img src=x onerror="window.__xss=2">', qty: "<b id=pwn3>9</b>", done: false, updated: now, author: "partner", deleted: false },
  ] }));
  await refreshList(A);
  await expect(A.locator("#shop-list .sl-item", { hasText: "Eier" })).toHaveCount(1);
  await expect(A.locator("#shop-list .sl-name", { hasText: '<img src=x onerror="window.__xss=1">Milch' })).toHaveCount(1);
  for (const sel of ["#pwn", "#pwn2", "#pwn3", "#shop-list img"]) await expect(A.locator(sel)).toHaveCount(0);
  expect(await A.evaluate(() => window.__xss)).toBeUndefined();
  // Alphabetisch sortieren geht auch mit solchen Namen (früher: Absturz bei Nicht-Text).
  await A.locator(".sl-sortbtn[data-sort=alpha]").click();
  await expect(A.locator("#shop-list .sl-item", { hasText: "Eier" })).toHaveCount(1);
});

test("T10 / DG-14: Partner-Datei in unbekanntem Format → Warnung, lokale Liste bleibt, Datei wird nicht überschrieben", async ({ device, drive }) => {
  const { B, file } = await linkPartners({ device, drive });
  await expect.poll(() => shoppingNames(B)).toEqual(expect.arrayContaining(["Hafermilch", "Brot"]));
  drive.write(file.id, () => ({ version: 2, entries: [{ name: "Milch" }] })); // z. B. ein künftiges Format
  const writes = drive.writes.length;

  await refreshList(B);
  await expect(B.locator("#shop-sync")).toContainText("unbekanntes Format");
  expect((await shoppingNames(B)).sort()).toEqual(["Brot", "Hafermilch"]);
  await addItem(B, "Äpfel");                           // Speichern stößt einen Abgleich an …
  await B.waitForTimeout(1500);                         // … nach der Push-Bündelung (1,2 s)
  await expect(B.locator("#shop-sync")).toContainText("unbekanntes Format");
  expect(drive.writes.length).toBe(writes);             // … und überschreibt die Datei trotzdem nicht
  expect(drive.read(file.id)).toEqual({ version: 2, entries: [{ name: "Milch" }] });
});
