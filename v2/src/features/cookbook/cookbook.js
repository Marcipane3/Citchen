// cookbook.js — Hauptansicht: Suche, Filter-Chips, Küche/Saison-Filter, Rezeptkarten.
// v1-Parität: P3.1–P3.6 (siehe V1_FEATURE_INVENTORY.md).

import { state } from "../../store.js";
import * as sync from "../../data/sync.js";
import * as drive from "../../data/drive.js";
import { updateRecipe } from "../../store.js";
import { esc, starsMini, metaBadges, hydrateHeroes } from "../../ui/helpers.js";
import { availableChips, chipLabel, filterRecipes, distinctValues } from "./filter.js";
import { openDetail } from "./detail.js";
import { openForm } from "./form.js";
import { openMenu } from "../menu.js";
import { BUILD } from "../../version.js";
import { t, tn, tCat } from "../../i18n.js";

// Filterzustand überlebt Re-Renders (Modul-Scope)
let query = "", activeChip = "Alle", fCuisine = "", fSeason = "";

function cardHTML(r) {
  const hasImg = (r.photos && r.photos.length) || r.image;
  return `
    <div class="rcard" data-id="${esc(r.id)}">
      <button class="card-heart" data-fav="${esc(r.id)}">${r.favorite ? "♥" : "♡"}</button>
      ${hasImg ? `<div class="card-thumb" data-hero="${esc(r.id)}"></div>` : ""}
      <div class="cat-label">${esc(tCat(r.category))}</div>
      <div class="rname">${esc(r.name)}</div>
      <div class="rmeta">${r.time ? `⏱ ${esc(r.time)}` : ""} ${r.lastCooked ? `· ${esc(r.lastCooked)}` : ""} ${starsMini(r.rating)}</div>
      ${metaBadges(r, true) ? `<div class="card-badges">${metaBadges(r, true)}</div>` : ""}
    </div>`;
}

function paintCards(container) {
  const el = container.querySelector("#cards");
  if (!el) return;
  const filtered = filterRecipes(state.recipes, { query, chip: activeChip, cuisine: fCuisine || null, season: fSeason || null });
  el.innerHTML = filtered.length === 0
    ? `<p class="empty">${activeChip === "__fav" ? t("cookbook.emptyFav") : t("cookbook.emptyNone")}</p>`
    : filtered.map(cardHTML).join("");

  el.querySelectorAll(".rcard").forEach((c) => { c.onclick = () => openDetail(c.dataset.id); });
  el.querySelectorAll(".card-heart").forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const r = state.recipes.find((x) => x.id === b.dataset.fav);
      if (!r) return;
      const newVal = !r.favorite;
      b.textContent = newVal ? "♥" : "♡";
      try { await updateRecipe(r.id, (x) => { x.favorite = newVal; }); } catch (err) { alert(err.message); }
    };
  });
  hydrateHeroes(el, state.recipes);
}

export function renderCookbook(container) {
  const chips = availableChips(state.recipes);
  const cuisines = distinctValues(state.recipes, "cuisine");
  const seasons = distinctValues(state.recipes, "season");

  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l">
          <span style="font-size:24px">🍳</span>
          <div>
            <h1>${t("cookbook.title")}</h1>
            <div class="sub">${tn("cookbook.count", state.recipes.length)}</div>
          </div>
        </div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
      <div class="search-wrap">
        <span>🔍</span>
        <input id="search" placeholder="${t("cookbook.searchPlaceholder")}" value="${esc(query)}" />
      </div>
      <div class="chips" id="chips">
        ${chips.map((c) => `<button class="chip ${activeChip === c ? "active" : ""}" data-chip="${esc(c)}">${esc(chipLabel(c))}</button>`).join("")}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <select class="f" id="fCuisine" style="flex:1;padding:8px 10px">
          <option value="">${t("cookbook.cuisineAll")}</option>
          ${cuisines.map((c) => `<option ${fCuisine === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <select class="f" id="fSeason" style="flex:1;padding:8px 10px">
          <option value="">${t("cookbook.seasonAll")}</option>
          ${seasons.map((s) => `<option ${fSeason === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </div>
    </header>
    <main class="app-main">
      <div id="cards"></div>
    </main>
    <div class="sync-line">${esc(sync.getStatus())}</div>
    <div class="build-line">Build ${esc(BUILD)}</div>
    <button class="fab" id="addBtn" title="Neues Rezept">+</button>
  `;

  const search = container.querySelector("#search");
  search.oninput = () => { query = search.value; paintCards(container); };
  container.querySelectorAll(".chip").forEach((b) => {
    b.onclick = () => {
      activeChip = b.dataset.chip;
      container.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === b));
      paintCards(container);
    };
  });
  container.querySelector("#fCuisine").onchange = (e) => { fCuisine = e.target.value; paintCards(container); };
  container.querySelector("#fSeason").onchange = (e) => { fSeason = e.target.value; paintCards(container); };
  container.querySelector("#menuBtn").onclick = () => openMenu("cookbook");
  container.querySelector("#addBtn").title = t("cookbook.newRecipe");
  container.querySelector("#addBtn").onclick = () => openForm();

  paintCards(container);
}
