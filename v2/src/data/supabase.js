// supabase.js — Minimaler Supabase-Client für I3 (Freunde-Link). Kein SDK, nur fetch auf /rpc.
// Abhängigkeitsfrei, damit auch die Freundes-Seite add.html ihn direkt importieren kann.
// Der Publishable Key darf im Code stehen: anon kommt an keine Tabelle heran, nur an die
// token-geprüften fl_*-Funktionen (supabase/migrations/20261004182000_i3_friend_inbox.sql).

const PROD = { url: "https://wbvhgeqdixrcfeszsiob.supabase.co", key: "sb_publishable_uitJyQUSS0HSjEtYFIFSgQ_TS-r3Sbq" };

/**
 * P7 (v2.15b): Dev/Prod trennen. Standard ist das echte Projekt; zum Testen gegen ein Dev-Projekt
 * auf EINEM Gerät in der Browser-Konsole:
 *   localStorage.setItem("koch.supabase", JSON.stringify({ url: "https://<dev>.supabase.co", key: "sb_publishable_…" }))
 * und neu laden (zurück: localStorage.removeItem("koch.supabase")). Siehe supabase/README.md.
 */
function target() {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem("koch.supabase") || "null");
    if (o && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(o.url) && typeof o.key === "string" && o.key.startsWith("sb_publishable_")) return o;
  } catch (e) { /* kein localStorage / kaputter Eintrag → Prod */ }
  return PROD;
}
const TARGET = target();
export const SUPABASE_URL = TARGET.url;
export const SUPABASE_KEY = TARGET.key;

/**
 * Ruft eine Postgres-Funktion auf. Fehler werfen ein Error mit `.code`:
 * Server-Codes aus der Migration (not_found, bad_token, empty, full, rate, capacity, bad_snapshot)
 * oder "offline" / "http_<status>".
 */
export async function rpc(fn, args = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch (e) {
    const err = new Error("offline"); err.code = "offline"; throw err;
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const code = (body && body.message) || `http_${res.status}`;
    const err = new Error(code); err.code = code; err.status = res.status; throw err;
  }
  return body;
}

/** 32 Zufallsbytes als Hex — das Besitzer-Token verlässt das Gerät nur Richtung rpc(). */
export function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
