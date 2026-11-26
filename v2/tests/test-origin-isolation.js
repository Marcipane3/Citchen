// Tests: Same-Origin-Isolation (C-5). Ab citchen.de teilen v1, v2 und v3 einen Origin: IndexedDB,
// localStorage, Cache Storage und Service-Worker-Scopes dürfen sich nicht überschneiden.
// SW-Scopes: v1 registriert "sw.js" (Scope /Citchen/), v2 registriert "v2/sw.js" (Scope /Citchen/v2/).
// Präfixe: v1 "kochbuch-", v2 "koch-v2", reserviert für v3 "citchen-v3".
import { test, assert } from "./runner.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, "..");
const root = join(v2, "..");
const read = (p) => readFileSync(p, "utf8");

const v1Sw = read(join(root, "sw.js"));
const v2Sw = read(join(v2, "sw.js"));
const v1Html = read(join(root, "index.html"));
const dbSrc = read(join(v2, "src/data/db.js"));

// Führt den activate-Handler eines SW-Quelltexts gegen einen Fake-Cache-Speicher aus.
async function activate(src, existing) {
  const deleted = [];
  let handler;
  const self = { addEventListener: (t, fn) => { if (t === "activate") handler = fn; }, clients: { claim: async () => {} }, registration: {} };
  const caches = { keys: async () => existing, delete: async (k) => { deleted.push(k); return true; } };
  new Function("self", "caches", "location", `${src}\n`)(self, caches, { origin: "https://x.test" });
  let p;
  handler({ waitUntil: (x) => { p = x; } });
  await p;
  return deleted;
}

test("storage names: v2 IndexedDB name, localStorage keys and cache prefix are disjoint from v1", () => {
  const dbName = dbSrc.match(/const DB_NAME = "([^"]+)"/)[1];
  assert(!/indexedDB\.open/.test(v1Html), "v1 nutzt kein IndexedDB");
  const v1Keys = [...new Set([...v1Html.matchAll(/["'`](kb_[a-zA-Z_]*)/g)].map((m) => m[1]))];
  assert(v1Keys.length > 0, "v1-Schlüssel gefunden");
  assert(!v1Keys.includes(dbName), "DB-Name kollidiert mit v1-Schlüssel");
  const v1Cache = v1Sw.match(/const CACHE = "([^"]+)"/)[1];
  const v2Cache = v2Sw.match(/const CACHE = "([^"]+)"/)[1];
  assert(v1Cache.startsWith("kochbuch-"), "v1-Cache beginnt mit kochbuch-");
  assert(v2Cache.startsWith("koch-v2"), "v2-Cache beginnt mit koch-v2");
  assert(!v2Cache.startsWith("kochbuch-") && !v1Cache.startsWith("koch-v2"), "Präfixe überlappen");
  assert(!dbName.startsWith("kochbuch-") && dbName !== "citchen-v3", "DB-Name kollidiert mit Präfixen");
});

test("legacy sw.js activate keeps caches it does not own", async () => {
  const deleted = await activate(v1Sw, ["kochbuch-v9", "kochbuch-v8", "koch-v2.19-1", "citchen-v3.1"]);
  assert(deleted.length === 1 && deleted[0] === "kochbuch-v8", `gelöscht: ${JSON.stringify(deleted)}`);
});

test("v2 sw.js activate only deletes its own prefix", async () => {
  const cur = v2Sw.match(/const CACHE = "([^"]+)"/)[1];
  const deleted = await activate(v2Sw, [cur, "koch-v2.18-1", "kochbuch-v9", "citchen-v3.1"]);
  assert(deleted.length === 1 && deleted[0] === "koch-v2.18-1", `gelöscht: ${JSON.stringify(deleted)}`);
});

test("manifest scopes do not overlap", () => {
  const m2 = JSON.parse(read(join(v2, "manifest.webmanifest")));
  const m1 = JSON.parse(read(join(root, "manifest.json")));
  assert(m2.scope === "./" && m2.id === "./", "v2 Scope/ID relativ zu /v2/");
  assert(m1.scope === undefined && m1.id === undefined, "v1 deklariert keinen eigenen Scope/ID");
  assert(m1.start_url !== m2.start_url, "start_url unterscheidet sich");
  assert(/register\("sw\.js"\)/.test(v1Html), "v1 registriert sw.js (Scope /Citchen/)");
  assert(/register\(new URL\("\.\.\/sw\.js"/.test(read(join(v2, "src/app.js"))), "v2 registriert v2/sw.js (Scope /Citchen/v2/)");
});
