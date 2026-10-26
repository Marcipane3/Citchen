// Tests: v2.15.2 — Einkaufsliste sicher machen (Epic T, FR-01).
//  T4  Artikel ohne id (Altbestand vor v2.11) vermehren sich nicht mehr     (DG-04)
//  T7  Tombstone-Aufräumen kämpft nicht mehr gegen den Merge                (AR-09, DG-13, BH-11, TW-12)
//  T10 einkaufsliste.json wird beim Lesen geprüft und repariert             (AR-11, DG-14)
// Rein: listFile.js + listMerge.js, kein DOM/IndexedDB/Netz. Den Ablauf mit Sync-Kern und zwei
// Geräten prüft test-sync-core.js („Liste / T4 …“), den Browser e2e/tests/07-partner-sync.
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import { inspectList, sanitizeItem, ListRejected, LIST_VERSION } from "../src/data/listFile.js";
import {
  syncStep, ensureItemMeta, adoptLegacy, stableItemId, LEGACY_STAMP, sameItems, pruneCutoff, mergeList, pruneTombstones,
} from "../src/features/shopping/listMerge.js";

const DAY = 86400000;
const NOW = "2026-10-19T10:00:00.000Z";
const ago = (days) => new Date(Date.parse(NOW) - days * DAY).toISOString();
const at = (min) => new Date(Date.parse(NOW) + min * 60000).toISOString();
const item = (id, name, updated, extra = {}) => ({ id, name, qty: 1, done: false, cat: "Obst & Gemüse", icon: "🥕", updated, author: "local", deleted: false, ...extra });
const live = (items, name) => items.filter((x) => !x.deleted && (!name || x.name === name));

/** So hat v2.10 Rezept-Zutaten nach Drive geschrieben: ohne id, ohne updated (git e5c0eef). */
const LEGACY_INGWER = { name: "Ingwer", nameDe: "Ingwer", amount: 1, unit: "Stück", cat: "Obst & Gemüse", icon: "🫚", qty: 1, done: false, sources: ["r1749400081000"] };

/** Der Merge-Schritt vor v2.15.2 (nur Union pro id + Aufräumen) — für die Gegenprobe. */
function oldSyncStep(local, remote, now) {
  const merged = pruneTombstones(mergeList(local, remote), now);
  return { merged, prunedBefore: "", writeRemote: !sameItems(remote, merged) };
}

/**
 * Ein Gerät synct gegen die Datei — genau die Schritte von listSync.loadLocalList + itemMerge,
 * ohne Engine: laden (ensureItemMeta), Datei prüfen, mergen, ggf. zurückschreiben.
 * `fixed: false` spielt den alten Ablauf (vor v2.15.2) nach.
 */
function deviceSync(dev, file, now, { fixed = true } = {}) {
  dev.items = fixed ? ensureItemMeta(adoptLegacy(dev.items), now) : ensureItemMeta(dev.items, now);
  const f = fixed ? inspectList(file) : { items: file.items, legacy: [], notes: [], prunedBefore: "" };
  const horizon = fixed && dev.syncedFile ? f.prunedBefore : "";
  const step = fixed ? syncStep(dev.items, f.items, now, { legacy: f.legacy, horizon }) : oldSyncStep(dev.items, f.items, now);
  const prunedBefore = step.prunedBefore > f.prunedBefore ? step.prunedBefore : f.prunedBefore;
  const write = step.writeRemote || f.notes.length > 0 || prunedBefore !== f.prunedBefore;
  dev.items = step.merged;
  dev.syncedFile = true;
  return write ? { version: 1, updated: now, ...(prunedBefore ? { prunedBefore } : {}), items: step.merged } : file;
}

/* ============================================================
   T10 — Form der Datei
   ============================================================ */

for (const [label, file] of [
  ["null", null], ["Array", []], ["Text", "einkaufsliste"], ["{}", {}], ["items: null", { version: 1, items: null }],
  ["items als Objekt", { version: 1, items: { a: 1 } }], ["Version 2 (neueres Format)", { version: 2, entries: [] }],
  ["Version 2 mit items", { version: 2, items: [] }], ["Version als Text", { version: "1", items: [] }],
]) {
  test(`T10 / DG-14: Listen-Datei „${label}“ → abgelehnt (nichts wird überschrieben)`, () => {
    let err = null;
    try { inspectList(file); } catch (e) { err = e; }
    assert(err instanceof ListRejected, "ListRejected erwartet");
    assertEqual(err.rejected, true);
  });
}

test("T10: gültige Datei (auch ohne version) → angenommen, Artikel bleiben dieselben Objekte", () => {
  const a = item("a", "Milch", at(0));
  const r = inspectList({ items: [a] });
  assert(r.items[0] === a, "unverändert durchgereicht");
  assertDeepEqual(r.notes, []);
  assertDeepEqual(r.legacy, []);
  assertEqual(inspectList({ version: LIST_VERSION, updated: at(0), items: [] }).items.length, 0);
});

test("T10 / AR-11: Artikel mit falschen Typen werden repariert, ohne Namen verworfen", () => {
  const r = inspectList({ version: 1, items: [
    item("a", "Milch", at(0), { qty: "5", done: "ja", amount: "viel", unit: 7, cat: { x: 1 }, author: 42, sources: "r1" }),
    item("b", 12345, at(0)),                          // Name keine Zeichenkette, offen → weg
    item("c", "   ", at(0)),                          // leerer Name, offen → weg
    "Ingwer",                                         // kein Objekt → weg
    { id: "d", deleted: true, updated: at(0) },       // Tombstone ohne Namen → bleibt (Löschung muss ankommen)
  ] });
  assertDeepEqual(r.items.map((x) => x.id), ["a", "d"]);
  const a = r.items[0];
  assertEqual(a.qty, 1); assertEqual(a.done, false); assertEqual(a.amount, null); assertEqual(a.unit, null);
  assertEqual(a.cat, "Sonstiges");
  assert(!("author" in a) && !("sources" in a), "kaputte Felder entfernt");
  assertEqual(r.items[1].name, "");
  assert(r.notes.length >= 4, "jede Reparatur ist notiert → Datei wird einmal zurückgeschrieben");
});

test("T10 / AR-11: ein überlanges Symbol (HTML statt Emoji) wird entfernt, ein Emoji bleibt", () => {
  const evil = sanitizeItem(item("a", "Milch", at(0), { icon: '<img src=x onerror="alert(1)">' }));
  assert(!("icon" in evil), "Symbol entfernt → Anzeige nimmt 🛒");
  const ok = item("b", "Brot", at(0), { icon: "🧑‍🍳" });
  assert(sanitizeItem(ok) === ok, "Emoji (auch mit ZWJ) bleibt");
});

test("T10: unbekannte Felder eines neueren Builds bleiben erhalten", () => {
  const x = item("a", "Milch", at(0), { brand: "Arla" });
  assert(sanitizeItem(x) === x);
});

/* ============================================================
   T4 — Altbestand ohne id
   ============================================================ */

test("T4: stableItemId ist deterministisch (Groß/Klein, Leerzeichen egal), Einheit zählt", () => {
  assertEqual(stableItemId({ name: "Ingwer", unit: "Stück" }), stableItemId({ name: " ingwer ", unit: "stück" }));
  assert(stableItemId({ name: "Ingwer", unit: "Stück" }) !== stableItemId({ name: "Ingwer", unit: "g" }));
  assert(stableItemId({ name: "Ingwer" }).startsWith("li-x-"));
  assertEqual(stableItemId({ name: "Ginger", nameDe: "Ingwer", unit: "Stück" }), stableItemId(LEGACY_INGWER), "deutscher Schlüssel zählt");
});

test("T4: adoptLegacy gibt ids nur Artikeln ohne id — mit ältester Marke", () => {
  const a = item("a", "Milch", at(0));
  const [x, y] = adoptLegacy([a, { ...LEGACY_INGWER }]);
  assert(x === a);
  assertEqual(y.id, stableItemId(LEGACY_INGWER));
  assertEqual(y.updated, LEGACY_STAMP);
  assertEqual(y.deleted, false);
});

test("T4 / DG-04: drei Artikel ohne id in der Datei → alle drei bleiben (früher nur der erste)", () => {
  const r = inspectList({ version: 1, items: [{ ...LEGACY_INGWER }, { name: "Knoblauch", unit: "Zehe" }, { name: "Zitrone", unit: "Stück" }] });
  assertEqual(r.legacy.length, 3);
  const { merged } = syncStep([], r.items, NOW, { legacy: r.legacy });
  assertDeepEqual(live(merged).map((x) => x.name).sort(), ["Ingwer", "Knoblauch", "Zitrone"]);
});

test("T4 / FR-01 (Gegenprobe): der alte Ablauf macht aus EINEM Ingwer pro Sync eine Zeile mehr", () => {
  const dev = { items: [] };
  let file = { version: 1, items: [{ ...LEGACY_INGWER }] };
  const counts = [];
  for (let i = 1; i <= 3; i++) { file = deviceSync(dev, file, at(i), { fixed: false }); dev.items = ensureItemMeta(dev.items, at(i)); counts.push(live(dev.items, "Ingwer").length); }
  assertDeepEqual(counts, [1, 2, 3], "genau der gemeldete Fehler");
});

test("T4 / FR-01: 5 Syncs mit Ingwer ohne id → immer genau EINE Zeile; Datei danach ohne id-lose Artikel", () => {
  const dev = { items: [] };
  let file = { version: 1, items: [{ ...LEGACY_INGWER }] };
  for (let i = 1; i <= 5; i++) {
    file = deviceSync(dev, file, at(i));
    assertEqual(live(dev.items, "Ingwer").length, 1, `lokal nach Sync ${i}`);
    assertEqual(live(file.items, "Ingwer").length, 1, `Drive nach Sync ${i}`);
  }
  assert(file.items.every((x) => x.id), "jeder Artikel in der Datei hat jetzt eine id");
});

test("T4 / FR-01: Löschen bleibt gelöscht (Tombstone mit stabiler id schlägt den Altbestand)", () => {
  const dev = { items: [] };
  let file = { version: 1, items: [{ ...LEGACY_INGWER }] };
  file = deviceSync(dev, file, at(1));
  dev.items = dev.items.map((x) => (x.name === "Ingwer" ? { ...x, deleted: true, updated: at(2) } : x));
  for (let i = 3; i <= 6; i++) file = deviceSync(dev, file, at(i));
  assertEqual(live(dev.items, "Ingwer").length, 0);
  assertEqual(live(file.items, "Ingwer").length, 0);
  // Ein zweites Gerät, das den Altbestand noch lokal hat (alte Marke), belebt ihn nicht.
  const other = { items: [{ ...LEGACY_INGWER }] };
  file = deviceSync(other, file, at(7));
  assertEqual(live(other.items, "Ingwer").length, 0);
  assertEqual(live(file.items, "Ingwer").length, 0);
});

test("T4: Marcels Stand — Altbestand + 4 Kopien auf Drive und lokal → nach einem Sync EINE Zeile, Kopien als Tombstones", () => {
  const copies = [1, 2, 3, 4].map((n) => ({ author: "local", ...LEGACY_INGWER, id: "li-copy" + n, updated: at(n), deleted: false }));
  const dev = { items: copies.map((c) => ({ ...c })) };
  let file = { version: 1, items: [{ ...LEGACY_INGWER }, ...copies] };
  file = deviceSync(dev, file, at(10));
  assertEqual(live(dev.items, "Ingwer").length, 1);
  assertEqual(live(file.items, "Ingwer").length, 1);
  assertEqual(live(file.items, "Ingwer")[0].id, stableItemId(LEGACY_INGWER));
  assertEqual(file.items.filter((x) => x.deleted).length, 4, "Kopien erreichen den Partner als Löschung");
  // Stabil: der nächste Sync schreibt nichts mehr.
  const again = deviceSync(dev, file, at(11));
  assert(again === file, "zweiter Sync schreibt nicht (CR-02)");
});

test("T4: hat Marcel alle Kopien gelöscht, bleibt Ingwer nach dem Aufräumen gelöscht", () => {
  const copies = [1, 2].map((n) => ({ author: "local", ...LEGACY_INGWER, id: "li-copy" + n, updated: at(n), deleted: true }));
  const dev = { items: copies.map((c) => ({ ...c })) };
  let file = { version: 1, items: [{ ...LEGACY_INGWER }, ...copies] };
  file = deviceSync(dev, file, at(10));
  assertEqual(live(dev.items, "Ingwer").length, 0);
  assertEqual(live(file.items, "Ingwer").length, 0);
});

test("T4: abgehakte Kopie gewinnt (zuletzt geändert), ein echter anderer Artikel bleibt unberührt", () => {
  const copies = [
    { author: "local", ...LEGACY_INGWER, id: "li-c1", updated: at(1), deleted: false },
    { author: "local", ...LEGACY_INGWER, id: "li-c2", updated: at(3), deleted: false, done: true },
  ];
  const other = item("li-own", "Ingwer", at(2), { unit: null, amount: null, cat: "Obst & Gemüse" }); // Katalog-Ingwer, kein Rezept-Altbestand
  const dev = { items: [...copies, other].map((c) => ({ ...c })) };
  const file = deviceSync(dev, { version: 1, items: [{ ...LEGACY_INGWER }, ...copies] }, at(10));
  const rows = live(file.items, "Ingwer");
  assertDeepEqual(rows.map((x) => x.id).sort(), ["li-own", stableItemId(LEGACY_INGWER)].sort());
  assertEqual(rows.find((x) => x.id !== "li-own").done, true);
});

/* ============================================================
   T7 — Tombstones aufräumen
   ============================================================ */

test("T7 / AR-09: alter Tombstone nur lokal → ein Sync räumt ihn auf, der nächste schreibt nichts", () => {
  const dev = { items: [item("a", "Milch", ago(1)), item("old", "Feta", ago(40), { deleted: true })], syncedFile: true };
  let file = { version: 1, items: [item("a", "Milch", ago(1))] };
  file = deviceSync(dev, file, NOW);
  assert(!dev.items.some((x) => x.id === "old"), "lokal aufgeräumt");
  const again = deviceSync(dev, file, NOW);
  assert(again === file, "stabil: kein weiterer Schreibvorgang");
});

test("T7 / TW-12 / BH-11: Gerät > 30 Tage offline → aufgeräumter gelöschter Artikel kommt NICHT zurück", () => {
  const X = item("x", "Ingwer", ago(50));
  const A = { items: [{ ...X }], syncedFile: true };
  const B = { items: [{ ...X }], syncedFile: true };          // hat vor langer Zeit mit derselben Datei abgeglichen
  let file = { version: 1, items: [{ ...X }] };
  A.items = A.items.map((x) => ({ ...x, deleted: true, updated: ago(35) }));
  file = deviceSync(A, file, NOW);                             // A löscht, Tombstone ist schon alt → aufgeräumt
  assertEqual(file.items.length, 0);
  assertEqual(file.prunedBefore, pruneCutoff(NOW), "Horizont steht in der Datei");
  file = deviceSync(B, file, at(5));                           // B kommt zurück
  assertEqual(live(B.items).length, 0, "B verwirft den alten Artikel");
  assertEqual(live(file.items).length, 0, "und belebt ihn nicht auf Drive");
});

test("T7: … ein NEUER Artikel des zurückkehrenden Geräts bleibt aber erhalten", () => {
  const B = { items: [item("new", "Bananen", at(1))], syncedFile: true };
  const file = deviceSync(B, { version: 1, prunedBefore: ago(30), items: [] }, at(2));
  assertDeepEqual(live(file.items).map((x) => x.name), ["Bananen"]);
});

test("T7: erstes Verbinden mit einer Datei (Partner-Liste) → alte eigene Artikel gelten als neu, nichts geht verloren", () => {
  const B = { items: [item("mine", "Reis", ago(90))] };       // kein syncedFile: diese Datei ist neu für B
  const file = deviceSync(B, { version: 1, prunedBefore: ago(30), items: [] }, NOW);
  assertDeepEqual(live(file.items).map((x) => x.name), ["Reis"]);
});

test("T7: Horizont geht nicht verloren, wenn nichts aufgeräumt wird", () => {
  const dev = { items: [], syncedFile: true };
  const file = { version: 1, prunedBefore: ago(30), items: [item("a", "Milch", at(0))] };
  const out = deviceSync(dev, file, at(1));
  assert(out === file, "nichts geändert → kein Schreiben");
  dev.items.push(item("b", "Brot", at(2)));
  const next = deviceSync(dev, out, at(3));
  assertEqual(next.prunedBefore, ago(30));
  assert(sameItems(next.items, dev.items));
});
