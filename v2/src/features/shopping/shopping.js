// shopping.js — Einkaufslisten-Ansicht. v1-Parität P8.1–P8.6 (Katalog mit Gängen,
// Mengen-Badges, Freitext, abhakbar) + v2: Mengen-Artikel aus Rezepten/Plan
// (aggregiert, Vorrat abgezogen). Persistenz: IndexedDB 'lists' (id "current").

import * as db from "../../data/db.js";
import * as drive from "../../data/drive.js";
import * as listSync from "../../data/listSync.js";
import * as friendInbox from "../../data/friendInbox.js";
import { esc, appHeader, wireHeader } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { touch, newItemId, ensureItemMeta } from "./listMerge.js";
import { CATALOG, SECTION_ORDER, sectionIcon } from "../../data/catalog.js";
import { itemKey, itemLabel, formatListAsText } from "./logic.js";
import { friendName } from "./friendMerge.js";
import { BUILD } from "../../version.js";
import { t, tn, getLang } from "../../i18n.js";

const LIST_ID = "current";
const SORT_KEY = "shopSort"; // E2: "aisle" | "alpha"
// [{id, name, nameDe?, amount, unit, cat, icon, qty, done, updated, author, deleted}]
// ITEMS enthält auch Tombstones (deleted:true) — nur so erreicht eine Löschung den Partner (CR-01).
// Angezeigt wird immer live(): ITEMS ohne Tombstones.
let ITEMS = [];
let search = "";
let openSection = null;
let sortMode = "aisle";   // E2: Sortierung der Liste
let undoSnapshot = null;  // E1: ids der zuletzt geleerten Artikel, für „Rückgängig"
let undoTimer = null;
let friendNote = "";      // I3: „👋 2 Artikel von Freunden hinzugefügt“ (kurz sichtbar)
let friendNoteTimer = null;

async function load() {
  const row = await db.get("lists", LIST_ID);
  ITEMS = row && Array.isArray(row.items) ? row.items : [];
  sortMode = await db.kvGet(SORT_KEY, "aisle");
}
const live = () => ITEMS.filter((x) => !x.deleted);

function save() {
  ITEMS = ensureItemMeta(ITEMS);
  listSync.saveList(ITEMS).catch(() => {}); // IndexedDB sofort + gebündelter Drive-Abgleich
}

/** Artikel als gelöscht markieren (Tombstone) statt aus ITEMS zu entfernen. */
function remove(it, now) {
  it.deleted = true;
  touch(it, now);
}

async function shareList(container) {
  if (!live().length) return;
  const text = `${t("shopping.shareTitle")}\n\n${formatListAsText(live())}`;
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    const btn = container.querySelector(".sl-share");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = t("shopping.copied");
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    }
  } catch (_) { /* clipboard unavailable — nothing to do */ }
}

/** Artikel hinzufügen (v1-Verhalten: existiert er, +1 und wieder "offen"). */
export function shopAdd(name, cat, icon) {
  name = (name || "").trim();
  if (!name) return;
  const key = itemKey(name, null);
  const same = (x) => itemKey(x.nameDe || x.name, x.unit) === key || itemKey(x.name, x.unit) === key;
  // Lebenden Artikel bevorzugen; sonst einen gelöschten wiederbeleben (gleiche id → Partner sieht es).
  const it = ITEMS.find((x) => !x.deleted && same(x)) || ITEMS.find(same);
  if (it && it.deleted) Object.assign(it, { deleted: false, done: false, qty: 1, amount: null, unit: null });
  else if (it) { it.qty++; it.done = false; }
  if (it) touch(it);
  else ITEMS.push({
    id: newItemId(),
    name, cat: cat || "Sonstiges", icon: icon || "🛒",
    qty: 1, done: false, amount: null, unit: null,
    updated: new Date().toISOString(),
    author: "local",
    deleted: false,
  });
  save();
}

/** Für detail.js / planner.js: aggregierte Artikel in die Liste mischen. */
export async function addItemsToList(newItems) {
  await load();
  const { mergeItems } = await import("./logic.js");
  ITEMS = mergeItems(ITEMS, newItems);
  save();
}

export function renderShopping(container) {
  container.innerHTML = `
    ${appHeader({
      icon: "🛒",
      title: t("shopping.title"),
      subId: "shop-sub",
      source: "shopping",
      extra: `
      <div class="search-wrap">
        <span>🔍</span>
        <input id="shop-search" placeholder="${t("shopping.searchPlaceholder")}" value="${esc(search)}" />
      </div>
      <div class="shop-add">
        <input id="shop-custom" placeholder="${t("shopping.customPlaceholder")}" />
        <button class="add-custom">${t("shopping.addBtn")}</button>
      </div>`,
    })}
    <main class="app-main">
      <div id="shop-sync"></div>
      <div id="shop-list"></div>
      <div id="shop-catalog"></div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>
  `;
  wireHeader(container, "shopping");
  const s = container.querySelector("#shop-search");
  s.oninput = () => { search = s.value; paintCatalog(container); };
  const custom = container.querySelector("#shop-custom");
  const addCustom = () => {
    const v = custom.value.trim();
    if (v) { shopAdd(v, "Sonstiges", "📝"); custom.value = ""; paintList(container); paintCatalog(container); custom.focus(); }
  };
  container.querySelector(".add-custom").onclick = addCustom;
  custom.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  // Sync-Ereignisse → neu zeichnen (auch die aus dem gebündelten Hintergrund-Abgleich).
  const offChange = listSync.onChange((items) => { ITEMS = items; paintList(container); paintCatalog(container); });
  const offStatus = listSync.onStatus(() => paintSync(container));
  const offAuth = drive.onAuthChange((signedIn) => { paintSync(container); if (signedIn) listSync.syncListWithDrive(); });
  // I3: Freunde-Vorschläge kommen über listSync.onChange in die Liste; hier nur Status + Hinweis.
  const offFriendStatus = friendInbox.onStatus(() => paintSync(container));
  const offImported = friendInbox.onImported((n) => {
    friendNote = tn("shopping.friends.imported", n);
    if (friendNoteTimer) clearTimeout(friendNoteTimer);
    friendNoteTimer = setTimeout(() => { friendNote = ""; friendNoteTimer = null; paintSync(container); }, 8000);
    paintSync(container);
  });

  load().then(() => {
    paintSync(container); paintList(container); paintCatalog(container);
    listSync.syncListWithDrive(); // Ergebnis kommt über onChange/onStatus
    friendInbox.syncFriends();
  });

  return () => { offChange(); offStatus(); offAuth(); offFriendStatus(); offImported(); };
}

/* ---------- Sync- & Partner-Karte ---------- */

function timeLabel(iso) {
  if (!iso) return "";
  const loc = { de: "de-DE", en: "en-GB", es: "es-ES", da: "da-DK" }[getLang()] || undefined;
  try { return new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
}

async function paintSync(container) {
  const el = container.querySelector("#shop-sync");
  if (!el) return;
  const signedIn = drive.isSignedIn();
  const meta = await listSync.getMeta().catch(() => ({}));
  const inbox = await friendInbox.getInbox().catch(() => null);
  const fst = friendInbox.getStatus();
  const fwarn = fst === "gone" || fst === "error";
  const st = signedIn ? listSync.getStatus() : "local";
  const where = !signedIn ? t("shopping.syncLocalTitle") : meta.linked ? t("shopping.syncSharedTitle") : t("shopping.syncDriveTitle");
  const line = st === "synced" ? t("shopping.syncDone", { time: timeLabel(meta.lastSync) }) : t("shopping.syncState." + st);
  const warn = st === "error" || st === "auth" || st === "notFound";
  el.innerHTML = `
    <div class="sl-sync ${warn ? "warn" : ""}">
      <div class="sl-sync-row">
        <span class="sl-sync-ic" aria-hidden="true">${!signedIn ? "📱" : meta.linked ? "👥" : "☁️"}</span>
        <div class="sl-sync-txt"><strong>${where}</strong><span>${esc(line)}</span></div>
        ${signedIn || inbox ? `<button class="sl-btn sl-refresh" aria-label="${t("shopping.refresh")}" ${st === "syncing" || fst === "syncing" ? "disabled" : ""}>🔄</button>` : ""}
      </div>
      ${friendNote ? `<div class="sl-friend-note" role="status">${esc(friendNote)}</div>` : ""}
      ${inbox && fst !== "idle" && fst !== "off" ? `<div class="sl-friend-st ${fwarn ? "warn" : ""}">${esc(t("shopping.friends.state." + fst))}</div>` : ""}
      <div class="sl-sync-btns">
        ${signedIn
          ? `<button class="sl-btn sl-partner">${t("shopping.partnerBtn")}</button>`
          : `<button class="sl-btn sl-login">${t("shopping.connectGoogle")}</button>`}
        <button class="sl-btn sl-friends ${inbox ? "on" : ""}">${inbox ? t("shopping.friends.btnOn") : t("shopping.friends.btn")}</button>
      </div>
    </div>`;
  const r = el.querySelector(".sl-refresh");
  if (r) r.onclick = () => { if (signedIn) listSync.syncListWithDrive(); friendInbox.syncFriends(); };
  el.querySelector(".sl-friends").onclick = () => openFriendsSheet(container);
  const p = el.querySelector(".sl-partner");
  if (p) p.onclick = () => openPartnerSheet(container);
  const l = el.querySelector(".sl-login");
  if (l) l.onclick = () => drive.login().catch(() => alert(t("shopping.loginFailed")));
}

async function openPartnerSheet(container) {
  const meta = await listSync.getMeta();
  const ownId = meta.ownFileId || (!meta.linked ? meta.fileId : null);
  const driveLink = ownId ? `https://drive.google.com/file/d/${encodeURIComponent(ownId)}/view` : "";
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${t("shopping.partnerTitle")}</span><button class="icon-btn close" aria-label="${t("common.close")}">✕</button></div>
    ${meta.linked ? `<div class="sl-linked">👥 ${t("shopping.linkedNote")}</div>` : ""}
    <h3>${t("shopping.stepShareTitle")}</h3>
    <p class="sl-help">${t("shopping.stepShareBody")}</p>
    ${driveLink
      ? `<a class="btn-sec sl-wide" href="${driveLink}" target="_blank" rel="noopener">${t("shopping.openInDrive")}</a>`
      : `<p class="sl-help"><em>${t("shopping.noFileYet")}</em></p>`}
    <h3>${t("shopping.stepLinkTitle")}</h3>
    <p class="sl-help">${t("shopping.stepLinkBody")}</p>
    <button class="btn-primary sl-wide sl-pick">${t("shopping.linkPartner")}</button>
    <p class="sl-help sl-pick-msg" role="status"></p>
    ${meta.linked ? `<button class="btn-sec sl-wide sl-unlink">${t("shopping.unlinkPartner")}</button>` : ""}
  `);
  const msg = el.querySelector(".sl-pick-msg");
  el.querySelector(".sl-pick").onclick = () => {
    msg.textContent = t("shopping.pickerOpening");
    drive.openPickerForFile("application/json", async (fileId, fileName) => {
      // Dateinamen prüfen, bevor wir der fileId vertrauen (keine falsche Datei überschreiben).
      if (!/einkaufsliste/i.test(fileName)) { msg.textContent = t("shopping.pickWrongFile", { name: fileName }); return; }
      msg.textContent = t("shopping.syncState.syncing");
      const res = await listSync.linkToFile(fileId);
      if (res.error) { msg.textContent = t("shopping.linkFailed"); return; }
      close(); paintSync(container);
    }).then(() => { msg.textContent = ""; })
      .catch(() => { msg.textContent = t("shopping.pickerFailed"); });
  };
  const u = el.querySelector(".sl-unlink");
  if (u) u.onclick = async () => {
    if (!confirm(t("shopping.unlinkConfirm"))) return;
    await listSync.unlink(); close(); paintSync(container);
  };
}

/* ---------- I3: Freunde-Link ---------- */

async function openFriendsSheet(container) {
  const inbox = await friendInbox.getInbox().catch(() => null);
  const link = friendInbox.linkFor(inbox);
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${t("shopping.friends.title")}</span><button class="icon-btn close" aria-label="${t("common.close")}">✕</button></div>
    <p class="sl-help">${t("shopping.friends.intro")}</p>
    <label class="sl-field"><span>${t("shopping.friends.nameLabel")}</span>
      <input class="sl-fr-name" maxlength="40" autocomplete="given-name" placeholder="${esc(t("shopping.friends.namePh"))}" value="${esc(inbox ? inbox.ownerName || "" : "")}" /></label>
    ${inbox ? `
      <button class="btn-sec sl-wide sl-fr-savename">${t("shopping.friends.saveName")}</button>
      <label class="sl-field"><span>${t("shopping.friends.linkLabel")}</span>
        <input class="sl-fr-link" readonly value="${esc(link)}" /></label>
      <button class="btn-primary sl-wide sl-fr-share">${t("shopping.friends.share")}</button>
      <button class="btn-sec sl-wide sl-fr-rotate">${t("shopping.friends.rotate")}</button>
      <button class="btn-sec sl-wide sl-fr-off">${t("shopping.friends.disable")}</button>`
    : `<button class="btn-primary sl-wide sl-fr-on">${t("shopping.friends.enable")}</button>`}
    <p class="sl-help sl-fr-msg" role="status"></p>
    <p class="sl-help sl-fine">${t("shopping.friends.privacy")}</p>
  `);
  const msg = el.querySelector(".sl-fr-msg");
  const nameIn = el.querySelector(".sl-fr-name");
  const busy = (b, fn) => async () => {
    b.disabled = true; msg.textContent = "";
    try { await fn(); } catch (e) { msg.textContent = t("shopping.friends.failed"); }
    finally { b.disabled = false; }
  };
  const reopen = () => { close(); paintSync(container); openFriendsSheet(container); };

  const on = el.querySelector(".sl-fr-on");
  if (on) on.onclick = busy(on, async () => { await friendInbox.enable(nameIn.value); reopen(); });

  const saveName = el.querySelector(".sl-fr-savename");
  if (saveName) saveName.onclick = busy(saveName, async () => {
    await friendInbox.setOwnerName(nameIn.value);
    msg.textContent = t("shopping.friends.nameSaved");
  });

  const share = el.querySelector(".sl-fr-share");
  if (share) share.onclick = async () => {
    const text = t("shopping.friends.shareText");
    if (navigator.share) {
      try { await navigator.share({ text, url: link }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(`${text}\n${link}`); msg.textContent = t("shopping.friends.copied"); }
    catch (_) { el.querySelector(".sl-fr-link").select(); }
  };

  const rot = el.querySelector(".sl-fr-rotate");
  if (rot) rot.onclick = busy(rot, async () => {
    if (!confirm(t("shopping.friends.rotateConfirm"))) return;
    await friendInbox.rotate(); reopen();
  });

  const off = el.querySelector(".sl-fr-off");
  if (off) off.onclick = busy(off, async () => {
    if (!confirm(t("shopping.friends.disableConfirm"))) return;
    await friendInbox.disable(); close(); paintSync(container);
  });
}

/* ---------- Liste ---------- */

/** I3: kleines „von Anna“ hinter Artikeln, die ein Freund über den Link hinzugefügt hat. */
function fromTag(it) {
  const n = friendName(it.author);
  if (n === null) return "";
  return ` <span class="sl-from">${esc(n ? t("shopping.friends.fromName", { name: n }) : t("shopping.friends.fromAnon"))}</span>`;
}

function paintList(container) {
  const el = container.querySelector("#shop-list");
  if (!el) return;
  const visible = live();
  const doneCount = visible.filter((x) => x.done).length;
  const openCount = visible.length - doneCount;
  const sub = container.querySelector("#shop-sub");
  if (sub) sub.textContent = visible.length ? (doneCount ? t("shopping.openDone", { n: openCount, d: doneCount }) : t("shopping.open", { n: openCount })) : t("shopping.empty");

  if (!visible.length) {
    const undoBar = undoSnapshot
      ? `<div class="sl-undo">${t("shopping.cleared")} <button class="sl-undo-btn">${t("shopping.undo")}</button></div>`
      : "";
    el.innerHTML = undoBar + `<p class="empty">${t("shopping.emptyList")}</p>`;
    const ub = el.querySelector(".sl-undo-btn");
    if (ub) ub.onclick = () => {
      if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
      const ids = new Set(undoSnapshot); undoSnapshot = null;
      const now = new Date().toISOString();
      ITEMS.forEach((x) => { if (ids.has(x.id)) { x.deleted = false; touch(x, now); } });
      save(); paintList(container); paintCatalog(container);
    };
    return;
  }

  // E2: data-i ist IMMER der Original-Index in ITEMS. Seit v2.11 wird nie mehr gesplict
  // (nur Tombstones), die Indizes bleiben also zwischen Render und Klick stabil (CR-03).
  // Erledigte rutschen innerhalb der Anzeige nach unten.
  const rowHTML = (it, i) => {
    const hasAmount = it.amount !== null && it.amount !== undefined;
    return `<div class="sl-item ${it.done ? "done" : ""}">
      <span class="sl-ic">${it.icon || "🛒"}</span>
      <span class="sl-name" data-i="${i}">${esc(itemLabel(it))}${fromTag(it)}</span>
      <div class="sl-ctrl">
        ${hasAmount ? "" : `<button class="sl-dec" data-i="${i}" aria-label="${t("shopping.less")}">−</button><span class="sl-qty">${it.qty}</span><button class="sl-inc" data-i="${i}" aria-label="${t("shopping.more")}">+</button>`}
        <button class="sl-rm" data-i="${i}" aria-label="${t("common.remove")}">✕</button>
      </div>
    </div>`;
  };

  const sortBar = `<div class="sl-sort">
    <button class="sl-sortbtn ${sortMode === "aisle" ? "on" : ""}" data-sort="aisle">${t("shopping.sortAisle")}</button>
    <button class="sl-sortbtn ${sortMode === "alpha" ? "on" : ""}" data-sort="alpha">${t("shopping.sortAlpha")}</button>
  </div>`;
  let html = `<div class="sl-top"><div class="sl-title">${t("shopping.myList")}</div><div class="sl-actions">${doneCount ? `<button class="sl-clear">${t("shopping.clearDone")}</button>` : ""}<button class="sl-clear-all">${t("shopping.clearAll")}</button><button class="sl-share">${t("shopping.share")}</button></div></div>${sortBar}`;

  const indexed = ITEMS.map((it, i) => ({ it, i })).filter(({ it }) => !it.deleted);
  if (sortMode === "alpha") {
    indexed.sort((a, b) => (a.it.done - b.it.done) || a.it.name.localeCompare(b.it.name));
    html += indexed.map(({ it, i }) => rowHTML(it, i)).join("");
  } else {
    const cats = [...new Set(visible.map((x) => x.cat))].sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const cat of cats) {
      html += `<div class="sl-cat">${sectionIcon(cat)} ${esc(cat)}</div>`;
      html += indexed.filter(({ it }) => it.cat === cat)
        .sort((a, b) => a.it.done - b.it.done)
        .map(({ it, i }) => rowHTML(it, i)).join("");
    }
  }
  el.innerHTML = html;

  // Jede Änderung → touch(), sonst übernimmt der Partner-Sync sie nicht.
  const at = (b) => ITEMS[+b.dataset.i];
  el.querySelectorAll(".sl-name").forEach((n) => {
    n.onclick = () => { const it = at(n); if (it) { it.done = !it.done; touch(it); save(); paintList(container); } };
  });
  el.querySelectorAll(".sl-dec").forEach((b) => {
    b.onclick = () => {
      const it = at(b);
      if (!it) return;
      it.qty--;
      if (it.qty <= 0) remove(it); else touch(it);
      save(); paintList(container); paintCatalog(container);
    };
  });
  el.querySelectorAll(".sl-inc").forEach((b) => {
    b.onclick = () => { const it = at(b); if (it) { it.qty++; touch(it); save(); paintList(container); paintCatalog(container); } };
  });
  el.querySelectorAll(".sl-rm").forEach((b) => {
    b.onclick = () => { const it = at(b); if (it) { remove(it); save(); paintList(container); paintCatalog(container); } };
  });
  el.querySelectorAll(".sl-sortbtn").forEach((b) => {
    b.onclick = () => { sortMode = b.dataset.sort; db.kvSet(SORT_KEY, sortMode).catch(() => {}); paintList(container); };
  });
  const clr = el.querySelector(".sl-clear");
  if (clr) clr.onclick = () => {
    const now = new Date().toISOString();
    live().filter((x) => x.done).forEach((x) => remove(x, now));
    save(); paintList(container); paintCatalog(container);
  };
  const clrAll = el.querySelector(".sl-clear-all");
  if (clrAll) clrAll.onclick = () => {
    const visibleNow = live();
    if (!visibleNow.length) return;
    undoSnapshot = visibleNow.map((x) => x.id);   // E1: für „Rückgängig" merken
    const now = new Date().toISOString();
    visibleNow.forEach((x) => remove(x, now));
    save();
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undoSnapshot = null; undoTimer = null; paintList(container); }, 6000);
    paintList(container); paintCatalog(container);
  };
  const shareBtn = el.querySelector(".sl-share");
  if (shareBtn) shareBtn.onclick = () => shareList(container);
}

function catItemHTML(name, cat, icon) {
  const low = name.toLowerCase();
  const inList = live().find((x) => (x.nameDe || x.name).toLowerCase() === low);
  return `<button class="cat-item" data-name="${esc(name)}" data-cat="${esc(cat)}" data-icon="${esc(icon || "🛒")}">
    <span class="ci-ic">${icon || "🛒"}</span><span class="ci-nm">${esc(name)}</span>
    ${inList ? `<span class="ci-badge">${inList.qty}</span>` : ""}
  </button>`;
}

function paintCatalog(container) {
  const el = container.querySelector("#shop-catalog");
  if (!el) return;
  const q = search.trim().toLowerCase();
  if (q) {
    const matches = [];
    CATALOG.forEach((sec) => sec.items.forEach((it) => { if (it.name.toLowerCase().includes(q)) matches.push({ it, sec }); }));
    el.innerHTML = `<h3>${t("shopping.results")}</h3>` + (matches.length
      ? `<div class="cat-grid">${matches.map((m) => catItemHTML(m.it.name, m.sec.name, m.it.icon || m.sec.icon)).join("")}</div>`
      : `<p class="empty" style="margin-top:18px">${t("shopping.nothingFound")}</p>`);
  } else {
    el.innerHTML = `<h3>${t("shopping.addHeading")}</h3>` + CATALOG.map((sec) => {
      const open = openSection === sec.name;
      return `<div class="cat-sec">
        <button class="cat-head" data-sec="${esc(sec.name)}">${sec.icon} ${esc(sec.name)} <span class="chev">${open ? "▾" : "▸"}</span></button>
        ${open ? `<div class="cat-grid">${sec.items.map((it) => catItemHTML(it.name, sec.name, it.icon || sec.icon)).join("")}</div>` : ""}
      </div>`;
    }).join("");
  }
  // Sektion auf-/zuklappen
  el.querySelectorAll(".cat-head").forEach((b) => {
    b.onclick = () => { const s = b.dataset.sec; openSection = (openSection === s) ? null : s; paintCatalog(container); };
  });
  // Artikel +1 (Badge in place, Sektion bleibt offen — v1-Verhalten)
  el.querySelectorAll(".cat-item").forEach((b) => {
    b.onclick = () => {
      shopAdd(b.dataset.name, b.dataset.cat, b.dataset.icon);
      const low = b.dataset.name.toLowerCase();
      const it = live().find((x) => (x.nameDe || x.name).toLowerCase() === low);
      if (!it) return;
      let badge = b.querySelector(".ci-badge");
      if (!badge) { badge = document.createElement("span"); badge.className = "ci-badge"; b.appendChild(badge); }
      badge.textContent = it.qty;
      b.classList.add("just-added");
      setTimeout(() => b.classList.remove("just-added"), 220);
      paintList(container);
    };
  });
}
