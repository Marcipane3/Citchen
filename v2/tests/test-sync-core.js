// Tests: P1 — der eine Sync-Kern (data/syncCore.js) mit beiden Merge-Regeln (data/syncRules.js).
// „Zwei Instanzen“: zwei Geräte (je eigene Engine + eigener lokaler Speicher + eigene Meta) gegen
// EINE In-Memory-Drive. Rein Node: kein DOM, kein IndexedDB, kein Netz. Die Fake-Drive kann
// Anfragen anhalten (hold/release), damit Rennen (Abgleich läuft, während gespeichert/verbunden wird)
// deterministisch nachgestellt werden.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { createSyncEngine } from "../src/data/syncCore.js";
import { lastWriteWins, itemMerge, pushCollection, RECIPE_STATUS } from "../src/data/syncRules.js";

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

/** Rezept-Gerät: Engine + lokaler Speicher (wie sync.js, aber mit Fakes). */
function recipeDevice(drive, { recipes = [], meta = { updated: T(0), source: "snapshot", dirty: false } } = {}) {
  const kv = fakeKv();
  kv.m.set("collection", meta);
  const local = { recipes: structuredClone(recipes) };
  const dv = drive.device();
  const engine = createSyncEngine({
    name: "rezepte", metaKey: "collection", fileName: "rezepte.json", drive: dv, kv,
    locate: async () => { const id = await dv.findByName("rezepte.json"); return id ? { fileId: id } : null; },
    rule: lastWriteWins({ store: { readAll: async () => structuredClone(local.recipes), replaceAll: async (r) => { local.recipes = structuredClone(r); } } }),
    online: () => true,
  });
  return {
    engine, kv, local, dv,
    meta: () => kv.get("collection", {}),
    names: () => local.recipes.map((r) => r.name).sort(),
    /** wie sync.saveCollection: lokal sofort, dann Push in der Warteschlange */
    async save(recipes, { online = true } = {}) {
      const updated = new Date().toISOString();
      local.recipes = structuredClone(recipes);
      await engine.patchMeta({ updated, dirty: true });
      if (!online) return null;
      return engine.run(pushCollection({ updated, recipes }));
    },
  };
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
   Regel 1 — Rezepte: Datei-weites Last-Write-Wins (zwei Geräte, ein Konto)
   ============================================================ */

test("LWW: Erstlauf legt GENAU eine Datei an; zweites Gerät zieht sie statt ein Duplikat anzulegen", async () => {
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

test("LWW: Speichern schreibt in place; zweites Gerät übernimmt beim nächsten Abgleich", async () => {
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

test("LWW: unverändert → noop, kein Schreibzugriff", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync(); await A.engine.sync();
  const writes = drive.writes.length;
  const res = await A.engine.sync();
  assertEqual(res.changed, false);
  assertEqual(drive.writes.length, writes);
});

test("LWW / K2: offline geändert, Drive inzwischen neuer → Konflikt, nichts wird überschrieben", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry"), recipe("r2", "Dal")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry"), recipe("r2", "Dal")] });
  await A.engine.sync(); await B.engine.sync();
  await A.save([recipe("r1", "Curry (A offline)"), recipe("r2", "Dal")], { online: false });
  await new Promise((r) => setTimeout(r, 2));
  await B.save([recipe("r1", "Curry"), recipe("r2", "Dal (B)")]);
  const res = await A.engine.sync();
  assertEqual(res.conflict, true);
  assertEqual(A.engine.getStatus(), RECIPE_STATUS.conflict);
  assertDeepEqual(A.names(), ["Curry (A offline)", "Dal"], "lokale Änderung bleibt");
  assertEqual((await A.meta()).dirty, true);
  const id = drive.byName("rezepte.json")[0].id;
  assertDeepEqual(drive.json(id).recipes.map((r) => r.name).sort(), ["Curry", "Dal (B)"], "Drive bleibt B's Stand");
});

test("LWW: offline geändert und jünger als Drive → Push beim nächsten Abgleich", async () => {
  const drive = fakeDrive();
  const A = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  const B = recipeDevice(drive, { recipes: [recipe("r1", "Curry")] });
  await A.engine.sync(); await B.engine.sync();
  await B.save([recipe("r1", "Curry (B)")]);
  await new Promise((r) => setTimeout(r, 2));
  await A.save([recipe("r1", "Curry (A, später)")], { online: false });
  await A.engine.sync();
  const id = drive.byName("rezepte.json")[0].id;
  assertDeepEqual(drive.json(id).recipes.map((r) => r.name), ["Curry (A, später)"]);
  assertEqual((await A.meta()).dirty, false);
});

test("LWW / Kern: während eines Abgleichs gespeichert → Pull überschreibt die neue lokale Änderung NICHT", async () => {
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

test("LWW / Kern: zwei schnelle Speichervorgänge → Drive endet beim letzten, Meta sauber", async () => {
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
