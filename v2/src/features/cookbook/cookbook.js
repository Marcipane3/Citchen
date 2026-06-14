// cookbook.js — Hauptansicht: Suche, Mehrfach-Filter (F2), Rezeptkarten.
// v1-Parität: P3.1–P3.6 (siehe V1_FEATURE_INVENTORY.md).
// F2: Chips sind mehrfach wählbar (ODER innerhalb einer Facette), Facetten werden
// per UND/ODER-Schalter verknüpft; Küche/Saison im ausklappbaren „Mehr Filter“-Panel.

import { state } from "../../store.js";
import * as sync from "../../data/sync.js";
import * as drive from "../../data/drive.js";
import { updateRecipe } from "../../store.js";
import { esc, starsMini, metaBadges, hydrateHeroes, appHeader, wireHeader } from "../../ui/helpers.js";
import { availableChips, chipLabel, filterRecipes, distinctValues, activeFilterCount } from "./filter.js";
import { openDetail } from "./detail.js";
import { openForm } from "./form.js";
import { BUILD } from "../../version.js";
import { t, tn, tCat } from "../../i18n.js";

// Filterzustand überlebt Re-Renders (Modul-Scope)
let query = "";
let activeChips = [];     // Kategorien + Spezial-Chips (mehrfach)
let activeCuisines = [];
let activeSeasons = [];
let filterMode = "and";   // "and" | "or" — wie die Facetten verknüpft werden
let moreOpen = false;

function filterOpts() {
  return { query, chips: activeChips, cuisines: activeCuisines, seasons: activeSeasons, mode: filterMode };
}

function toggleIn(arr, val) {
  const i = arr.indexOf(val);
  if (i >= 0) arr.splice(i, 1); else arr.push(val);
}

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
  const filtered = filterRecipes(state.recipes, filterOpts());
  el.innerHTML = filtered.length === 0
    ? `<p class="empty">${activeChips.includes("__fav") ? t("cookbook.emptyFav") : t("cookbook.emptyNone")}</p>`
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

/** HTML der Filterleiste (Chips + Mehr-Panel + Zusammenfassung). */
function controlsHTML() {
  const chips = availableChips(state.recipes);
  const cuisines = distinctValues(state.recipes, "cuisine");
  const seasons = distinctValues(state.recipes, "season");
  const nActive = activeFilterCount(filterOpts());
  const matchN = filterRecipes(state.recipes, filterOpts()).length;

  const chipRow = chips.map((c) => {
    const active = c === "Alle" ? activeChips.length === 0 : activeChips.includes(c);
    return `<button class="chip ${active ? "active" : ""}" data-chip="${esc(c)}">${esc(chipLabel(c))}</button>`;
  }).join("");

  const extraN = activeCuisines.length + activeSeasons.length;
  const hasExtra = cuisines.length || seasons.length;
  const moreBtn = hasExtra
    ? `<button class="chip more-toggle ${moreOpen || extraN ? "active" : ""}" id="moreToggle">${t("cookbook.moreFilters")} ${moreOpen ? "▴" : "▾"}${extraN ? ` · ${extraN}` : ""}</button>`
    : "";

  const groupHTML = (label, items, attr, selected) => `
    <div class="filter-group">
      <span class="fg-label">${label}</span>
      <div class="fg-chips">
        ${items.map((v) => `<button class="chip mini ${selected.includes(v) ? "active" : ""}" data-${attr}="${esc(v)}">${esc(v)}</button>`).join("")}
      </div>
    </div>`;

  const morePanel = moreOpen ? `
    <div class="more-panel">
      ${cuisines.length ? groupHTML(t("cookbook.cuisineLabel"), cuisines, "cuisine", activeCuisines) : ""}
      ${seasons.length ? groupHTML(t("cookbook.seasonLabel"), seasons, "season", activeSeasons) : ""}
    </div>` : "";

  const seg = nActive >= 2 ? `
    <div class="seg" id="modeSeg" title="${esc(t("cookbook.filterModeHint"))}">
      <button class="seg-btn ${filterMode === "and" ? "on" : ""}" data-mode="and">${t("cookbook.filterAnd")}</button>
      <button class="seg-btn ${filterMode === "or" ? "on" : ""}" data-mode="or">${t("cookbook.filterOr")}</button>
    </div>` : "";

  const summary = nActive > 0 ? `
    <div class="filter-summary">
      ${seg}
      <span class="match-count">${tn("cookbook.matchCount", matchN)}</span>
      <button class="link-btn" id="clearFilters">✕ ${t("cookbook.clearFilters")}</button>
    </div>` : "";

  return `<div class="chips" id="chips">${chipRow}${moreBtn}</div>${morePanel}${summary}`;
}

/** Filterleiste neu zeichnen + Handler binden + Karten neu malen. */
function refreshControls(container) {
  const host = container.querySelector("#filterControls");
  if (!host) return;
  host.innerHTML = controlsHTML();
  wireControls(container);
  paintCards(container);
}

function wireControls(container) {
  const host = container.querySelector("#filterControls");

  host.querySelectorAll("[data-chip]").forEach((b) => {
    b.onclick = () => {
      const c = b.dataset.chip;
      if (c === "Alle") activeChips = []; else toggleIn(activeChips, c);
      refreshControls(container);
    };
  });
  const moreBtn = host.querySelector("#moreToggle");
  if (moreBtn) moreBtn.onclick = () => { moreOpen = !moreOpen; refreshControls(container); };

  host.querySelectorAll("[data-cuisine]").forEach((b) => {
    b.onclick = () => { toggleIn(activeCuisines, b.dataset.cuisine); refreshControls(container); };
  });
  host.querySelectorAll("[data-season]").forEach((b) => {
    b.onclick = () => { toggleIn(activeSeasons, b.dataset.season); refreshControls(container); };
  });
  host.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => { filterMode = b.dataset.mode; refreshControls(container); };
  });
  const clearBtn = host.querySelector("#clearFilters");
  if (clearBtn) clearBtn.onclick = () => {
    activeChips = []; activeCuisines = []; activeSeasons = []; filterMode = "and";
    refreshControls(container);
  };
}

export function renderCookbook(container) {
  container.innerHTML = `
    ${appHeader({
      icon: "🍳",
      title: t("cookbook.title"),
      sub: tn("cookbook.count", state.recipes.length),
      source: "cookbook",
      extra: `
      <div class="search-wrap">
        <span>🔍</span>
        <input id="search" placeholder="${t("cookbook.searchPlaceholder")}" value="${esc(query)}" />
      </div>
      <div id="filterControls">${controlsHTML()}</div>`,
    })}
    <main class="app-main">
      <div id="cards"></div>
    </main>
    <div class="sync-line">${esc(sync.getStatus())}</div>
    <div class="build-line">Build ${esc(BUILD)}</div>
    <button class="fab" id="addBtn" title="Neues Rezept">+</button>
  `;

  const search = container.querySelector("#search");
  search.oninput = () => { query = search.value; refreshControls(container); };
  wireHeader(container, "cookbook");
  container.querySelector("#addBtn").title = t("cookbook.newRecipe");
  container.querySelector("#addBtn").onclick = () => openForm();

  wireControls(container);
  paintCards(container);
}
