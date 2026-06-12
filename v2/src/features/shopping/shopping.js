// shopping.js — Einkaufslisten-Ansicht. v1-Parität P8.1–P8.6 (Katalog mit Gängen,
// Mengen-Badges, Freitext, abhakbar) + v2: Mengen-Artikel aus Rezepten/Plan
// (aggregiert, Vorrat abgezogen). Persistenz: IndexedDB 'lists' (id "current").

import * as db from "../../data/db.js";
import { esc } from "../../ui/helpers.js";
import { openMenu } from "../menu.js";
import { CATALOG, SECTION_ORDER, sectionIcon } from "./catalog.js";
import { itemKey, itemLabel } from "./logic.js";
import { BUILD } from "../../version.js";
import { t } from "../../i18n.js";

const LIST_ID = "current";
let ITEMS = [];           // [{name, amount, unit, cat, icon, qty, done}]
let search = "";
let openSection = null;

async function load() {
  const row = await db.get("lists", LIST_ID);
  ITEMS = row && Array.isArray(row.items) ? row.items : [];
}
function save() {
  db.put("lists", { id: LIST_ID, items: ITEMS, updated: new Date().toISOString() }).catch(() => {});
}

/** Artikel hinzufügen (v1-Verhalten: existiert er, +1 und wieder "offen"). */
export function shopAdd(name, cat, icon) {
  name = (name || "").trim();
  if (!name) return;
  const key = itemKey(name, null);
  const it = ITEMS.find((x) => itemKey(x.name, x.unit) === key);
  if (it) { it.qty++; it.done = false; }
  else ITEMS.push({ name, cat: cat || "Sonstiges", icon: icon || "🛒", qty: 1, done: false, amount: null, unit: null });
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
    <header class="app-header">
      <div class="brand">
        <div class="brand-l">
          <span style="font-size:24px">🛒</span>
          <div><h1>${t("shopping.title")}</h1><div class="sub" id="shop-sub"></div></div>
        </div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
      <div class="search-wrap">
        <span>🔍</span>
        <input id="shop-search" placeholder="${t("shopping.searchPlaceholder")}" value="${esc(search)}" />
      </div>
      <div class="shop-add">
        <input id="shop-custom" placeholder="${t("shopping.customPlaceholder")}" />
        <button class="add-custom">${t("shopping.addBtn")}</button>
      </div>
    </header>
    <main class="app-main">
      <div id="shop-list"></div>
      <div id="shop-catalog"></div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>
  `;
  container.querySelector("#menuBtn").onclick = () => openMenu("shopping");
  const s = container.querySelector("#shop-search");
  s.oninput = () => { search = s.value; paintCatalog(container); };
  const custom = container.querySelector("#shop-custom");
  const addCustom = () => {
    const v = custom.value.trim();
    if (v) { shopAdd(v, "Sonstiges", "📝"); custom.value = ""; paintList(container); paintCatalog(container); custom.focus(); }
  };
  container.querySelector(".add-custom").onclick = addCustom;
  custom.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });

  load().then(() => { paintList(container); paintCatalog(container); });
}

function paintList(container) {
  const el = container.querySelector("#shop-list");
  if (!el) return;
  const doneCount = ITEMS.filter((x) => x.done).length;
  const openCount = ITEMS.length - doneCount;
  const sub = container.querySelector("#shop-sub");
  if (sub) sub.textContent = ITEMS.length ? (doneCount ? t("shopping.openDone", { n: openCount, d: doneCount }) : t("shopping.open", { n: openCount })) : t("shopping.empty");

  if (!ITEMS.length) {
    el.innerHTML = `<p class="empty">${t("shopping.emptyList")}</p>`;
    return;
  }

  const cats = [...new Set(ITEMS.map((x) => x.cat))].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  let html = `<div class="sl-top"><div class="sl-title">${t("shopping.myList")}</div>${doneCount ? `<button class="sl-clear">${t("shopping.clearDone")}</button>` : ""}</div>`;
  for (const cat of cats) {
    html += `<div class="sl-cat">${sectionIcon(cat)} ${esc(cat)}</div>`;
    ITEMS.forEach((it, i) => {
      if (it.cat !== cat) return;
      const hasAmount = it.amount !== null && it.amount !== undefined;
      html += `<div class="sl-item ${it.done ? "done" : ""}">
        <span class="sl-ic">${it.icon || "🛒"}</span>
        <span class="sl-name" data-i="${i}">${esc(itemLabel(it))}</span>
        <div class="sl-ctrl">
          ${hasAmount ? "" : `<button class="sl-dec" data-i="${i}">−</button><span class="sl-qty">${it.qty}</span><button class="sl-inc" data-i="${i}">+</button>`}
          <button class="sl-rm" data-i="${i}">✕</button>
        </div>
      </div>`;
    });
  }
  el.innerHTML = html;

  el.querySelectorAll(".sl-name").forEach((n) => {
    n.onclick = () => { const it = ITEMS[+n.dataset.i]; if (it) { it.done = !it.done; save(); paintList(container); } };
  });
  el.querySelectorAll(".sl-dec").forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.i, it = ITEMS[i];
      if (!it) return;
      it.qty--;
      if (it.qty <= 0) ITEMS.splice(i, 1);
      save(); paintList(container); paintCatalog(container);
    };
  });
  el.querySelectorAll(".sl-inc").forEach((b) => {
    b.onclick = () => { const it = ITEMS[+b.dataset.i]; if (it) { it.qty++; save(); paintList(container); paintCatalog(container); } };
  });
  el.querySelectorAll(".sl-rm").forEach((b) => {
    b.onclick = () => { ITEMS.splice(+b.dataset.i, 1); save(); paintList(container); paintCatalog(container); };
  });
  const clr = el.querySelector(".sl-clear");
  if (clr) clr.onclick = () => { ITEMS = ITEMS.filter((x) => !x.done); save(); paintList(container); paintCatalog(container); };
}

function catItemHTML(name, cat, icon) {
  const inList = ITEMS.find((x) => x.name.toLowerCase() === name.toLowerCase());
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
      const it = ITEMS.find((x) => x.name.toLowerCase() === b.dataset.name.toLowerCase());
      let badge = b.querySelector(".ci-badge");
      if (!badge) { badge = document.createElement("span"); badge.className = "ci-badge"; b.appendChild(badge); }
      badge.textContent = it.qty;
      b.classList.add("just-added");
      setTimeout(() => b.classList.remove("just-added"), 220);
      paintList(container);
    };
  });
}
