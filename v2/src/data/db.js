// db.js — IndexedDB-Wrapper. Einzige Stelle, die IndexedDB anfasst.
// Stores:
//   recipes  (keyPath: id)        — die Rezeptsammlung (Spiegel von rezepte.json)
//   plans    (keyPath: id)        — Wochenpläne (Phase 2)
//   lists    (keyPath: id)        — Einkaufslisten (Phase 2)
//   kv       (keyPath: key)       — Meta/Settings/Fortschritt/Matches (kleine Werte)

const DB_NAME = "koch-v2";
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("recipes")) db.createObjectStore("recipes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("plans")) db.createObjectStore("plans", { keyPath: "id" });
      if (!db.objectStoreNames.contains("lists")) db.createObjectStore("lists", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  const db = await openDB();
  return tx(db, store, "readwrite", (s) => s.put(value));
}

export async function del(store, key) {
  const db = await openDB();
  return tx(db, store, "readwrite", (s) => s.delete(key));
}

export async function clear(store) {
  const db = await openDB();
  return tx(db, store, "readwrite", (s) => s.clear());
}

/**
 * Alle Werte in einer Transaktion ersetzen (clear + put) — für Rezept-Sync.
 * Alles oder nichts (DG-03): ein Wert ohne gültigen Schlüssel ließ früher `put` werfen, OHNE die
 * Transaktion abzubrechen — das clear() und die Werte davor wurden trotzdem gespeichert (Kochbuch
 * halbiert). Jetzt wird vorher geprüft und bei jedem Fehler die ganze Transaktion verworfen.
 */
export async function replaceAll(store, values) {
  const bad = values.findIndex((v) => !v || typeof v !== "object" || typeof v.id !== "string" || !v.id);
  if (bad >= 0) throw new Error(`replaceAll(${store}): Eintrag ${bad} ohne gültige id — nichts ersetzt`);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const s = t.objectStore(store);
    try {
      s.clear();
      for (const v of values) s.put(v);
    } catch (e) {
      t.abort();
      reject(e);
      return;
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/* ---------- kv-Bequemlichkeit ---------- */

export async function kvGet(key, fallback = undefined) {
  const row = await get("kv", key);
  return row === undefined ? fallback : row.value;
}

export async function kvSet(key, value) {
  return put("kv", { key, value });
}

/**
 * Atomar ändern: liest und schreibt in EINER readwrite-Transaktion, damit sich zwei gleichzeitige
 * Änderungen (z. B. Sync-Ende und „Partner verbinden“) nicht gegenseitig überschreiben.
 * fn(alterWert) → neuer Wert. Gibt den neuen Wert zurück.
 */
export async function kvUpdate(key, fn, fallback = undefined) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", "readwrite");
    const s = t.objectStore("kv");
    let next;
    const req = s.get(key);
    req.onsuccess = () => {
      next = fn(req.result === undefined ? fallback : req.result.value);
      s.put({ key, value: next });
    };
    t.oncomplete = () => resolve(next);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function kvDel(key) {
  return del("kv", key);
}
