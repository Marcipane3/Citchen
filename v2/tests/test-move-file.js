// Tests: data/moveFile.js — P5 (#108) Umzugs-Datei (alte Adresse exportiert, neue importiert).
import { test, assert, assertEqual, assertDeepEqual } from "./runner.js";
import {
  ENTRIES, MOVE_KIND, MOVE_VERSION, MAX_BYTES, MoveRejected,
  collectValues, writeValues, buildMoveFile, parseMoveFile, moveFileName,
  planMoveImport, writesFor, exportWarning,
} from "../src/data/moveFile.js";

const TOKEN = "a".repeat(64);
const SECRET_KEY = "sk-ant-api03-GEHEIM-nicht-in-die-datei";
const DRIVE_TOKEN = "ya29.google-token-nicht-in-die-datei";

/** Speicher einer Adresse (Origin) als Attrappe: kv, localStorage, IndexedDB-Stores. */
function fakeOrigin({ kv = {}, ls = {}, stores = {} } = {}) {
  const K = new Map(Object.entries(kv)), L = new Map(Object.entries(ls));
  const S = new Map(Object.entries(stores).map(([s, rows]) => [s, new Map(rows.map((r) => [r.id, r]))]));
  const store = (s) => { if (!S.has(s)) S.set(s, new Map()); return S.get(s); };
  return {
    K, L, S,
    io: {
      kvGet: async (k) => K.get(k),
      lsGet: async (k) => (L.has(k) ? L.get(k) : null),
      storeGet: async (s, id) => store(s).get(id),
      kvSet: async (k, v) => { K.set(k, v); },
      lsSet: async (k, v) => { L.set(k, v); },
      storePut: async (s, row) => { store(s).set(row.id, row); },
    },
  };
}

const item = (id, name, updated) => ({ id, name, qty: 1, done: false, updated });

/** Eine typische alte Adresse: alles, was der Browser hält — inkl. Dingen, die NICHT mit dürfen. */
function oldOrigin() {
  return fakeOrigin({
    kv: {
      lagerPantry: [{ name: "Reis", cat: "Trockenwaren", on: true }, { name: "Tahin", cat: "Sonstiges", on: false, custom: true }],
      lagerFridge: [{ name: "Joghurt", menge: "500 g", icon: "🥛" }],
      cookProfile: { level: "Profi", diet: "vegetarisch", servings: "2", weekday: "", weekend: "", shopping: "", equipment: "", spices: "", notes: "" },
      assistantInstructions: "Sei knapp. {profile} {stock} {fridge} {recipes} {language}",
      plannerRecent: ["r01", "r02"],
      plannerLeftovers: true,
      listMeta: { fileId: "partnerFile_1234567890", ownFileId: "ownFile_1234567890", linked: true, dirty: true, lastSync: "2026-11-20T10:00:00Z" },
      friendInbox: { ownerToken: TOKEN, invite: "b".repeat(32), ownerName: "Marcel", seen: ["s1", "s2"], published: "hash" },
      matches: ["r05"],
      theme: "dark",
      shopSort: "alpha",
      // gehört Drive bzw. ist Sync-Zustand — darf nicht mit
      collection: { dirty: false, fileId: "x" }, recipesBase: [{ id: "r01" }], deviceId: "d-123",
    },
    ls: {
      kochv2_lang: "es",
      kochv2_model: "claude-sonnet-5-5",
      kochv2_sort: "az",
      kochv2_cookPortions: JSON.stringify({ r01: 2 }),
      kochv2_usage: JSON.stringify([{ t: "2026-11-01T10:00:00Z", a: "assistant", m: "claude-haiku-5-5", in: 100, out: 50, cr: 0, cw: 0, wf: 0 }]),
      // Geheimnisse — nie in die Datei
      kochv2_apikey: SECRET_KEY,
      kochv2_token: JSON.stringify({ t: DRIVE_TOKEN, e: 0 }),
      kochv2_connected: "1",
      "koch.supabase": JSON.stringify({ url: "https://dev.supabase.co", key: "dev" }),
    },
    stores: {
      plans: [{ id: "current", weekOf: "2026-11-16", createdAt: "2026-11-16T08:00:00Z", days: [{ day: "Mo", recipeId: "r01", slot: "alltag", locked: true }, { day: "Di", recipeId: null, slot: "alltag" }] }],
      lists: [{ id: "current", items: [item("li-1", "Milch", "2026-11-20T09:00:00Z")], updated: "2026-11-20T09:00:00Z" }],
      recipes: [{ id: "r01", name: "Rezept" }],
    },
  });
}

async function exportOld() {
  const o = oldOrigin();
  return { o, file: buildMoveFile(await collectValues(o.io), { now: new Date("2026-12-03T12:00:00Z"), from: "https://marcipane3.github.io/Citchen/v2/" }) };
}

test("#108 moveFile: Round-Trip — exportieren, leere neue Adresse importieren, gleiche Daten", async () => {
  const { o, file } = await exportOld();
  const parsed = parseMoveFile(JSON.stringify(file));
  assertDeepEqual(parsed.data, file.data);
  assertDeepEqual(parsed.dropped, []);
  const n = fakeOrigin();
  const plan = planMoveImport(parsed.data, await collectValues(n.io));
  assertDeepEqual(plan.conflicts, [], "leere Adresse: keine Rückfrage");
  await writeValues(writesFor(plan, false), n.io, "2026-12-05T08:00:00Z");
  const after = buildMoveFile(await collectValues(n.io), { now: new Date("2026-12-03T12:00:00Z"), from: file.from });
  assertDeepEqual(after.data, file.data);
  // Inhalte stimmen mit der alten Adresse überein
  assertDeepEqual(n.K.get("lagerPantry"), o.K.get("lagerPantry"));
  assertDeepEqual(n.K.get("lagerFridge"), o.K.get("lagerFridge"));
  assertEqual(n.K.get("friendInbox").ownerToken, TOKEN);
  assertEqual(n.L.get("kochv2_lang"), "es");
  assertDeepEqual(JSON.parse(n.L.get("kochv2_cookPortions")), { r01: 2 });
  assertEqual(n.S.get("plans").get("current").days[0].recipeId, "r01");
  assertEqual(n.S.get("lists").get("current").items[0].name, "Milch");
});

test("#108 moveFile: Anthropic-Schlüssel, Google-Token und Dev-Weiche stehen NIE in der Datei", async () => {
  const { file } = await exportOld();
  const text = JSON.stringify(file);
  assert(!text.includes(SECRET_KEY), "API-Schlüssel in der Datei");
  assert(!text.includes(DRIVE_TOKEN), "Drive-Token in der Datei");
  assert(!text.includes("dev.supabase.co"), "Supabase-Weiche in der Datei");
  const sources = ENTRIES.map((e) => e.src.kv || e.src.ls || e.src.store);
  for (const k of ["kochv2_apikey", "kochv2_token", "kochv2_connected", "koch.supabase", "recipes", "collection", "recipesBase", "recipesBackup"]) {
    assert(!sources.includes(k), `${k} steht in der Erlaubnisliste`);
  }
  // auch ein untergeschobener Wert fällt weg
  const sneaky = buildMoveFile({ apiKey: SECRET_KEY, kochv2_apikey: SECRET_KEY, theme: "light" });
  assertDeepEqual(Object.keys(sneaky.data), ["theme"]);
});

test("#108 moveFile: Besitzer-Token des Freunde-Links ist dabei (Entscheidung 21.11.); Sync-Zustand nicht", async () => {
  const { file } = await exportOld();
  assertEqual(file.data.friendsLink.ownerToken, TOKEN);
  assertEqual(file.data.friendsLink.published, "", "Schaufenster wird neu veröffentlicht");
  assertDeepEqual(file.data.shoppingLink, { fileId: "partnerFile_1234567890", ownFileId: "ownFile_1234567890", linked: true });
  assertEqual(file.kind, MOVE_KIND);
  assertEqual(file.version, MOVE_VERSION);
  assertEqual(file.created, "2026-12-03T12:00:00.000Z");
});

test("#108 moveFile: kaputte Datei wird mit Code abgelehnt", () => {
  const code = (fn) => { try { fn(); } catch (e) { assert(e instanceof MoveRejected, e.message); return e.code; } return "kein Fehler"; };
  const ok = { kind: MOVE_KIND, version: 1, data: {} };
  assertEqual(code(() => parseMoveFile(null)), "notText");
  assertEqual(code(() => parseMoveFile(" ".repeat(MAX_BYTES + 1))), "tooBig");
  assertEqual(code(() => parseMoveFile("{kein json")), "notJson");
  assertEqual(code(() => parseMoveFile(JSON.stringify({ version: 3, recipes: [] }))), "notMove", "Rezept-Export ist keine Umzugs-Datei");
  assertEqual(code(() => parseMoveFile(JSON.stringify({ ...ok, version: undefined }))), "notMove");
  assertEqual(code(() => parseMoveFile(JSON.stringify({ ...ok, version: "1" }))), "notMove");
  assertEqual(code(() => parseMoveFile(JSON.stringify({ ...ok, version: 2 }))), "newer");
  assertEqual(code(() => parseMoveFile(JSON.stringify({ ...ok, data: [] }))), "notMove");
  assertDeepEqual(parseMoveFile(JSON.stringify(ok)), { data: {}, dropped: [] });
});

test("#108 moveFile: Import prüft jeden Wert — Unbekanntes und Kaputtes fällt weg, Rest bleibt", () => {
  const text = JSON.stringify({ kind: MOVE_KIND, version: 1, data: {
    pantry: [{ name: "Reis", cat: "Trockenwaren", on: true, extra: "<script>" }, { name: "", on: true }, "kaputt"],
    fridge: "kein array",
    theme: "pink",
    language: "da",
    friendsLink: { ownerToken: "zu-kurz", invite: "b".repeat(32) },
    apiKey: SECRET_KEY,
    recipes: [{ id: "r01" }],
    instructions: "x".repeat(50001),
  } });
  const { data, dropped } = parseMoveFile(text);
  assertDeepEqual(data, { pantry: [{ name: "Reis", cat: "Trockenwaren", on: true }], language: "da" });
  assertDeepEqual(dropped.sort(), ["apiKey", "fridge", "friendsLink", "instructions", "recipes", "theme"]);
});

test("#108 moveFile: Import füllt nur leere Speicher; andere Daten nur nach Zustimmung", async () => {
  const { file } = await exportOld();
  const n = fakeOrigin({
    kv: { cookProfile: { level: "Anfänger" }, theme: "dark" },   // Profil anders, Theme gleich
    ls: { kochv2_lang: "de" },                                    // Sprache beim Erststart gewählt
  });
  const plan = planMoveImport(file.data, await collectValues(n.io));
  assertDeepEqual(plan.conflicts, ["profile", "prefs"]);
  assertDeepEqual(Object.keys(plan.replace).sort(), ["language", "profile"]);
  assert(plan.unchanged.includes("theme"));
  assert("pantry" in plan.fill && "friendsLink" in plan.fill, "leere Speicher werden gefüllt");
  assert("cookbookSort" in plan.fill, "fehlender Einzelwert der Gruppe wird gefüllt");

  // Ablehnen: vorhandene Daten bleiben, leere werden trotzdem gefüllt
  await writeValues(writesFor(plan, false), n.io);
  assertDeepEqual(n.K.get("cookProfile"), { level: "Anfänger" });
  assertEqual(n.L.get("kochv2_lang"), "de");
  assertDeepEqual(n.K.get("lagerPantry"), file.data.pantry);

  // Zustimmen: ersetzt
  const n2 = fakeOrigin({ kv: { cookProfile: { level: "Anfänger" } }, ls: { kochv2_lang: "de" } });
  await writeValues(writesFor(planMoveImport(file.data, await collectValues(n2.io)), true), n2.io);
  assertEqual(n2.K.get("cookProfile").level, "Profi");
  assertEqual(n2.L.get("kochv2_lang"), "es");
});

test("#108 moveFile: zweiter Import derselben Datei ändert nichts und fragt nichts", async () => {
  const { file } = await exportOld();
  const n = fakeOrigin();
  await writeValues(writesFor(planMoveImport(file.data, await collectValues(n.io)), false), n.io);
  const again = planMoveImport(file.data, await collectValues(n.io));
  assertDeepEqual(again.conflicts, []);
  assertDeepEqual({ ...again.fill, ...again.merge, ...again.replace }, {});
});

test("#108 moveFile: Einkaufsliste wird zusammengeführt (neuestes `updated` gewinnt), keine Rückfrage", async () => {
  const fileData = { shoppingList: [item("li-1", "Milch alt", "2026-11-01T00:00:00Z"), item("li-2", "Brot", "2026-11-02T00:00:00Z")] };
  const n = fakeOrigin({ stores: { lists: [{ id: "current", items: [item("li-1", "Milch neu", "2026-12-05T00:00:00Z")] }] } });
  const plan = planMoveImport(fileData, await collectValues(n.io));
  assertDeepEqual(plan.conflicts, []);
  const merged = plan.merge.shoppingList;
  assertEqual(merged.length, 2);
  assertEqual(merged.find((x) => x.id === "li-1").name, "Milch neu", "neuere Zeile der neuen Adresse bleibt");
  assert(merged.some((x) => x.id === "li-2"), "Zeile aus der Datei kommt dazu");
});

test("#108 moveFile: KI-Verbrauch wird ohne Doppelte zusammengeführt, sortiert, gekappt", async () => {
  const e = (t) => ({ t, a: "assistant", m: "claude-haiku-5-5", in: 1, out: 1, cr: 0, cw: 0, wf: 0 });
  const n = fakeOrigin({ ls: { kochv2_usage: JSON.stringify([e("2026-12-05T00:00:00Z"), e("2026-11-01T00:00:00Z")]) } });
  const plan = planMoveImport({ aiUsage: [e("2026-11-01T00:00:00Z"), e("2026-11-15T00:00:00Z")] }, await collectValues(n.io));
  assertDeepEqual(plan.merge.aiUsage.map((x) => x.t), ["2026-11-01T00:00:00Z", "2026-11-15T00:00:00Z", "2026-12-05T00:00:00Z"]);
  const many = Array.from({ length: 500 }, (_, i) => e(`2026-10-${String(1 + (i % 28)).padStart(2, "0")}T00:00:${String(i % 60).padStart(2, "0")}.${i}Z`));
  const big = planMoveImport({ aiUsage: many }, { aiUsage: [e("2026-12-06T00:00:00Z")] });
  assertEqual(big.merge.aiUsage.length, 500);
  assertEqual(big.merge.aiUsage[499].t, "2026-12-06T00:00:00Z", "die neuesten bleiben");
});

test("#108 moveFile: ein kaputter Wert auf der neuen Adresse zählt als leer (wird gefüllt)", async () => {
  const n = fakeOrigin({ kv: { lagerFridge: "kaputt" } });
  const plan = planMoveImport({ fridge: [{ name: "Ei", menge: "6" }] }, await collectValues(n.io));
  assertDeepEqual(plan.fill, { fridge: [{ name: "Ei", menge: "6" }] });
  assertDeepEqual(plan.conflicts, []);
});

test("#108 moveFile: Hinweis vor dem Export — nicht verbunden, ungesyncte Änderungen, alles ok", () => {
  assertEqual(exportWarning({ dirty: true }, false), "local");
  assertEqual(exportWarning(null, false), "local");
  assertEqual(exportWarning({ dirty: true }, true), "dirty");
  assertEqual(exportWarning({ dirty: false }, true), null);
  assertEqual(exportWarning(null, true), null);
});

test("#108 moveFile: Dateiname citchen-umzug-JJJJ-MM-TT.json", () => {
  assertEqual(moveFileName(new Date("2026-12-03T23:00:00Z")), "citchen-umzug-2026-12-03.json");
});

test("#108 moveFile: jeder Ablehnungs-Code und jeder Rückfrage-Bereich hat Text in DE/EN/ES/DA", async () => {
  const { DICT } = await import("../src/i18n.js");
  const sections = [...new Set(ENTRIES.filter((e) => !e.merge).map((e) => e.section))];
  for (const lang of ["de", "en", "es", "da"]) {
    const m = DICT[lang].settings.move;
    for (const code of ["notText", "tooBig", "notJson", "notMove", "newer"]) assert(typeof m.err[code] === "string" && m.err[code], `${lang}: err.${code} fehlt`);
    for (const s of sections) assert(typeof m.section[s] === "string" && m.section[s], `${lang}: section.${s} fehlt`);
  }
});
