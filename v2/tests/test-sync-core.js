// Tests: P1 — der eine Sync-Kern (data/syncCore.js) mit beiden Merge-Regeln (data/syncRules.js).
// „Zwei Instanzen“: zwei Geräte (je eigene Engine + eigener lokaler Speicher + eigene Meta) gegen
// EINE In-Memory-Drive. Rein Node: kein DOM, kein IndexedDB, kein Netz. Die Fake-Drive kann
// Anfragen anhalten (hold/release), damit Rennen (Abgleich läuft, während gespeichert/verbunden wird)
// deterministisch nachgestellt werden.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { createSyncEngine } from "../src/data/syncCore.js";
import { threeWayMerge, itemMerge, saveStep, RECIPE_STATUS } from "../src/data/syncRules.js";

/* ---------- Fakes ---------- */

function fakeDrive() {
  const files = new Map();
  let seq = 0;
  let gate = null; // Promise, auf die jede Anfrage wartet, solange hold aktiv ist
  let release = null;
  const d = {
    files, writes: [], reads: 0,
    hold() { gate = new Promise((r) => { release = r; }); },
    release() { const r = release; gate = null; release = null; if (r) r(); },
    async wait() { if (gate) await gate; },
    json(id) { return JSON.parse(files.get(id).content); },
    byName(name) { return [...files.values()].filter((f) => f.name === name); },
  };
  /** Sicht eines Geräts (eigener Anmeldestatus) auf dieselbe Drive. */
  d.device = (signedIn = true) => ({
    signedIn,
    isSignedIn() { return this.signedIn; },
    async readFile(id) { await d.wait(); d.reads++; const f = files.get(id); if (!f) throw Object.assign(new Error("404"), { status: 404 }); return JSON.parse(f.content); },
    async updateFile(id, content) { await d.wait(); files.get(id).content = content; d.writes.push({ id, op: "update" }); },
    async createFile(content, name) { await d.wait(); const id = "f" + (++seq); files.set(id, { id, name, content }); d.writes.push({ id, op: "create" }); return id; },
    async findByName(name) { const f = d.byName(name)[0]; return f ? f.id : null; },
  });
  return d;
}

function fakeKv() {
  const m = new Map();
  return {
    m,
    async get(k, fb) { return m.has(k) ? structuredClone(m.get(k)) : fb; },
    async update(k, fn, fb) { const next = fn(m.has(k) ? structuredClone(m.get(k)) : fb); m.set(k, structuredClone(next)); return structuredClone(next); },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const T = (min) => new Date(Date.UTC(2026, 9, 19, 10, min)).toISOString();
const recipe = (id, name, extra = {}) => ({
  id, name, category: "Vegetarische Hauptgerichte", time: "", servings: "~4", lastCooked: "",
  ingredients: ["1 Zutat"], steps: ["Kochen."], tips: "", ...extra,
});

/**
 * Rezept-Gerät: Engine + lokaler Speicher (wie sync.js, aber mit Fakes).
 * answers = Antworten auf Rückfragen der Regel (T2), der Reihe nach; `asked` sammelt die Fragen.
 */
function recipeDevice(drive, { recipes = [], meta = { updated: T(0), source: "snapshot", dirty: false }, answers = [] } = {}) {
  const kv = fakeKv();
  kv.m.set("collection", meta);
  const local = { recipes: structuredClone(recipes), base: null, backup: null, rev: 0 };
  const asked = [];
  const dv = drive.device();
  const engine = createSyncEngine({
    name: "rezepte", metaKey: "collection", fileName: "rezepte.json", drive: dv, kv,
    locate: async () => { const id = await dv.findByName("rezepte.json"); return id ? { fileId: id } : null; },
    rule: threeWayMerge({
      ask: async (q) => { asked.push(q); return answers.length ? answers.shift() : false; },
      store: {
        readAll: async () => structuredClone(local.recipes),
        replaceAll: (r) => { local.recipes = structuredClone(r); return Promise.resolve(); }, // synchron übernommen
        rev: () => local.rev,
        readBase: async () => structuredClone(local.base),
        writeBase: async (r) => { local.base = structuredClone(r); },
        writeBackup: async (r) => { local.backup = structuredClone(r); },
      },
    }),
    online: () => true,
  });
  return {
    engine, kv, local, dv, asked,
    meta: () => kv.get("collection", {}),
    names: () => local.recipes.map((r) => r.name).sort(),
    get: (id) => local.recipes.find((r) => r.id === id),
    /** wie sync.saveCollection: Revision hoch, lokal sofort, dann Abgleich in der Warteschlange */
    async save(recipes, { online = true } = {}) {
      local.rev++;
      const updated = new Date().toISOString();
      local.recipes = structuredClone(recipes);
      await engine.patchMeta({ updated, dirty: true });
      if (!online) return null;
      const res = await engine.run(saveStep());
      return res.meta;
    },
    /** Ein Rezept ändern und speichern (wie store.updateRecipe). */
    edit(id, patch, opts) { return this.save(local.recipes.map((r) => (r.id === id ? { ...r, ...patch } : r)), opts); },
  };
}

/** Projekt-Claude / v1: schreibt rezepte.json direkt in Drive, an der App vorbei. fn(data) → data | String */
function externalWrite(drive, fn) {
  const f = drive.byName("rezepte.json")[0];
  const out = fn(JSON.parse(f.content));
  f.content = typeof out === "string" ? out : JSON.stringify(out, null, 2);
}
const driveRecipes = (drive) => JSON.parse(drive.byName("rezepte.json")[0].content).recipes;

/** Listen-Gerät: Engine + lokale Liste (wie listSync.js, aber mit Fakes). */
function listDevice(drive, user = "a") {
  const kv = fakeKv();
  const local = { items: [] };
  const dv = drive.device();
  let dirtyCalls = 0;
  const engine = createSyncEngine({
    name: "einkaufsliste", metaKey: "listMeta", fileName: "einkaufsliste-" + user + ".json", drive: dv, kv,
    locate: async () => { const id = await dv.findByName("einkaufsliste-" + user + ".json"); return id ? { fileId: id, meta: { ownFileId: id, linked: false } } : null; },
    rule: itemMerge({
      store: { readAll: async () => structuredClone(local.items), write: async (items) => { local.items = structuredClone(items); } },
      onDirty: () => { dirtyCalls++; },
    }),
    online: () => true,
  });
  let n = 0;
  return {
    engine, kv, local, dv, user,
    meta: () => kv.get("listMeta", {}),
    dirtyCalls: () => dirtyCalls,
    visible: () => local.items.filter((x) => !x.deleted).map((x) => x.name).sort(),
    add(name) { local.items.push({ id: `${user}-${++n}-${name}`, name, qty: 1, done: false, updated: new Date(Date.now() + n).toISOString(), author: user, deleted: false }); },
    remove(name) { const it = local.items.find((x) => x.name === name && !x.deleted); it.deleted = true; it.updated = new Date(Date.now() + 1000).toISOString(); },
  };
}

/* ============================================================
   Kern: Warteschlange, Single-Flight, Meta-Patches
   ============================================================ */

test("Kern: gleichzeitige sync()-Aufrufe teilen EINEN Lauf (Single-Flight)", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive);
  await A.engine.sync(); // legt Datei an
  const before = drive.reads;
  drive.hold();
  const p1 = A.engine.sync(), p2 = A.engine.sync(), p3 = A.engine.sync();
  assert(p1 === p2 && p2 === p3, "alle Aufrufe bekommen dieselbe Promise");
  drive.release();
  await p1;
  assertEqual(drive.reads - before, 1, "nur ein Lesezugriff");
});

test("Kern: run() hält die Reihenfolge — ein Schritt startet erst nach dem laufenden Abgleich", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive);
  await A.engine.sync();
  const before = drive.reads;
  let seenReads = null;
  drive.hold();
  const s = A.engine.sync();
  const r = A.engine.run(async () => { seenReads = drive.reads - before; });
  await tick(); await tick();
  assertEqual(seenReads, null, "solange der Abgleich hängt, wartet auch der Schritt");
  drive.release();
  await Promise.all([s, r]);
  assertEqual(seenReads, 1, "der Schritt lief erst nach dem Lesezugriff des Abgleichs");
});

test("Kern: ein werfender Status-Listener bricht den Abgleich nicht ab (v2.14.1-Fehlerklasse)", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive);
  A.engine.onStatus(() => { throw new Error("kaputte Ansicht"); });
  const origWarn = console.warn; console.warn = () => {};
  try {
    const res = await A.engine.sync();
    assert(!res.error, "kein Fehler im Ergebnis");
    assertEqual(A.engine.getStatus(), "synced");
  } finally { console.warn = origWarn; }
});

test("Kern: Fehler → Status der Regel, Ergebnis trägt den Fehler, nichts wirft", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive);
  await A.engine.sync();
  await A.engine.patchMeta({ fileId: "gibt-es-nicht", linked: true });
  const origWarn = console.warn; console.warn = () => {};
  try {
    const res = await A.engine.sync();
    assertEqual(res.error.status, 404);
    assertEqual(A.engine.getStatus(), "notFound");
  } finally { console.warn = origWarn; }
});

test("Kern: ohne Anmeldung kein Netzzugriff; Listen-Status = local", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive);
  A.dv.signedIn = false;
  const res = await A.engine.sync();
  assertEqual(res.changed, false);
  assertEqual(A.engine.getStatus(), "local");
  assertEqual(drive.writes.length + drive.reads, 0);
});

/* ============================================================
   Regel 1 — Rezepte: Drei-Wege-Merge pro Rezept und Feld (v2.15.1, T1/T2/T12)
   Zwei Geräte desselben Kontos — und Projekt-Claude/v1, die Drive direkt beschreiben.
   ============================================================ */

/** n Rezepte r1 … rn (prefix ändert die ids, z. B. als Polster gegen die Massen-Lösch-Schwelle) */
const many = (n, prefix = "r") => Array.from({ length: n }, (_, i) => recipe(prefix + (i + 1), "Rezept " + prefix + (i + 1)));
const PAD = many(20, "p"); // 20 weitere Rezepte: eine einzelne Löschung bleibt unter 20 %
/** Gerät, das schon mit Drive abgeglichen hat (Basis gemerkt, source "drive"). */
async function syncedDevice(drive, recipes) {
  const A = recipeDevice(drive, { recipes });
  await A.engine.sync();
  return A;
}

test("Rezepte: Erstlauf legt GENAU eine Datei an; zweites Gerät zieht sie statt ein Duplikat anzulegen", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync();
  assertEqual(drive.byName("rezepte.json").length, 1);
  assertDeepEqual(await A.meta().then((m) => [m.dirty, m.source]), [false, "drive"]);
  await A.save([recipe("r1", "Curry"), recipe("r2", "Dal")]);
  const res = await B.engine.sync();
  assertEqual(res.changed, true, "B zieht (Snapshot → Drive)");
  assertDeepEqual(B.names(), ["Curry", "Dal"]);
  assertEqual(drive.byName("rezepte.json").length, 1);
});

test("Rezepte: Speichern schreibt in place; zweites Gerät übernimmt beim nächsten Abgleich", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync(); await B.engine.sync();
  const meta = await B.save([recipe("r1", "Curry scharf")]);
  assertEqual(meta.dirty, false);
  assertEqual(B.engine.getStatus(), RECIPE_STATUS.synced);
  const id = drive.byName("rezepte.json")[0].id;
  assertEqual(drive.json(id).updated, meta.updated, "Datei und Meta tragen dieselbe Marke");
  await A.engine.sync();
  assertDeepEqual(A.names(), ["Curry scharf"]);
});

test("Rezepte: unverändert → kein Schreibzugriff", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync(); await A.engine.sync();
  const writes = drive.writes.length;
  const res = await A.engine.sync();
  assertEqual(res.changed, false);
  assertEqual(drive.writes.length, writes);
});

test("T1 (DG-01): Projekt-Claude fügt ein Rezept hinzu, die App tippt danach ♥ ohne neu zu laden → beide bleiben", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry"), recipe("r2", "Dal")]); // 08:00
  externalWrite(drive, (d) => ({ ...d, recipes: [...d.recipes, recipe("r9", "Claudes Linsensuppe")] })); // 12:00
  await A.edit("r1", { favorite: true }); // 18:00 — speichert, OHNE vorher abgeglichen zu haben
  const remote = driveRecipes(drive);
  assertDeepEqual(remote.map((r) => r.name).sort(), ["Claudes Linsensuppe", "Curry", "Dal"], "Claudes Rezept ist noch in Drive");
  assertEqual(remote.find((r) => r.id === "r1").favorite, true, "♥ ist in Drive");
  assertDeepEqual(A.names(), ["Claudes Linsensuppe", "Curry", "Dal"], "und die App zeigt Claudes Rezept");
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.synced);
});

test("T1: Claude ändert die Schritte, die App ♥ dasselbe Rezept → beide Felder bleiben", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry")]);
  externalWrite(drive, (d) => { d.recipes[0].steps = ["Zwiebeln anbraten.", "Curry köcheln."]; return d; });
  await A.edit("r1", { favorite: true });
  const r = driveRecipes(drive)[0];
  assertDeepEqual([r.favorite, r.steps], [true, ["Zwiebeln anbraten.", "Curry köcheln."]]);
  assertDeepEqual(A.get("r1").steps, ["Zwiebeln anbraten.", "Curry köcheln."]);
});

test("T1 (DG-07): Claude vergisst `updated` zu erhöhen → die Änderung kommt trotzdem an", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry")]);
  externalWrite(drive, (d) => { d.recipes[0].tips = "Mit Koriander."; return d; }); // `updated` unverändert
  await A.engine.sync();
  assertEqual(A.get("r1").tips, "Mit Koriander.");
});

test("T1: Claude löscht ein Rezept → lokal weg; hat die App es inzwischen geändert, bleibt es (Bearbeiten schlägt Löschen)", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry"), recipe("r2", "Dal"), recipe("r3", "Shakshuka"), ...PAD]);
  await A.edit("r2", { rating: 5 }, { online: false });
  externalWrite(drive, (d) => ({ ...d, recipes: d.recipes.filter((r) => r.id !== "r2" && r.id !== "r3") }));
  await A.engine.sync();
  assertEqual(A.asked.length, 0);
  assertDeepEqual(A.local.recipes.filter((r) => /^r/.test(r.id)).map((r) => r.name).sort(), ["Curry", "Dal"], "r3 gelöscht, r2 (lokal bewertet) bleibt");
  assertDeepEqual(driveRecipes(drive).filter((r) => /^r/.test(r.id)).map((r) => r.id).sort(), ["r1", "r2"], "Drive bekommt r2 zurück");
});

test("T1: die App löscht ein Rezept, das Claude inzwischen geändert hat → bleibt; unverändert → gelöscht", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry"), recipe("r2", "Dal"), recipe("r3", "Shakshuka")]);
  externalWrite(drive, (d) => { d.recipes[1].tips = "Claude: mit Zitrone"; return d; });
  await A.save(A.local.recipes.filter((r) => r.id === "r1")); // App löscht r2 und r3
  assertEqual(A.asked.length, 0, "eigene Löschungen fragen nie");
  assertDeepEqual(driveRecipes(drive).map((r) => r.id), ["r1", "r2"]);
  assertDeepEqual(A.names(), ["Curry", "Dal"]);
  assertEqual(A.get("r2").tips, "Claude: mit Zitrone");
});

test("T1: Update von v2.15 (keine Basis gemerkt) mit ungespeicherter Änderung → vereinigen, nichts geht verloren", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry")]);
  A.local.base = null; // wie ein Gerät, das v2.15 hatte
  externalWrite(drive, (d) => ({ ...d, recipes: [...d.recipes, recipe("r9", "Claudes Rezept")] }));
  await A.edit("r1", { favorite: true }, { online: false });
  await A.engine.sync();
  assertDeepEqual(driveRecipes(drive).map((r) => r.name).sort(), ["Claudes Rezept", "Curry"]);
  assertEqual(driveRecipes(drive).find((r) => r.id === "r1").favorite, true);
  assert(A.local.base, "Basis ist danach gemerkt");
});

test("Rezepte (T12): beide offline, verschiedene Rezepte geändert → beide Änderungen überleben (früher: Konflikt)", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry"), recipe("r2", "Dal")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry"), recipe("r2", "Dal")] });
  await A.engine.sync(); await B.engine.sync();
  await A.save([recipe("r1", "Curry (A offline)"), recipe("r2", "Dal")], { online: false });
  await B.save([recipe("r1", "Curry"), recipe("r2", "Dal (B)")]);
  await A.engine.sync();
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.synced);
  assertDeepEqual(A.names(), ["Curry (A offline)", "Dal (B)"]);
  assertDeepEqual(driveRecipes(drive).map((r) => r.name).sort(), ["Curry (A offline)", "Dal (B)"]);
  assertEqual((await A.meta()).dirty, false);
  await B.engine.sync();
  assertDeepEqual(B.names(), ["Curry (A offline)", "Dal (B)"], "B holt A's Änderung");
});

test("Rezepte (T12): beide ändern dasselbe Feld → App gewinnt; das andere Feld kommt trotzdem an", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync(); await B.engine.sync();
  await B.edit("r1", { name: "Curry (B)", rating: 4 });
  await A.edit("r1", { name: "Curry (A)" }, { online: false });
  await A.engine.sync();
  assertDeepEqual([A.get("r1").name, A.get("r1").rating], ["Curry (A)", 4], "Name: lokal gewinnt · Bewertung: von B");
  assertDeepEqual([driveRecipes(drive)[0].name, driveRecipes(drive)[0].rating], ["Curry (A)", 4]);
});

test("T1 / Kern: Abgleich läuft, Claude hat Drive geändert, die App speichert mittendrin → am Ende ist alles da", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry")]);
  externalWrite(drive, (d) => ({ ...d, recipes: [...d.recipes, recipe("r9", "Claudes Rezept")] }));
  drive.hold();
  const syncing = A.engine.sync();          // liest lokal, hängt dann an Drive
  await tick();
  const saving = A.edit("r1", { favorite: true }); // Tipp während des Roundtrips
  await tick();
  drive.release();
  await syncing; await saving;
  assertDeepEqual(A.names(), ["Claudes Rezept", "Curry"]);
  assertEqual(A.get("r1").favorite, true);
  assertDeepEqual(driveRecipes(drive).map((r) => r.name).sort(), ["Claudes Rezept", "Curry"]);
  assertEqual(driveRecipes(drive).find((r) => r.id === "r1").favorite, true);
  assertEqual((await A.meta()).dirty, false);
});

/* ---------- T2: kaputte oder gekürzte Drive-Dateien ---------- */

for (const [label, content] of [
  ["{}", "{}"],
  ["null", "null"],
  ["recipes: null", JSON.stringify({ version: 3, updated: T(5), recipes: null })],
  ["recipes kein Array", JSON.stringify({ version: 3, updated: T(5), recipes: "kaputt" })],
  ["falscher Schlüssel „Rezepte“", JSON.stringify({ version: 3, updated: T(5), Rezepte: [recipe("r1", "Curry")] })],
]) {
  test(`T2 (DG-05): Drive-Datei ${label} → lokale Daten bleiben, Fehler sichtbar, nichts wird geschrieben`, async () => {
    const drive = fakeDrive();
    const A = await syncedDevice(drive, many(105));
    externalWrite(drive, () => content);
    const writes = drive.writes.length;
    const res = await A.engine.sync();
    assertEqual(A.local.recipes.length, 105);
    assertEqual(res.invalid, true);
    assertEqual(A.engine.getStatus(), RECIPE_STATUS.invalid);
    assertEqual(drive.writes.length, writes, "keine Drive-Schreibung ohne Zustimmung");
    assertEqual(A.asked.length, 1);
    assertEqual(A.asked[0].kind, "broken");
  });
}

test("T2: kaputte Datei abgelehnt → Speichern fragt nicht erneut und überschreibt nicht; später ‚ja‘ repariert", async () => {
  const drive = fakeDrive();
  const answers = [];
  const A = recipeDevice(drive, { recipes: many(3), answers });
  await A.engine.sync();
  externalWrite(drive, () => "{}");
  await A.engine.sync();                      // fragt → nein
  await A.edit("r1", { favorite: true });     // ♥ danach
  assertEqual(A.asked.length, 1, "dieselbe kaputte Datei → keine zweite Frage");
  assertEqual(drive.byName("rezepte.json")[0].content, "{}", "Drive unangetastet");
  assertEqual((await A.meta()).dirty, true, "♥ wartet lokal");

  externalWrite(drive, () => JSON.stringify({ recipes: {} })); // anders kaputt → neue Frage
  answers.push(true);
  await A.engine.sync();
  assertEqual(A.asked.length, 2);
  assertDeepEqual(driveRecipes(drive).map((r) => r.id), ["r1", "r2", "r3"], "Drive mit dem lokalen Stand repariert");
  assertEqual(driveRecipes(drive)[0].favorite, true);
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.repaired);
  assertEqual((await A.meta()).dirty, false);
});

test("T2 (DG-03): Rezept ohne id und null-Eintrag von außen → gerettet, nichts schrumpft, Drive repariert", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry")]);
  externalWrite(drive, (d) => ({ ...d, recipes: [...d.recipes, null, { ...recipe("x", "Ohne id"), id: undefined }] }));
  const res = await A.engine.sync();
  assertDeepEqual(A.names(), ["Curry", "Ohne id"]);
  assert(A.local.recipes.every((r) => typeof r.id === "string" && r.id), "jedes Rezept hat eine id");
  assertEqual(res.repaired.length, 2);
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.repaired);
  assertDeepEqual(driveRecipes(drive).map((r) => r.name), ["Curry", "Ohne id"], "Drive ohne null, mit id");
  assert(driveRecipes(drive).every((r) => r.id), "Drive-Rezepte haben ids");
});

test("T2 (DG-06): doppelte id von außen → beide Rezepte bleiben (eins bekommt eine neue id); exakte Kopie fliegt raus", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, [recipe("r1", "Curry")]);
  externalWrite(drive, (d) => ({ ...d, recipes: [...d.recipes, recipe("r1", "Claudes neues Rezept"), recipe("r1", "Curry")] }));
  await A.engine.sync();
  assertDeepEqual(A.names(), ["Claudes neues Rezept", "Curry"]);
  assertEqual(new Set(A.local.recipes.map((r) => r.id)).size, 2);
  assertEqual(driveRecipes(drive).length, 2);
});

test("T2: Drive würde 65 von 105 Rezepten löschen → Rückfrage; Nein = alle bleiben und Drive wird repariert", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, many(105));
  externalWrite(drive, (d) => ({ ...d, recipes: d.recipes.slice(0, 40) })); // gekürzt
  await A.engine.sync();
  assertEqual(A.asked.length, 1);
  assertDeepEqual([A.asked[0].kind, A.asked[0].count, A.asked[0].total], ["massDelete", 65, 105]);
  assertEqual(A.local.recipes.length, 105);
  assertEqual(driveRecipes(drive).length, 105, "Drive wieder vollständig");
});

test("T2: Massen-Löschung bestätigt → übernommen, die alte lokale Sammlung liegt als Sicherung bereit", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: many(10), answers: [true] });
  await A.engine.sync();
  externalWrite(drive, (d) => ({ ...d, recipes: d.recipes.slice(0, 2) }));
  await A.engine.sync();
  assertEqual(A.local.recipes.length, 2);
  assertEqual(A.local.backup.length, 10, "Sicherung = Stand vor dem Übernehmen");
});

test("T2: kleine Löschung von außen (unter der Schwelle) → ohne Rückfrage übernommen", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, many(105));
  externalWrite(drive, (d) => ({ ...d, recipes: d.recipes.slice(0, 101) })); // 4 gelöscht
  await A.engine.sync();
  assertEqual(A.asked.length, 0);
  assertEqual(A.local.recipes.length, 101);
});

test("T2: frisches Gerät (nur Snapshot) zieht eine kleinere Drive-Datei ohne Rückfrage", async () => {
  const drive = fakeDrive();
  const A = await syncedDevice(drive, many(20));
  await A.save(A.local.recipes.slice(0, 5)); // Nutzer hat 15 gelöscht
  const B = recipeDevice(drive, { recipes: many(20) }); // Snapshot, source "snapshot"
  await B.engine.sync();
  assertEqual(B.asked.length, 0);
  assertEqual(B.local.recipes.length, 5);
});

test("Rezepte / Kern: während eines Abgleichs gespeichert → Pull überschreibt die neue lokale Änderung NICHT", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync(); await B.engine.sync();
  await B.save([recipe("r1", "Curry (B)")]);         // Drive ist jetzt neuer als A
  drive.hold();
  const syncing = A.engine.sync();                    // A will ziehen …
  await tick();
  const saving = A.save([recipe("r1", "Curry (A, gerade getippt)")]); // … während A speichert
  await tick();
  drive.release();
  await syncing; await saving;
  assertDeepEqual(A.names(), ["Curry (A, gerade getippt)"], "lokale Eingabe überlebt");
  const id = drive.byName("rezepte.json")[0].id;
  assertDeepEqual(drive.json(id).recipes.map((r) => r.name), ["Curry (A, gerade getippt)"], "Push folgt nach dem Abgleich");
  assertEqual((await A.meta()).dirty, false);
});

test("Rezepte / Kern: zwei schnelle Speichervorgänge → Drive endet beim letzten, Meta sauber", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync();
  drive.hold();
  const s1 = A.save([recipe("r1", "eins")]);
  await new Promise((r) => setTimeout(r, 2));
  const s2 = A.save([recipe("r1", "zwei")]);
  drive.release();
  await s1; await s2;
  const id = drive.byName("rezepte.json")[0].id;
  assertDeepEqual(drive.json(id).recipes.map((r) => r.name), ["zwei"]);
  const m = await A.meta();
  assertEqual(m.dirty, false);
  assertEqual(drive.json(id).updated, m.updated);
});

/* ============================================================
   Regel 2 — Einkaufsliste: Merge pro Artikel (zwei Geräte, eine geteilte Datei)
   ============================================================ */

/** A legt seine Liste an; B verbindet sich mit A's Datei (wie Picker → linkToFile). */
async function linked(drive) {
  const A = listDevice(drive, "a"), B = listDevice(drive, "b");
  A.add("Hafermilch");
  await A.engine.sync();
  await B.engine.sync(); // B's eigene Datei
  const fileA = (await A.meta()).fileId;
  B.add("Brot");
  await B.engine.retarget((m) => ({ ownFileId: m.ownFileId || m.fileId || null, fileId: fileA, linked: true }));
  return { A, B, fileA };
}
const liveNames = (drive, id) => drive.json(id).items.filter((x) => !x.deleted).map((x) => x.name).sort();

test("Liste: Verbinden führt beide Listen zusammen; Adds und Löschungen erreichen die andere Seite", async () => {
  const drive = fakeDrive();
  const { A, B, fileA } = await linked(drive);
  assertDeepEqual(B.visible(), ["Brot", "Hafermilch"]);
  assertDeepEqual(liveNames(drive, fileA), ["Brot", "Hafermilch"]);
  await A.engine.sync();
  assertDeepEqual(A.visible(), ["Brot", "Hafermilch"]);
  A.remove("Hafermilch");
  await A.engine.sync();
  await B.engine.sync();
  assertDeepEqual(B.visible(), ["Brot"], "Tombstone kommt an (CR-01)");
});

test("Liste: Abgleich ohne Änderung schreibt nicht (CR-02)", async () => {
  const drive = fakeDrive();
  const { A, fileA } = await linked(drive);
  await A.engine.sync();
  const before = drive.writes.filter((w) => w.id === fileA).length;
  await A.engine.sync(); await A.engine.sync();
  assertEqual(drive.writes.filter((w) => w.id === fileA).length, before);
});

test("Liste: beide ändern, dann beide abgleichen (auch gleichzeitig) → kein Artikel geht verloren", async () => {
  const drive = fakeDrive();
  const { A, B, fileA } = await linked(drive);
  await A.engine.sync();
  A.add("Äpfel");
  B.add("Bananen");
  await Promise.all([A.engine.sync(), B.engine.sync()]);
  await A.engine.sync(); await B.engine.sync();
  const all = ["Bananen", "Brot", "Hafermilch", "Äpfel"].sort();
  assertDeepEqual(A.visible(), all);
  assertDeepEqual(B.visible(), all);
  assertDeepEqual(liveNames(drive, fileA), all);
});

test("Liste: während des Roundtrips getippt → bleibt erhalten und wird nachgeschoben (onDirty)", async () => {
  const drive = fakeDrive();
  const { A, fileA } = await linked(drive);
  drive.hold();
  const s = A.engine.sync();
  await tick();
  A.add("Zwischendurch");
  drive.release();
  await s;
  assert(A.visible().includes("Zwischendurch"), "lokal nicht verloren");
  assertEqual((await A.meta()).dirty, true);
  assert(A.dirtyCalls() > 0, "Nachschieben angestoßen");
  await A.engine.sync();
  assert(liveNames(drive, fileA).includes("Zwischendurch"), "landet beim nächsten Abgleich in Drive");
});

test("Liste / P2-Fund: Verbinden während eines laufenden Abgleichs geht NICHT verloren", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive, "a"), B = listDevice(drive, "b");
  A.add("Hafermilch");
  await A.engine.sync();
  await B.engine.sync();
  const fileA = (await A.meta()).fileId;
  B.add("Brot");
  drive.hold();
  const running = B.engine.sync();                 // gebündelter Push von B hängt im Netz …
  await tick();
  const link = B.engine.retarget((m) => ({ ownFileId: m.ownFileId || m.fileId || null, fileId: fileA, linked: true }));
  await tick();
  drive.release();
  await running;
  const res = await link;
  assert(!res.error, "Verbinden erfolgreich");
  const meta = await B.meta();
  assertEqual(meta.fileId, fileA, "verbunden mit A's Datei");
  assertEqual(meta.linked, true);
  assert(meta.ownFileId && meta.ownFileId !== fileA, "eigene Datei bleibt für „Trennen“ gemerkt");
  assertDeepEqual(liveNames(drive, fileA), ["Brot", "Hafermilch"]);
});

test("Liste: Trennen → wieder die eigene Datei, Artikel bleiben", async () => {
  const drive = fakeDrive();
  const { B, fileA } = await linked(drive);
  const own = (await B.meta()).ownFileId;
  await B.engine.retarget((m) => ({ fileId: m.ownFileId || null, linked: false }));
  const meta = await B.meta();
  assertEqual(meta.fileId, own);
  assertEqual(meta.linked, false);
  assertDeepEqual(liveNames(drive, own), ["Brot", "Hafermilch"]);
  assert(own !== fileA, "nicht mehr die Partner-Datei");
});

test("Liste: Altbestand (≤ v2.10) ohne ownFileId wird beim Abgleich ergänzt", async () => {
  const drive = fakeDrive();
  const A = listDevice(drive, "a");
  await A.engine.sync();
  const fileId = (await A.meta()).fileId;
  A.kv.m.set("listMeta", { fileId, dirty: false });   // alte Meta-Form
  await A.engine.sync();
  assertEqual((await A.meta()).ownFileId, fileId);
});

test("Zwei Kerne nebeneinander (Rezepte + Liste) stören sich nicht", async () => {
  const drive = fakeDrive();
  const R = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  const L = listDevice(drive, "a");
  L.add("Milch");
  drive.hold();
  const a = R.engine.sync(), b = L.engine.sync();
  drive.release();
  await Promise.all([a, b]);
  assertEqual(drive.byName("rezepte.json").length, 1);
  assertEqual(drive.byName("einkaufsliste-a.json").length, 1);
  assertEqual(R.engine.getStatus(), RECIPE_STATUS.synced);
  assertEqual(L.engine.getStatus(), "synced");
});
