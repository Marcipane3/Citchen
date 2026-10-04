// friendInbox.js — I3: Freunde-Link (Supabase). Lokal-first wie listSync.js, nur ein zweiter Kanal:
//  - abholen:  fl_pull → applyFriendItems() → listSync.applyExternal (→ IndexedDB → Drive → Partner)
//              → erst DANACH fl_ack (Löschen auf dem Server). Abbruch dazwischen = harmlos (`seen`).
//  - zeigen:   jede gespeicherte Liste → gebündelt fl_publish(snapshotOf(items)), nur bei Änderung.
// Drive bleibt die Quelle der Wahrheit; Supabase hält nur offene Artikel + noch nicht abgeholte Vorschläge.
// Das Besitzer-Token liegt nur hier (IndexedDB kv "friendInbox"); der Server kennt nur seinen Hash.

import * as db from "./db.js";
import * as listSync from "./listSync.js";
import { rpc, randomToken } from "./supabase.js";
import { applyFriendItems, snapshotOf, inviteUrl, trimSeen } from "../features/shopping/friendMerge.js";

const KEY = "friendInbox";   // { ownerToken, invite, ownerName, seen: [], published: "" }
const PUBLISH_DELAY = 1500;  // ms — bündelt schnelle Taps wie listSync

// Status als Code (UI übersetzt): off | idle | syncing | offline | gone | error
let status = "off";
const statusListeners = new Set();
const importListeners = new Set();
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
export function onImported(fn) { importListeners.add(fn); return () => importListeners.delete(fn); }
export function getStatus() { return status; }
function setStatus(s) { status = s; for (const fn of statusListeners) fn(s); }

export async function getInbox() { return db.kvGet(KEY, null); }
async function patchInbox(p) {
  const cur = await getInbox();
  if (!cur) return null;
  const next = { ...cur, ...p };
  await db.kvSet(KEY, next);
  return next;
}

/** Freundes-Link dieser App-Installation (add.html liegt neben index.html). */
export function linkFor(inbox) {
  return inbox && inbox.invite ? inviteUrl(new URL("../../", import.meta.url).href, inbox.invite) : "";
}

/** Freunde-Link einschalten: Token lokal erzeugen, Liste anlegen, Schaufenster sofort füllen. */
export async function enable(ownerName = "") {
  const ownerToken = randomToken();
  const invite = await rpc("fl_create", { p_owner_token: ownerToken, p_owner_name: ownerName.trim() || null });
  const inbox = { ownerToken, invite, ownerName: ownerName.trim(), seen: [], published: "" };
  await db.kvSet(KEY, inbox);
  setStatus("idle");
  await publishNow().catch(() => {});
  return inbox;
}

/** Neuer Link — der alte funktioniert ab sofort nicht mehr. */
export async function rotate() {
  const inbox = await getInbox();
  if (!inbox) return null;
  const invite = await rpc("fl_rotate", { p_owner_token: inbox.ownerToken });
  return patchInbox({ invite });
}

export async function setOwnerName(name = "") {
  const inbox = await getInbox();
  if (!inbox) return null;
  await rpc("fl_set_name", { p_owner_token: inbox.ownerToken, p_owner_name: name.trim() || null });
  return patchInbox({ ownerName: name.trim() });
}

/** Ausschalten: Server-Daten löschen, dann lokal vergessen. Offline → Fehler, lokal bleibt alles. */
export async function disable() {
  const inbox = await getInbox();
  if (!inbox) return;
  try { await rpc("fl_delete", { p_owner_token: inbox.ownerToken }); }
  catch (e) { if (e.code !== "not_found") throw e; }
  await db.kvDel(KEY);
  setStatus("off");
}

let inflight = null;

/** Vorschläge abholen + Schaufenster aktualisieren. Gibt {added} zurück; wirft nie. */
export function syncFriends() {
  if (inflight) return inflight;
  inflight = doSync().finally(() => { inflight = null; });
  return inflight;
}

async function doSync() {
  const inbox = await getInbox();
  if (!inbox) { setStatus("off"); return { added: 0 }; }
  setStatus("syncing");
  try {
    const pulled = await rpc("fl_pull", { p_owner_token: inbox.ownerToken }) || [];
    let added = 0;
    if (pulled.length) {
      let seen = inbox.seen || [];
      await listSync.applyExternal((items) => {
        const r = applyFriendItems(items, pulled, { seen });
        added = r.added; seen = r.seen;
        return r.added ? r.items : null;
      });
      // Erst lokal gespeichert, dann gemerkt, dann auf dem Server gelöscht.
      await patchInbox({ seen: trimSeen(seen) });
      await rpc("fl_ack", { p_owner_token: inbox.ownerToken, p_ids: pulled.map((x) => x.id) });
    }
    await publishNow();
    setStatus("idle");
    if (added) for (const fn of importListeners) fn(added, pulled);
    return { added };
  } catch (e) {
    console.warn("Freunde-Sync fehlgeschlagen:", e);
    setStatus(e.code === "not_found" ? "gone" : e.code === "offline" ? "offline" : "error");
    return { added: 0, error: e };
  }
}

/** Offene Artikel veröffentlichen — nur wenn sich das Schaufenster wirklich geändert hat. */
async function publishNow(items) {
  const inbox = await getInbox();
  if (!inbox) return;
  const snap = JSON.stringify(snapshotOf(items || await listSync.getList()));
  if (snap === inbox.published) return;
  await rpc("fl_publish", { p_owner_token: inbox.ownerToken, p_items: JSON.parse(snap) });
  await patchInbox({ published: snap });
}

let publishTimer = null;
function schedulePublish(items) {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = setTimeout(() => { publishTimer = null; publishNow(items).catch(() => {}); }, PUBLISH_DELAY);
}

let started = false;
/** Einmal beim App-Start: Liste beobachten, beim Wieder-online abholen, und gleich einmal abholen. */
export function init() {
  if (started) return;
  started = true;
  listSync.onSaved((items) => { getInbox().then((i) => { if (i) schedulePublish(items); }).catch(() => {}); });
  if (typeof window !== "undefined") window.addEventListener("online", () => { syncFriends(); });
  syncFriends();
}
