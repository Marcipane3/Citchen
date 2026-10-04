// friendMerge.js — PURE Logik für I3 (Freunde-Link). Kein DOM, keine DB, kein Netz; unit-getestet
// in tests/test-friends.js. Wird von data/friendInbox.js (App) und add.html (Freundes-Seite) genutzt.
//
// Modell: Supabase ist nur Postfach + Schaufenster. Freunde legen Vorschläge ab ({id,name,author}),
// die App holt sie ab, mischt sie hier in die lokale Liste (→ Drive → Partner) und quittiert danach.
// Umgekehrt veröffentlicht die App die offenen Artikel als kompaktes Schaufenster ([{n,i,c,q}]).

import { touch } from "./listMerge.js";
import { itemKey, itemLabel } from "./logic.js";
import { ingMatchCat, SECTION_ORDER } from "../../data/catalog.js";

const FRIEND = "friend";

/** author-Feld eines Freundes-Artikels: "friend:Anna" bzw. "friend" ohne Namen. */
export function friendAuthor(name) {
  const n = (name || "").trim().slice(0, 40);
  return n ? `${FRIEND}:${n}` : FRIEND;
}

/** Name des Freundes aus dem author-Feld; null = kein Freundes-Artikel, "" = Freund ohne Namen. */
export function friendName(author) {
  if (author === FRIEND) return "";
  return typeof author === "string" && author.startsWith(FRIEND + ":") ? author.slice(FRIEND.length + 1) : null;
}

/**
 * Freundes-Vorschläge in die Liste mischen. Gibt eine NEUE Liste zurück (Eingabe bleibt unverändert).
 * - Steht der Artikel schon offen drauf → Menge +1 (wie shopAdd), sonst neuer Artikel mit Gang/Symbol.
 * - `seen` = bereits übernommene Vorschlags-ids: macht ein erneutes Abholen vor dem Quittieren
 *   (Netzabbruch zwischen Speichern und fl_ack) harmlos — nichts wird doppelt gezählt.
 */
export function applyFriendItems(items = [], friends = [], { now = new Date().toISOString(), seen = [] } = {}) {
  const out = items.map((x) => ({ ...x }));
  const seenSet = new Set(seen);
  let added = 0;
  for (const f of friends) {
    if (!f || !f.id || seenSet.has(f.id)) continue;
    seenSet.add(f.id);
    const name = String(f.name || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = itemKey(name, null);
    const same = out.find((x) => !x.deleted && (itemKey(x.nameDe || x.name, x.unit) === key || itemKey(x.name, x.unit) === key));
    if (same) {
      same.qty = (same.qty || 1) + 1;
      same.done = false;
      touch(same, now);
    } else {
      const m = ingMatchCat(name);
      out.push({
        id: "fr-" + f.id,
        name, cat: m ? m.cat : "Sonstiges", icon: m ? m.icon : "📝",
        qty: 1, done: false, amount: null, unit: null,
        updated: now, author: friendAuthor(f.author), deleted: false,
      });
    }
    added++;
  }
  return { items: out, added, seen: [...seenSet] };
}

/** Schaufenster für Freunde: nur offene Artikel, nach Supermarkt-Gang sortiert, kompakt. */
export function snapshotOf(items = []) {
  const rank = (c) => { const i = SECTION_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  return items
    .filter((x) => !x.deleted && !x.done)
    .sort((a, b) => (rank(a.cat) - rank(b.cat)) || String(a.name).localeCompare(String(b.name)))
    .slice(0, 300)
    .map((x) => ({
      n: itemLabel(x).slice(0, 120),
      i: x.icon || "🛒",
      c: x.cat || "Sonstiges",
      q: (x.amount === null || x.amount === undefined) ? (x.qty || 1) : 1,
    }));
}

/** Freundes-Seite: steht dieser Artikel schon (offen) auf der Liste oder im Postfach? */
export function isListed(name, snapshot = [], pending = []) {
  const low = (name || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!low) return false;
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  // Schaufenster-Namen können Mengen tragen („500ml Milch“) → auf Wortende vergleichen.
  return snapshot.some((x) => { const n = norm(x.n); return n === low || n.endsWith(" " + low); })
    || pending.some((p) => norm(p.name) === low);
}

/** Einladungslink. Token im #-Teil: der geht nie an einen Server (auch nicht in GitHub-Pages-Logs). */
export function inviteUrl(appBase, invite) {
  return new URL("add.html", appBase).href + "#k=" + encodeURIComponent(invite);
}

/** Token aus dem #-Teil der Freundes-Seite lesen. */
export function inviteFromHash(hash = "") {
  const m = /[#&]k=([0-9a-f]{16,64})/i.exec(hash);
  return m ? m[1] : null;
}

/** Gesehene ids begrenzen (die Liste soll nicht endlos wachsen). */
export function trimSeen(seen = [], max = 300) {
  return seen.length > max ? seen.slice(seen.length - max) : seen;
}
