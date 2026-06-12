// lager.js — 📦 Lager (#/lager): Section A Dauer-Vorrat (Chips an/aus),
// Section B Kühlschrank/Frischware (Liste + KI-Foto-Scan). Persistenz via data/lager.js.
// Vorhandene Artikel werden von der Einkaufsliste automatisch abgezogen.

import * as gate from "../../ai/gate.js";
import { complete, visionMessage, blobToBase64, VISION_MODEL, AiError } from "../../ai/client.js";
import { extractJson } from "../../ai/parse.js";
import { compressImage, esc } from "../../ui/helpers.js";
import { openMenu } from "../menu.js";
import { BUILD } from "../../version.js";
import { t } from "../../i18n.js";
import * as store from "../../data/lager.js";
import { CATALOG, ingMatchCat } from "../shopping/catalog.js";
import {
  togglePantry, addPantryItem, removePantryItem, groupPantry,
  addFridgeItem, removeFridgeItem, mergeFridge, PANTRY_CATEGORIES,
} from "./logic.js";

let pantry = [];
let fridge = [];
let openCatSection = null; // D1: aufgeklappter Katalog-Gang im Kühlschrank

/** Icon für einen Frischware-Namen: gespeichert → Katalog-Treffer → Default. */
function fridgeIcon(f) {
  if (f.icon) return f.icon;
  const m = ingMatchCat(f.name);
  return (m && m.icon) || "🧊";
}

export function renderLager(container) {
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l"><span style="font-size:24px">📦</span><div><h1>${t("lager.title")}</h1><div class="sub">${t("lager.subtitle")}</div></div></div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
    </header>
    <main class="app-main">
      <div class="card lager-sec">
        <h3>${t("lager.stockHeading")} <span class="sub" id="stock-count" style="font-weight:400"></span></h3>
        <p class="set-note">${t("lager.stockSub")}</p>
        <div id="pantry-groups"></div>
        <div class="fridge-add" style="margin-top:14px">
          <input class="fa-name" id="pantry-new" placeholder="${t("lager.addCustom")}" />
          <select class="f fa-qty" id="pantry-cat" style="flex:1">
            ${PANTRY_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}
          </select>
          <button class="btn-primary" id="pantry-add">+</button>
        </div>
      </div>

      <div class="card lager-sec">
        <h3>${t("lager.fridgeHeading")}</h3>
        <p class="set-note">${t("lager.fridgeSub")}</p>
        <div id="fridge-list"></div>
        <div class="fridge-add">
          <input class="fa-name" id="fridge-name" placeholder="${t("lager.fridgeItemPlaceholder")}" />
          <input class="fa-qty" id="fridge-qty" placeholder="${t("lager.fridgeQtyPlaceholder")}" />
          <button class="btn-primary" id="fridge-add">+</button>
        </div>
        <button class="photo-add" id="fridge-scan" style="margin-top:14px">${t("lager.scan")}</button>
        <p class="set-note">${t("lager.scanHint")}</p>
        <div id="scan-area"></div>

        <h3 style="margin-top:18px">${t("lager.catalogHeading")}</h3>
        <p class="set-note">${t("lager.catalogHint")}</p>
        <div id="fridge-catalog"></div>
      </div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("lager");

  Promise.all([store.getPantry(), store.getFridge()]).then(([p, f]) => {
    pantry = p; fridge = f;
    paintPantry(container);
    paintFridge(container);
    paintCatalog(container);
  });

  // Vorrat: eigenen Artikel hinzufügen
  container.querySelector("#pantry-add").onclick = () => {
    const name = container.querySelector("#pantry-new").value.trim();
    const cat = container.querySelector("#pantry-cat").value;
    if (!name) return;
    pantry = addPantryItem(pantry, name, cat);
    store.setPantry(pantry);
    container.querySelector("#pantry-new").value = "";
    paintPantry(container);
  };

  // Kühlschrank: manuell hinzufügen
  const addFridge = () => {
    const name = container.querySelector("#fridge-name").value.trim();
    const qty = container.querySelector("#fridge-qty").value.trim();
    if (!name) return;
    const m = ingMatchCat(name); // D1: passendes Symbol aus dem Katalog raten
    fridge = addFridgeItem(fridge, name, qty, (m && m.icon) || "");
    store.setFridge(fridge);
    container.querySelector("#fridge-name").value = "";
    container.querySelector("#fridge-qty").value = "";
    paintFridge(container);
    paintCatalog(container);
  };
  container.querySelector("#fridge-add").onclick = addFridge;
  container.querySelector("#fridge-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addFridge(); } });

  // KI-Scan
  container.querySelector("#fridge-scan").onclick = () => startScan(container);
}

function paintPantry(container) {
  const el = container.querySelector("#pantry-groups");
  if (!el) return;
  const onCount = pantry.filter((p) => p.on).length;
  const cnt = container.querySelector("#stock-count");
  if (cnt) cnt.textContent = t("lager.onStockCount", { n: onCount });

  el.innerHTML = groupPantry(pantry).map((g) => `
    <div class="lager-cat">${esc(g.cat)}</div>
    <div class="stock-grid">
      ${g.items.map((it) => `<button class="stock-chip ${it.on ? "on" : ""}" data-toggle="${esc(it.name)}">
        ${esc(it.name)}${it.custom ? `<span class="x" data-rm="${esc(it.name)}">✕</span>` : ""}</button>`).join("")}
    </div>`).join("");

  el.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = (e) => {
      if (e.target.closest("[data-rm]")) {
        pantry = removePantryItem(pantry, e.target.closest("[data-rm]").dataset.rm);
      } else {
        pantry = togglePantry(pantry, b.dataset.toggle);
      }
      store.setPantry(pantry);
      paintPantry(container);
    };
  });
}

function paintFridge(container) {
  const el = container.querySelector("#fridge-list");
  if (!el) return;
  if (!fridge.length) { el.innerHTML = `<p class="empty" style="margin:14px 0">${t("lager.fridgeEmpty")}</p>`; return; }
  el.innerHTML = fridge.map((f, i) => `
    <div class="fridge-item">
      <span class="fi-ic">${fridgeIcon(f)}</span>
      <span class="fi-name">${esc(f.name)}</span>
      <span class="fi-qty">${esc(f.menge || "")}</span>
      <button class="fi-used" data-used="${i}">${t("lager.usedUp")}</button>
      <button class="fi-del" data-del="${i}">✕</button>
    </div>`).join("");
  const remove = (i) => { fridge = fridge.filter((_, j) => j !== i); store.setFridge(fridge); paintFridge(container); paintCatalog(container); };
  el.querySelectorAll("[data-used]").forEach((b) => { b.onclick = () => remove(+b.dataset.used); });
  el.querySelectorAll("[data-del]").forEach((b) => { b.onclick = () => remove(+b.dataset.del); });
}

/* ---------- D1: Icon-Katalog (wie Einkaufsliste) → Frischware hinzufügen ---------- */
function inFridge(name) {
  const n = name.toLowerCase();
  return fridge.some((f) => f.name.toLowerCase() === n);
}

function paintCatalog(container) {
  const el = container.querySelector("#fridge-catalog");
  if (!el) return;
  el.innerHTML = CATALOG.map((sec) => {
    const open = openCatSection === sec.name;
    return `<div class="cat-sec">
      <button class="cat-head" data-sec="${esc(sec.name)}">${sec.icon} ${esc(sec.name)} <span class="chev">${open ? "▾" : "▸"}</span></button>
      ${open ? `<div class="cat-grid">${sec.items.map((it) => {
        const has = inFridge(it.name);
        return `<button class="cat-item ${has ? "in" : ""}" data-name="${esc(it.name)}" data-icon="${esc(it.icon || sec.icon)}">
          <span class="ci-ic">${it.icon || sec.icon}</span><span class="ci-nm">${esc(it.name)}</span>${has ? `<span class="ci-badge">✓</span>` : ""}</button>`;
      }).join("")}</div>` : ""}
    </div>`;
  }).join("");

  el.querySelectorAll(".cat-head").forEach((b) => {
    b.onclick = () => { const s = b.dataset.sec; openCatSection = (openCatSection === s) ? null : s; paintCatalog(container); };
  });
  el.querySelectorAll(".cat-item").forEach((b) => {
    b.onclick = () => {
      fridge = addFridgeItem(fridge, b.dataset.name, "", b.dataset.icon);
      store.setFridge(fridge);
      b.classList.add("just-added");
      setTimeout(() => b.classList.remove("just-added"), 220);
      paintFridge(container);
      paintCatalog(container);
    };
  });
}

/* ---------- KI-Kühlschrank-Scan ---------- */

function startScan(container) {
  if (!gate.isPremium()) {
    container.querySelector("#scan-area").innerHTML = `<p class="set-note">${t("lager.scanLocked")} <a href="#/settings">${t("nav.settings")}</a></p>`;
    return;
  }
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.style.cssText = "position:fixed;left:-9999px;opacity:0";
  document.body.appendChild(inp);
  inp.onchange = () => {
    const files = Array.from(inp.files || []).slice(0, 3);
    inp.remove();
    if (!files.length) return;
    const area = container.querySelector("#scan-area");
    area.innerHTML = `<div class="cap-thumbs">${files.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join("")}</div>
      <button class="btn-primary" id="scan-go" style="width:100%;margin-top:10px">${t("lager.scanAnalyze")}</button>
      <p class="set-note" id="scan-status"></p>`;
    area.querySelector("#scan-go").onclick = (e) => analyzeScan(container, files, e.currentTarget);
  };
  inp.click();
}

const FRIDGE_PROMPT = `Analysiere diese Kühlschrank-/Vorrats-Fotos. Liste alle klar sichtbaren Lebensmittel auf.
Gib GENAU EIN JSON-Objekt zurück (ohne Markdown, ohne Text drumherum): {"items":[{"name":string,"menge":string}]}.
"menge" darf eine Schätzung sein ("1 Stück", "ca. 200g", "halb voll"). Antworte auf Deutsch. Keine Duplikate.`;

async function analyzeScan(container, files, btn) {
  const status = container.querySelector("#scan-status");
  btn.disabled = true;
  status.textContent = t("capture.analyzing");
  try {
    const b64s = [];
    for (const f of files) b64s.push(await blobToBase64(await compressImage(f, 1568, 0.8)));
    const { text } = await complete({ messages: [visionMessage(b64s, FRIDGE_PROMPT)], model: VISION_MODEL, maxTokens: 1000 });
    const json = extractJson(text);
    const items = (json && Array.isArray(json.items) ? json.items : [])
      .map((it) => ({ name: String(it.name || "").trim(), menge: String(it.menge || "").trim() }))
      .filter((it) => it.name);
    if (!items.length) { status.textContent = t("lager.scanNone"); btn.disabled = false; return; }
    showStaging(container, items);
  } catch (e) {
    status.innerHTML = (e instanceof AiError && e.kind === "auth")
      ? `⚠️ ${esc(e.message)} <a href="#/settings">${t("nav.settings")}</a>`
      : "⚠️ " + esc(e.message);
    btn.disabled = false;
  }
}

/** Erkannte Artikel editierbar zeigen, dann in die Kühlschrankliste mergen. */
function showStaging(container, items) {
  const area = container.querySelector("#scan-area");
  area.innerHTML = `<p class="set-note">${t("lager.scanStaging")}</p>
    <div id="stage-list">${items.map((it, i) => `
      <div class="stage-item">
        <input data-sn="${i}" value="${esc(it.name)}" />
        <input data-sq="${i}" value="${esc(it.menge)}" style="max-width:110px" />
        <button class="fi-del" data-sx="${i}">✕</button>
      </div>`).join("")}</div>
    <button class="btn-primary" id="stage-add" style="width:100%;margin-top:10px">${t("lager.scanAdd")}</button>`;

  const list = area.querySelector("#stage-list");
  list.querySelectorAll("[data-sx]").forEach((b) => {
    b.onclick = () => { b.closest(".stage-item").remove(); };
  });
  area.querySelector("#stage-add").onclick = () => {
    const picked = [];
    list.querySelectorAll(".stage-item").forEach((row) => {
      const name = row.querySelector("[data-sn]").value.trim();
      const menge = row.querySelector("[data-sq]").value.trim();
      if (name) picked.push({ name, menge });
    });
    fridge = mergeFridge(fridge, picked);
    store.setFridge(fridge);
    area.innerHTML = "";
    paintFridge(container);
  };
}
