// Tests: P1 — der eine Sync-Kern (data/syncCore.js) mit beiden Merge-Regeln (data/syncRules.js).
// „Zwei Instanzen“: zwei Geräte (je eigene Engine + eigener lokaler Speicher + eigene Meta) gegen
// EINE In-Memory-Drive. Rein Node: kein DOM, kein IndexedDB, kein Netz. Die Fake-Drive kann
// Anfragen anhalten (hold/release), damit Rennen (Abgleich läuft, während gespeichert/verbunden wird)
// deterministisch nachgestellt werden.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { createSyncEngine } from "../src/data/syncCore.js";
import { recipeSync, itemMerge, RECIPE_STATUS } from "../src/data/syncRules.js";

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
 * Rezept-Gerät: Engine + lokaler Speicher (wie sync.js, aber mit Fakes). Startet wie ein frisch
 * installiertes Gerät: lokal = Snapshot, Basis = Snapshot (sync.loadLocal macht das genauso).
 */
function recipeDevice(drive, { recipes = [], meta = { updated: T(0), source: "snapshot", dirty: false }, base = "snapshot", approve = false } = {}) {
  const kv = fakeKv();
  kv.m.set("collection", meta);
  const local = { recipes: structuredClone(recipes), base: base === "snapshot" ? structuredClone(recipes) : base, backup: null };
  const dv = drive.device();
  const asked = [];
  let retries = 0;
  const engine = createSyncEngine({
    name: "rezepte", metaKey: "collection", fileName: "rezepte.json", drive: dv, kv,
    locate: async () => { const id = await dv.findByName("rezepte.json"); return id ? { fileId: id } : null; },
    rule: recipeSync({
      store: {
        readAll: async () => structuredClone(local.recipes),
        replaceAll: async (r) => { local.recipes = structuredClone(r); },
        getBase: async () => structuredClone(local.base),
        setBase: async (r) => { local.base = structuredClone(r); },
        backup: async (r) => { local.backup = structuredClone(r); },
      },
      approveDrop: async (q) => { asked.push(q); return approve; },
      onRetry: () => { retries++; },
    }),
    online: () => true,
  });
  return {
    engine, kv, local, dv, asked,
    retries: () => retries,
    meta: () => kv.get("collection", {}),
    names: () => local.recipes.map((r) => r.name).sort(),
    get: (id) => local.recipes.find((r) => r.id === id),
    /** wie sync.saveChange: Änderung in der Warteschlange auf den AKTUELLEN Stand, dann Abgleich */
    save(change, { online = true } = {}) {
      return engine.run(async ({ sync, patchMeta }) => {
        local.recipes = change(structuredClone(local.recipes));
        await patchMeta({ updated: new Date().toISOString(), dirty: true });
        if (!online) return {};
        return sync({ label: RECIPE_STATUS.saving });
      });
    },
  };
}
const edit = (id, patch) => (list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r));
const driveRecipes = (drive) => drive.json(drive.byName("rezepte.json")[0].id).recipes;
const driveNames = (drive) => driveRecipes(drive).map((r) => r.name).sort();
/** Fremder Schreiber (Projekt-Claude, v1) ändert die Drive-Datei direkt. */
function externalWrite(drive, fn) {
  const f = drive.byName("rezepte.json")[0];
  const json = JSON.parse(f.content);
  f.content = JSON.stringify(fn(json));
}

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
   Regel 1 — Rezepte: Eingangsprüfung + Drei-Wege-Merge (v2.15.1, T1/T2)
   ============================================================ */

const BASE3 = [recipe("r1", "Curry"), recipe("r2", "Dal"), recipe("r3", "Pasta")];

test("Rezepte: Erstlauf legt GENAU eine Datei an; zweites Gerät übernimmt sie statt ein Duplikat anzulegen", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  const B = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  assertEqual(drive.byName("rezepte.json").length, 1);
  assertDeepEqual(await A.meta().then((m) => [m.dirty, m.source]), [false, "drive"]);
  await A.save((l) => [recipe("r9", "Neu von A"), ...l]);
  const res = await B.engine.sync();
  assertEqual(res.changed, true);
  assertDeepEqual(B.names(), ["Curry", "Dal", "Neu von A", "Pasta"]);
  assertEqual(drive.byName("rezepte.json").length, 1);
});

test("T1 / DG-01: Claude fügt auf Drive ein Rezept hinzu, die App tippt ♥ → BEIDES bleibt (lokal und auf Drive)", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, updated: T(30), recipes: [recipe("rC", "Claudes Linsensuppe"), ...j.recipes] }));
  const res = await A.save(edit("r1", { favorite: true }));    // App hat Drive seit dem Start nicht gelesen
  assertDeepEqual(driveNames(drive), ["Claudes Linsensuppe", "Curry", "Dal", "Pasta"], "Claudes Rezept überlebt den Speichern-Push");
  assertEqual(driveRecipes(drive).find((r) => r.id === "r1").favorite, true, "♥ ist auf Drive");
  assertEqual(res.changed, true, "Speichern meldet das neue Rezept zurück");
  assert(A.get("rC"), "Claudes Rezept ist jetzt auch lokal");
  assertEqual((await A.meta()).dirty, false);
});

test("T1: Claude ändert die Schritte, die App ändert die Bewertung desselben Rezepts → beide Felder bleiben", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: j.recipes.map((r) => (r.id === "r2" ? { ...r, steps: ["Claude: neu"] } : r)) }));
  await A.save(edit("r2", { rating: 5 }));
  const r2 = driveRecipes(drive).find((r) => r.id === "r2");
  assertDeepEqual([r2.rating, r2.steps], [5, ["Claude: neu"]]);
  assertDeepEqual([A.get("r2").rating, A.get("r2").steps], [5, ["Claude: neu"]]);
});

test("T1: Offline auf beiden Geräten verschiedene Rezepte geändert → beide Änderungen überleben (kein Konflikt mehr)", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  const B = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync(); await B.engine.sync();
  await A.save(edit("r1", { name: "Curry (A)" }), { online: false });
  await B.save(edit("r2", { name: "Dal (B)" }));
  const res = await A.engine.sync();
  assert(!res.error && !res.conflict);
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.synced);
  assertDeepEqual(driveNames(drive), ["Curry (A)", "Dal (B)", "Pasta"]);
  assertDeepEqual(A.names(), ["Curry (A)", "Dal (B)", "Pasta"]);
  await B.engine.sync();
  assertDeepEqual(B.names(), ["Curry (A)", "Dal (B)", "Pasta"]);
});

test("T1: dasselbe Feld auf beiden Seiten geändert → die lokale Änderung gewinnt, der Rest bleibt", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  const B = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync(); await B.engine.sync();
  await B.save(edit("r1", { name: "Curry (B)", time: "20 Min" }));
  await A.save(edit("r1", { name: "Curry (A)" }));
  const r1 = driveRecipes(drive).find((r) => r.id === "r1");
  assertDeepEqual([r1.name, r1.time], ["Curry (A)", "20 Min"]);
});

test("T1: Löschen kommt an; Bearbeiten schlägt Löschen", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  const B = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync(); await B.engine.sync();
  await B.save((l) => l.filter((r) => r.id !== "r3"));          // B löscht Pasta
  await A.engine.sync();
  assertDeepEqual(A.names(), ["Curry", "Dal"], "Löschung kommt bei A an");
  // A bearbeitet Dal offline, während B Dal löscht → Dal bleibt (mit A's Änderung).
  await A.save(edit("r2", { name: "Dal (A)" }), { online: false });
  await B.save((l) => l.filter((r) => r.id !== "r2"));
  await A.engine.sync();
  assertDeepEqual(driveNames(drive), ["Curry", "Dal (A)"]);
});

test("T1: unverändert → kein Schreibzugriff", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync(); await A.engine.sync();
  const writes = drive.writes.length;
  const res = await A.engine.sync();
  assertEqual(res.changed, false);
  assertEqual(drive.writes.length, writes);
});

test("T1 / Kern: Speichern während eines laufenden Abgleichs wartet und geht nicht verloren", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: [recipe("rC", "Claude"), ...j.recipes] }));
  drive.hold();
  const syncing = A.engine.sync();                    // Hintergrund-Abgleich hängt im Netz …
  await tick();
  const saving = A.save(edit("r1", { name: "Curry (gerade getippt)" })); // … währenddessen gespeichert
  await tick();
  drive.release();
  await syncing; await saving;
  assertDeepEqual(A.names(), ["Claude", "Curry (gerade getippt)", "Dal", "Pasta"]);
  assertDeepEqual(driveNames(drive), ["Claude", "Curry (gerade getippt)", "Dal", "Pasta"]);
  assertEqual((await A.meta()).dirty, false);
});

test("T1: zwei schnelle Speichervorgänge → beide auf Drive, Meta sauber", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  drive.hold();
  const s1 = A.save(edit("r1", { name: "eins" }));
  const s2 = A.save(edit("r2", { name: "zwei" }));
  drive.release();
  await s1; await s2;
  assertDeepEqual(driveNames(drive), ["Pasta", "eins", "zwei"]);
  assertEqual((await A.meta()).dirty, false);
});

test("T1 / Umstieg von v2.15: ohne gespeicherte Basis, sauber → lokaler Stand gilt als Basis, Claudes Rezept kommt dazu", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  const B = recipeDevice(drive, { recipes: BASE3, base: null, meta: { ...(await A.meta()), source: "drive", dirty: false } });
  externalWrite(drive, (j) => ({ ...j, recipes: [recipe("rC", "Claude"), ...j.recipes.filter((r) => r.id !== "r3")] }));
  await B.engine.sync();
  assertDeepEqual(B.names(), ["Claude", "Curry", "Dal"], "neu übernommen, gelöschtes Pasta gelöscht");
});

test("T1 / Umstieg: ohne Basis UND ungespeicherte lokale Änderung → nichts geht verloren (Vereinigung)", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  const B = recipeDevice(drive, { recipes: [recipe("rB", "Nur auf B"), ...BASE3], base: null, meta: { updated: T(1), source: "drive", dirty: true } });
  externalWrite(drive, (j) => ({ ...j, updated: T(5), recipes: [recipe("rC", "Claude"), ...j.recipes] }));
  await B.engine.sync();
  assertDeepEqual(B.names(), ["Claude", "Curry", "Dal", "Nur auf B", "Pasta"]);
  assertDeepEqual(driveNames(drive), ["Claude", "Curry", "Dal", "Nur auf B", "Pasta"]);
});

/* ---------- T2: kaputte Drive-Dateien ---------- */

for (const [label, content] of [
  ["{}", {}], ["null", null], ["recipes: null", { version: 3, recipes: null }],
  ["falscher Schlüssel", { version: 3, Rezepte: BASE3 }], ["neueres Format", { version: 4, recipes: [] }],
]) {
  test(`T2 / DG-05: Drive-Datei „${label}“ → abgelehnt, lokal unverändert, nichts geschrieben, Fehler sichtbar`, async () => {
    const drive = fakeDrive();
    const A = recipeDevice(drive, { recipes: BASE3 });
    await A.engine.sync();
    externalWrite(drive, () => content);
    const writes = drive.writes.length;
    const origWarn = console.warn; console.warn = () => {};
    try {
      const res = await A.engine.sync();
      assert(res.error && res.error.rejected, "abgelehnt");
      assertEqual(A.engine.getStatus(), RECIPE_STATUS.rejected);
      assertDeepEqual(A.names(), ["Curry", "Dal", "Pasta"]);
      assertEqual(drive.writes.length, writes, "keine Rückschreibung");
      // Auch ein Speichern überschreibt die kaputte Datei nicht blind.
      await A.save(edit("r1", { favorite: true }));
      assertEqual(drive.writes.length, writes);
      assertEqual(A.get("r1").favorite, true, "lokal gespeichert");
    } finally { console.warn = origWarn; }
  });
}

test("T2 / DG-03: Rezept ohne id von außen → gerettet (neue id), nichts gekürzt, reparierte Datei zurückgeschrieben", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: [{ name: "Ohne id", category: "Vegetarische Hauptgerichte", ingredients: [], steps: [] }, null, ...j.recipes] }));
  const origWarn = console.warn; console.warn = () => {};
  try { await A.engine.sync(); } finally { console.warn = origWarn; }
  assertDeepEqual(A.names(), ["Curry", "Dal", "Ohne id", "Pasta"]);
  assert(A.get("r1") && typeof A.local.recipes.find((r) => r.name === "Ohne id").id === "string");
  assertEqual(driveRecipes(drive).length, 4, "Drive repariert: null weg, id vergeben");
  assert(driveRecipes(drive).every((r) => r && typeof r.id === "string"));
});

test("T2 / DG-06: doppelte id von außen → beide Rezepte bleiben (eins bekommt eine neue id)", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: [recipe("r1", "Claudes Kopie mit r01-Beispiel-id"), ...j.recipes] }));
  const origWarn = console.warn; console.warn = () => {};
  try { await A.engine.sync(); } finally { console.warn = origWarn; }
  assertEqual(A.local.recipes.length, 4);
  assertEqual(new Set(A.local.recipes.map((r) => r.id)).size, 4, "ids eindeutig");
  assert(A.names().includes("Claudes Kopie mit r01-Beispiel-id") && A.names().includes("Curry"));
});

test("T2: Drive-Datei würde viele Rezepte löschen → Rückfrage; Nein = lokal bleibt alles", async () => {
  const drive = fakeDrive();
  const many = Array.from({ length: 20 }, (_, i) => recipe("r" + i, "Rezept " + i));
  const A = recipeDevice(drive, { recipes: many, approve: false });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: j.recipes.slice(0, 8) }));   // 12 von 20 „verschwunden“
  const writes = drive.writes.length;
  const origWarn = console.warn; console.warn = () => {};
  try {
    const res = await A.engine.sync();
    assert(res.error && res.error.code === "bigDrop");
  } finally { console.warn = origWarn; }
  assertDeepEqual(A.asked, [{ count: 12, total: 20 }]);
  assertEqual(A.local.recipes.length, 20);
  assertEqual(drive.writes.length, writes);
});

test("T2: … Ja = Löschung übernommen, vorher eine lokale Sicherung", async () => {
  const drive = fakeDrive();
  const many = Array.from({ length: 20 }, (_, i) => recipe("r" + i, "Rezept " + i));
  const A = recipeDevice(drive, { recipes: many, approve: true });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: j.recipes.slice(0, 8) }));
  await A.engine.sync();
  assertEqual(A.local.recipes.length, 8);
  assertEqual(A.local.backup.length, 20, "Sicherung des vorherigen Stands");
});

test("T2: ein einzelnes gelöschtes Rezept braucht keine Rückfrage", async () => {
  const drive = fakeDrive();
  const many = Array.from({ length: 20 }, (_, i) => recipe("r" + i, "Rezept " + i));
  const A = recipeDevice(drive, { recipes: many });
  await A.engine.sync();
  externalWrite(drive, (j) => ({ ...j, recipes: j.recipes.slice(1) }));
  await A.engine.sync();
  assertEqual(A.asked.length, 0);
  assertEqual(A.local.recipes.length, 19);
});

test("T2: kaputtes JSON (Text) → abgelehnt wie eine kaputte Datei, lokal bleibt", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: BASE3 });
  await A.engine.sync();
  drive.byName("rezepte.json")[0].content = '{"version":3,"recipes":[';
  const origWarn = console.warn; console.warn = () => {};
  try { await A.engine.sync(); } finally { console.warn = origWarn; }
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.rejected);
  assertEqual(A.local.recipes.length, 3);
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
