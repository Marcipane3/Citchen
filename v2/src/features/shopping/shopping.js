// shopping.js — Einkaufslisten-Ansicht. v1-Parität P8.1–P8.6 (Katalog mit Gängen,
// Mengen-Badges, Freitext, abhakbar) + v2: Mengen-Artikel aus Rezepten/Plan
// (aggregiert, Vorrat abgezogen). Persistenz: IndexedDB 'lists' (id "current").

import * as db from "../../data/db.js";
import * as drive from "../../data/drive.js";
import * as listSync from "../../data/listSync.js";
import * as friendInbox from "../../data/friendInbox.js";
import { esc, appHeader, wireHeader } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { touch, newItemId, ensureItemMeta, adoptLegacy } from "./listMerge.js";
import { CATALOG, SECTION_ORDER, sectionIcon } from "../../data/catalog.js";
import {
  itemLabel, formatListAsText, mergeItems, aggregateIngredients, addOne, findSame, badgeOf,
  originOf, snapshotItems, changedIds, undoChange, addSummary,
} from "./logic.js";
import { getRecipe } from "../../store.js";
import { getStaples } from "../../data/settings.js";
import { getInStock } from "../../data/lager.js";
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
let snackTimer = null;    // T9: Snackbar „… · Rückgängig“ unten (UX-11/13)
let myDevice = "";        // T9: Kennung dieses Geräts → „von anderem Gerät“
const expanded = new Set(); // T9: Zeilen, deren Rezept-Herkunft aufgeklappt ist

async function load() {
  myDevice = await listSync.deviceId().catch(() => "");
  const row = await db.get("lists", LIST_ID);
  ITEMS = row && Array.isArray(row.items) ? adoptLegacy(row.items) : []; // T4: Altbestand ohne id → stabile id
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

/* ---------- T9: jede Änderung mit „Rückgängig“ (UX-11, UX-13) ---------- */

/** Kurze Meldung unten über der Tab-Leiste; mit undo → Knopf „Rückgängig“. Verschwindet nach 6 s. */
function showSnack(container, text, undo) {
  const el = container.querySelector("#shop-snack");
  if (!el) return;
  if (snackTimer) clearTimeout(snackTimer);
  el.innerHTML = `<span class="snack-txt">${esc(text)}</span>${undo ? `<button class="sl-undo-btn">${t("shopping.undo")}</button>` : ""}`;
  el.hidden = false;
  const hide = () => { el.hidden = true; el.innerHTML = ""; snackTimer = null; };
  const b = el.querySelector(".sl-undo-btn");
  if (b) b.onclick = () => { if (snackTimer) clearTimeout(snackTimer); hide(); undo(); };
  snackTimer = setTimeout(hide, 6000);
}

/**
 * Eine Listen-Aktion ausführen, speichern, neu zeichnen und „Rückgängig“ anbieten.
 * fn() ändert ITEMS und gibt den Snackbar-Text zurück (oder "" = keine Meldung).
 * Rückgängig nimmt NUR die Zeilen dieser Aktion zurück (ein Abgleich dazwischen bleibt).
 */
function act(container, fn) {
  const before = snapshotItems(ITEMS);
  const text = fn();
  ITEMS = ensureItemMeta(ITEMS);
  const ids = changedIds(before, ITEMS);
  save(); paintList(container); paintCatalog(container);
  if (!ids.length || !text) return;
  showSnack(container, text, () => {
    undoChange(ITEMS, before, ids);
    save(); paintList(container); paintCatalog(container);
    showSnack(container, t("shopping.snack.undone"));
  });
}

/** Snackbar-Text nach einem Hinzufügen: neue Zeile oder „+1 → 3 Stück Ingwer“. */
function addedText(row, wasThere) {
  return wasThere ? t("shopping.snack.bumped", { label: itemLabel(row) }) : t("shopping.snack.added", { name: row.name });
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

/**
 * Artikel hinzufügen (v1-Verhalten: existiert er, +1 und wieder "offen"). Seit v2.15.3 (T5) zählt
 * jede Zeile desselben Artikels — auch „2 Stück Ingwer“ aus einem Rezept → „3 Stück Ingwer“.
 * Gibt die geänderte Zeile zurück (das Kachel-Badge zeigt genau sie, BH-06/UX-11).
 */
export function shopAdd(name, cat, icon) {
  name = (name || "").trim();
  if (!name) return null;
  const row = addOne(ITEMS, { name, cat, icon }, { id: newItemId() });
  save();
  return row;
}

/**
 * Aggregierte Artikel in die Liste mischen (eine Zeile pro Artikel, T5).
 * T9: → { lines: [{label, merged}], undo() } für das Ergebnis-Blatt (UX-14).
 */
export async function addItemsToList(newItems) {
  await load();
  const before = snapshotItems(ITEMS);
  ITEMS = ensureItemMeta(mergeItems(ITEMS, newItems));
  const ids = changedIds(before, ITEMS);
  const lines = addSummary(before, ITEMS, newItems);
  save();
  return {
    lines,
    undo: async () => { await load(); undoChange(ITEMS, before, ids); save(); },
  };
}

/**
 * SI-06: Rezepte → Einkaufsliste, EIN Ablauf für Rezeptansicht und Wochenplan.
 * recipes = deutsche (kanonische) Rezepte; displayById = dieselben in der UI-Sprache (S3).
 * Lager (T6) und Basics werden abgezogen. → { items, skipped }
 */
export async function addRecipesToList(recipes, { displayById = {}, plan = false } = {}) {
  const [staples, inStock] = await Promise.all([getStaples(), getInStock()]);
  const res = aggregateIngredients(recipes, { staples, inStock, displayById });
  if (plan) for (const it of res.items) it.plan = true; // T9: Herkunft „Wochenplan“
  const done = res.items.length ? await addItemsToList(res.items) : { lines: [], undo: async () => {} };
  return { ...res, ...done };
}

/**
 * T9 / UX-14: Ergebnis von „Auf die Liste“ — statt eines nativen confirm() ein Blatt, das zeigt,
 * WAS hinzukam und was nur aufaddiert wurde; „Zur Liste“, „Rückgängig“ oder einfach schließen.
 */
export function showAddedSheet({ lines = [], skipped = 0, undo }, { onToList } = {}) {
  const merged = lines.filter((l) => l.merged).length;
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${t("shopping.addedSheet.title")}</span><button class="icon-btn close" aria-label="${t("common.close")}">✕</button></div>
    <p class="as-sum" role="status">${esc(t("shopping.addedSheet.summary", { n: lines.length, m: merged }))}${skipped ? esc(t("detail.inStockSkipped", { n: skipped })) : ""}</p>
    <ul class="as-list">${lines.map((l) => `<li class="as-line"><span>${esc(l.label)}</span><span class="as-tag ${l.merged ? "merged" : ""}">${esc(t(l.merged ? "shopping.addedSheet.merged" : "shopping.addedSheet.new"))}</span></li>`).join("")}</ul>
    <button class="btn-primary sl-wide as-tolist">${t("shopping.addedSheet.toList")}</button>
    <button class="btn-sec sl-wide as-undo">${t("shopping.undo")}</button>
  `);
  el.querySelector(".as-tolist").onclick = () => { close(); if (onToList) onToList(); };
  el.querySelector(".as-undo").onclick = async (e) => {
    e.currentTarget.disabled = true;
    await undo();
    el.querySelector(".as-sum").textContent = t("shopping.addedSheet.undone");
    el.querySelector(".as-list").remove();
    el.querySelector(".as-undo").remove();
  };
  return { el, close };
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
      <div id="shop-news"></div>
      <div id="shop-list"></div>
      <div id="shop-catalog"></div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>
    <div id="shop-snack" class="snack" role="status" aria-live="polite" hidden></div>
  `;
  wireHeader(container, "shopping");
  const s = container.querySelector("#shop-search");
  s.oninput = () => { search = s.value; paintCatalog(container); };
  const custom = container.querySelector("#shop-custom");
  const addCustom = () => {
    const v = custom.value.trim();
    if (!v) return;
    act(container, () => {
      const was = !!findSame(live(), v);
      const row = shopAdd(v, "Sonstiges", "📝");
      return row ? addedText(row, was) : "";
    });
    custom.value = ""; custom.focus();
  };
  container.querySelector(".add-custom").onclick = addCustom;
  custom.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  // Sync-Ereignisse → neu zeichnen (auch die aus dem gebündelten Hintergrund-Abgleich).
  const offChange = listSync.onChange((items) => { ITEMS = items; paintList(container); paintCatalog(container); });
  const offStatus = listSync.onStatus(() => paintSync(container));
  const offAuth = drive.onAuthChange((signedIn) => { paintSync(container); if (signedIn) listSync.syncListWithDrive(); });
  // I3: Freunde-Vorschläge kommen über listSync.onChange in die Liste; hier nur der Status.
  const offFriendStatus = friendInbox.onStatus(() => paintSync(container));
  // T9 (UX-15): Neues von Freunden/anderem Gerät bleibt sichtbar, bis du die Liste wieder verlässt.
  const offNews = listSync.onNews((news) => paintNews(container, news));

  load().then(() => {
    paintSync(container); paintList(container); paintCatalog(container);
    listSync.getNews().then((news) => paintNews(container, news)).catch(() => {});
    listSync.syncListWithDrive(); // Ergebnis kommt über onChange/onStatus
    friendInbox.syncFriends();
  });

  return () => {
    offChange(); offStatus(); offAuth(); offFriendStatus(); offNews();
    if (snackTimer) { clearTimeout(snackTimer); snackTimer = null; }
    listSync.clearNews().catch(() => {}); // gesehen
  };
}

/* ---------- T9: „Neu seit deinem letzten Besuch“ (UX-15) ---------- */

function whoLabel(who) {
  if (who === "other") return t("shopping.origin.other");
  const n = friendName(who);
  return n === null ? "" : n ? t("shopping.friends.fromName", { name: n }) : t("shopping.friends.fromAnon");
}

function paintNews(container, news = []) {
  const el = container.querySelector("#shop-news");
  if (!el) return;
  if (!news.length) { el.innerHTML = ""; return; }
  const shown = news.slice(-6).reverse();
  const more = news.length - shown.length;
  el.innerHTML = `<div class="sl-news" role="status">
    <div class="sl-news-head"><strong>${t("shopping.news.title")}</strong><button class="icon-btn sl-news-x" aria-label="${t("shopping.news.dismiss")}">✕</button></div>
    <ul>${shown.map((x) => `<li>${esc(x.name)}${whoLabel(x.who) ? ` <span class="sl-from">${esc(whoLabel(x.who))}</span>` : ""}</li>`).join("")}</ul>
    ${more > 0 ? `<div class="sl-news-more">${esc(t("shopping.news.more", { n: more }))}</div>` : ""}
  </div>`;
  el.querySelector(".sl-news-x").onclick = () => { listSync.clearNews().catch(() => {}); };
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
  const warn = st === "error" || st === "auth" || st === "notFound" || st === "rejected";
  el.innerHTML = `
    <div class="sl-sync ${warn ? "warn" : ""}">
      <div class="sl-sync-row">
        <span class="sl-sync-ic" aria-hidden="true">${!signedIn ? "📱" : meta.linked ? "👥" : "☁️"}</span>
        <div class="sl-sync-txt"><strong>${where}</strong><span>${esc(line)}</span></div>
        ${signedIn || inbox ? `<button class="sl-btn sl-refresh" aria-label="${t("shopping.refresh")}" ${st === "syncing" || fst === "syncing" ? "disabled" : ""}>🔄</button>` : ""}
      </div>
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

/**
 * T9 (UX-10): Zweitzeile „woher?“ — „aus Thai-Curry“ / „aus 3 Rezepten“ (antippen = Namen),
 * „Wochenplan“, „von Anna“, „von anderem Gerät“. Von Hand ohne Rezept: keine Zeile.
 */
function originLine(it) {
  const o = originOf(it, { device: myDevice });
  const parts = [];
  if (o.friend !== null) parts.push(o.friend ? t("shopping.friends.fromName", { name: o.friend }) : t("shopping.friends.fromAnon"));
  const names = o.recipes.map((id) => getRecipe(id)).filter(Boolean).map((r) => r.name);
  if (o.recipes.length === 1) parts.push(names[0] ? t("shopping.origin.recipe", { name: names[0] }) : t("shopping.origin.recipes", { n: 1 }));
  else if (o.recipes.length > 1) parts.push(expanded.has(it.id) && names.length ? t("shopping.origin.recipe", { name: names.join(", ") }) : t("shopping.origin.recipes", { n: o.recipes.length }));
  if (o.plan) parts.push(t("shopping.origin.plan"));
  if (o.other && o.friend === null) parts.push(t("shopping.origin.other"));
  if (!parts.length) return "";
  const tappable = o.recipes.length > 1 && names.length;
  return `<span class="sl-origin${tappable ? " tap" : ""}" data-id="${esc(it.id)}">${esc(parts.join(" · "))}</span>`;
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
    el.innerHTML = `<p class="empty">${t("shopping.emptyList")}</p>`;
    return;
  }

  // E2: data-i ist IMMER der Original-Index in ITEMS. Seit v2.11 wird nie mehr gesplict
  // (nur Tombstones), die Indizes bleiben also zwischen Render und Klick stabil (CR-03).
  // Erledigte rutschen innerhalb der Anzeige nach unten.
  const rowHTML = (it, i) => {
    const hasAmount = it.amount !== null && it.amount !== undefined;
    return `<div class="sl-item ${it.done ? "done" : ""}">
      <span class="sl-ic">${esc(it.icon || "🛒")}</span>
      <span class="sl-name" data-i="${i}">${esc(itemLabel(it))}${originLine(it)}</span>
      <div class="sl-ctrl">
        ${hasAmount ? "" : `<button class="sl-dec" data-i="${i}" aria-label="${t("shopping.less")}">−</button><span class="sl-qty">${esc(String(it.qty))}</span><button class="sl-inc" data-i="${i}" aria-label="${t("shopping.more")}">+</button>`}
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
    indexed.sort((a, b) => (a.it.done - b.it.done) || String(a.it.name ?? "").localeCompare(String(b.it.name ?? "")));
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
    n.onclick = (e) => {
      // T9: „aus 3 Rezepten“ antippen klappt die Rezeptnamen auf (statt abzuhaken).
      const o = e.target.closest(".sl-origin.tap");
      if (o) { const id = o.dataset.id; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); paintList(container); return; }
      const it = at(n); if (it) { it.done = !it.done; touch(it); save(); paintList(container); }
    };
  });
  el.querySelectorAll(".sl-dec").forEach((b) => {
    b.onclick = () => {
      const it = at(b);
      if (!it) return;
      if (it.qty <= 1) { act(container, () => { remove(it); return t("shopping.snack.removed", { name: it.name }); }); return; }
      it.qty--;
      touch(it);
      save(); paintList(container); paintCatalog(container);
    };
  });
  el.querySelectorAll(".sl-inc").forEach((b) => {
    b.onclick = () => { const it = at(b); if (it) { it.qty++; touch(it); save(); paintList(container); paintCatalog(container); } };
  });
  el.querySelectorAll(".sl-rm").forEach((b) => {
    b.onclick = () => { const it = at(b); if (it) act(container, () => { remove(it); return t("shopping.snack.removed", { name: it.name }); }); };
  });
  el.querySelectorAll(".sl-sortbtn").forEach((b) => {
    b.onclick = () => { sortMode = b.dataset.sort; db.kvSet(SORT_KEY, sortMode).catch(() => {}); paintList(container); };
  });
  const clr = el.querySelector(".sl-clear");
  if (clr) clr.onclick = () => act(container, () => {
    const now = new Date().toISOString();
    const done = live().filter((x) => x.done);
    done.forEach((x) => remove(x, now));
    return tn("shopping.snack.clearedDone", done.length);
  });
  const clrAll = el.querySelector(".sl-clear-all");
  // E1 + T9: „Alles löschen“ → Snackbar mit Rückgängig (wie jede andere Aktion).
  if (clrAll) clrAll.onclick = () => act(container, () => {
    const now = new Date().toISOString();
    live().forEach((x) => remove(x, now));
    return t("shopping.cleared");
  });
  const shareBtn = el.querySelector(".sl-share");
  if (shareBtn) shareBtn.onclick = () => shareList(container);
}

function catItemHTML(name, cat, icon) {
  const inList = findSame(live(), name); // dieselbe Regel wie shopAdd (T5) → Badge = die Zeile, die ein Tipp ändert
  return `<button class="cat-item" data-name="${esc(name)}" data-cat="${esc(cat)}" data-icon="${esc(icon || "🛒")}">
    <span class="ci-ic">${esc(icon || "🛒")}</span><span class="ci-nm">${esc(name)}</span>
    ${inList ? `<span class="ci-badge">${esc(badgeOf(inList))}</span>` : ""}
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
      // T9 (UX-12): die Liste über dem Katalog wächst beim Hinzufügen — danach so scrollen, dass die
      // angetippte Kachel an derselben Stelle unter dem Finger bleibt (kein Fehl-Tipp auf den Nachbarn).
      const top = b.getBoundingClientRect().top;
      let row = null;
      act(container, () => {
        const was = !!findSame(live(), b.dataset.name);
        row = shopAdd(b.dataset.name, b.dataset.cat, b.dataset.icon);
        return row ? addedText(row, was) : "";
      });
      const tile = container.querySelector(`#shop-catalog .cat-item[data-name="${CSS.escape(b.dataset.name)}"]`) || b;
      const shift = tile.getBoundingClientRect().top - top;
      if (shift) window.scrollBy(0, shift);
      if (!row) return;
      tile.classList.add("just-added");
      setTimeout(() => tile.classList.remove("just-added"), 220);
    };
  });
}
