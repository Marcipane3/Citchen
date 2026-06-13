// planner.js — Wochenplan-Ansicht (#/planner). Deterministischer Generator,
// Tag sperren / neu würfeln / manuell wählen, Reste-Tage, "Einkaufsliste erstellen".
// Persistenz: 'plans' (id "current") + kv 'plannerRecent' (Rotation über Wochen).

import { state, getRecipe, getRecipeDe } from "../../store.js";
import * as db from "../../data/db.js";
import { getTotalMinutes } from "../../data/derive.js";
import { esc } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { openDetail } from "../cookbook/detail.js";
import { openMenu } from "../menu.js";
import { navigate } from "../../router.js";
import { generatePlan, planRecipeIds, mondayOf, DAYS, MEAL_CATEGORIES } from "./logic.js";
import { aggregateIngredients } from "../shopping/logic.js";
import { addItemsToList } from "../shopping/shopping.js";
import { BUILD } from "../../version.js";
import { t } from "../../i18n.js";

const PLAN_ID = "current";
const RECENT_KEY = "plannerRecent";

let PLAN = null;
let leftovers = false;

async function loadPlan() {
  PLAN = await db.get("plans", PLAN_ID) || null;
  leftovers = await db.kvGet("plannerLeftovers", false);
}
function savePlan() {
  if (PLAN) db.put("plans", { ...PLAN, id: PLAN_ID }).catch(() => {});
}

/** Rotation: kürzlich gekocht (lastCooked = aktueller/voriger Monat) + letzte Pläne. */
async function buildAvoidSet() {
  const recent = await db.kvGet(RECENT_KEY, []);
  const avoid = new Set(recent);
  const now = new Date();
  const fmt = (d) => d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const thisMonth = fmt(now);
  const lastMonth = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  for (const r of state.recipes) {
    if (r.lastCooked === thisMonth || r.lastCooked === lastMonth) avoid.add(r.id);
  }
  return avoid;
}

async function rememberPlan(plan) {
  const recent = await db.kvGet(RECENT_KEY, []);
  const merged = [...new Set([...planRecipeIds(plan), ...recent])].slice(0, 14);
  await db.kvSet(RECENT_KEY, merged);
}

async function regenerate({ keepLocks = true } = {}) {
  const avoid = await buildAvoidSet();
  const locked = {};
  // Reste-Tage sind nie echte Nutzer-Locks (haben auch keinen Lock-Button)
  if (keepLocks && PLAN) for (const d of PLAN.days) if (d.locked && !d.leftoverOf) locked[d.day] = d;
  PLAN = generatePlan(state.recipes, {
    weekOf: mondayOf(new Date()),
    avoidIds: avoid,
    locked,
    leftovers,
    seed: Date.now() & 0xffffffff,
  });
  savePlan();
  await rememberPlan(PLAN);
}

async function rerollDay(day) {
  const avoid = await buildAvoidSet();
  for (const d of PLAN.days) if (d.recipeId) avoid.add(d.recipeId); // Rest der Woche meiden
  const locked = {};
  const wasLocked = {};
  for (const d of PLAN.days) {
    wasLocked[d.day] = !!d.locked;
    if (d.day !== day) locked[d.day] = d;
  }
  const fresh = generatePlan(state.recipes, {
    weekOf: PLAN.weekOf, avoidIds: avoid, locked, leftovers, seed: Date.now() & 0xffffffff,
  });
  // Lock-Flags wiederherstellen: das Festhalten beim Reroll ist technisch,
  // kein Nutzer-Lock — sonst wäre nach einem Reroll die ganze Woche gesperrt.
  for (const d of fresh.days) d.locked = d.day === day ? false : (wasLocked[d.day] && !d.leftoverOf);
  PLAN = fresh;
  savePlan();
}

function dayDate(weekOf, idx) {
  const d = new Date(weekOf);
  d.setDate(d.getDate() + idx);
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
}

function dayCardHTML(entry, idx) {
  const r = entry.recipeId ? getRecipe(entry.recipeId) : null;
  const slotBadge = entry.leftoverOf
    ? `<span class="badge prep">${t("planner.leftoverOf", { d: esc(entry.leftoverOf) })}</span>`
    : entry.slot === "besonders"
      ? `<span class="badge besonders">${t("badge.besonders")}</span>`
      : `<span class="badge alltag">${t("badge.alltag")}</span>`;
  const mins = r ? getTotalMinutes(r) : null;
  return `
    <div class="plan-day ${entry.locked ? "locked" : ""}" data-day="${entry.day}">
      <div class="pd-head">
        <span class="pd-day">${entry.day} <span class="pd-date">${dayDate(PLAN.weekOf, idx)}</span></span>
        ${slotBadge}
      </div>
      ${r ? `
        <button class="pd-recipe" data-open="${esc(r.id)}">
          <span class="pd-name">${esc(r.name)}</span>
          <span class="pd-meta">${mins ? `⏱ ${mins} Min` : ""}${r.cuisine ? ` · ${esc(r.cuisine)}` : ""}${r.mealPrep ? " · 🍱" : ""}</span>
        </button>` : `<p class="pd-empty">${t("planner.noRecipe")}</p>`}
      ${entry.leftoverOf ? "" : `
      <div class="pd-actions">
        <button class="icon-btn pd-lock" title="${entry.locked ? t("planner.unlock") : t("planner.lock")}">${entry.locked ? "🔒" : "🔓"}</button>
        <button class="icon-btn pd-reroll" title="${t("planner.reroll")}">🔄</button>
        <button class="icon-btn pd-pick" title="${t("planner.pick")}">📖</button>
      </div>`}
    </div>`;
}

export function renderPlanner(container) {
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l">
          <span style="font-size:24px">🗓</span>
          <div><h1>${t("planner.title")}</h1><div class="sub" id="plan-sub">${t("planner.subtitle")}</div></div>
        </div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
      <div class="plan-controls">
        <button class="btn-primary" id="genBtn">${t("planner.newWeek")}</button>
        <button class="btn-sec" id="shopBtn">${t("planner.makeShopping")}</button>
        <button class="btn-sec" id="aiBtn" style="display:none">${t("planner.aiWish")}</button>
        <label class="check" style="margin:0"><input type="checkbox" id="leftoverChk" /> ${t("planner.leftovers")}</label>
      </div>
    </header>
    <main class="app-main">
      <div id="plan-days"><p class="empty">Lade…</p></div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>
  `;
  container.querySelector("#menuBtn").onclick = () => openMenu("planner");

  loadPlan().then(() => {
    container.querySelector("#leftoverChk").checked = leftovers;
    paintDays(container);
  });

  container.querySelector("#leftoverChk").onchange = (e) => {
    leftovers = e.target.checked;
    db.kvSet("plannerLeftovers", leftovers).catch(() => {});
  };

  container.querySelector("#genBtn").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    await regenerate();
    btn.disabled = false;
    paintDays(container);
  };

  container.querySelector("#shopBtn").onclick = async (e) => {
    if (!PLAN) { alert(t("planner.needPlan")); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    const { getStaples } = await import("../../data/settings.js");
    const staples = await getStaples();
    // Einkaufsliste matcht gegen den deutschen Katalog → deutsche Rezepte aggregieren.
    const recipes = planRecipeIds(PLAN).map((id) => getRecipeDe(id)).filter(Boolean);
    const { items, skipped } = aggregateIngredients(recipes, { staples });
    await addItemsToList(items);
    btn.disabled = false;
    const msg = t("detail.addedToShopping", { n: items.length }) + (skipped ? t("detail.inStockSkipped", { n: skipped }) : "") + ".\n" + t("detail.switchToList");
    if (confirm(msg)) navigate("shopping");
  };

  // Optionaler KI-Hook (Premium): Wochenplan per Wunsch anpassen
  import("../../ai/gate.js").then((gate) => {
    if (!gate.isPremium()) return;
    const aiBtn = container.querySelector("#aiBtn");
    if (!aiBtn) return;
    aiBtn.style.display = "";
    aiBtn.onclick = async () => {
      if (!PLAN) { alert("Erst einen Wochenplan erzeugen."); return; }
      const wish = prompt(t("planner.aiWishPrompt"));
      if (!wish) return;
      aiBtn.disabled = true;
      aiBtn.textContent = t("planner.aiThinking");
      try {
        const [{ complete }, { buildSystemPrompt, planUserPrompt }, { extractJson, coercePlanDays }, { getStaples }] = await Promise.all([
          import("../../ai/client.js"), import("../../ai/prompts.js"), import("../../ai/parse.js"), import("../../data/settings.js"),
        ]);
        const staples = await getStaples();
        const lockedDays = PLAN.days.filter((d) => d.locked).map((d) => d.day);
        const { text } = await complete({
          system: buildSystemPrompt({ recipes: state.recipes, staples }),
          messages: [{ role: "user", content: planUserPrompt({ wish, plan: PLAN, lockedDays }) }],
        });
        const parsed = coercePlanDays(extractJson(text), new Set(state.recipes.map((r) => r.id)));
        if (!parsed) { alert(t("planner.aiBad")); return; }
        for (const d of PLAN.days) {
          if (d.locked || !parsed.days[d.day]) continue;
          d.recipeId = parsed.days[d.day];
          delete d.leftoverOf;
        }
        savePlan();
        paintDays(container);
        if (parsed.note) alert("✨ " + parsed.note);
      } catch (e) {
        alert(t("planner.aiFailed", { e: e.message }));
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = t("planner.aiWish");
      }
    };
  });
}

function paintDays(container) {
  const el = container.querySelector("#plan-days");
  if (!el) return;
  if (!PLAN) {
    el.innerHTML = `<p class="empty">${t("planner.noPlan")}</p>`;
    return;
  }
  el.innerHTML = PLAN.days.map((d, i) => dayCardHTML(d, i)).join("");

  el.querySelectorAll(".pd-recipe").forEach((b) => { b.onclick = () => openDetail(b.dataset.open); });
  el.querySelectorAll(".pd-lock").forEach((b) => {
    b.onclick = () => {
      const day = b.closest(".plan-day").dataset.day;
      const entry = PLAN.days.find((d) => d.day === day);
      entry.locked = !entry.locked;
      savePlan();
      paintDays(container);
    };
  });
  el.querySelectorAll(".pd-reroll").forEach((b) => {
    b.onclick = async () => {
      const day = b.closest(".plan-day").dataset.day;
      await rerollDay(day);
      paintDays(container);
    };
  });
  el.querySelectorAll(".pd-pick").forEach((b) => {
    b.onclick = () => {
      const day = b.closest(".plan-day").dataset.day;
      openPicker(day, container);
    };
  });
}

/** Rezept-Picker: durchsuchbare Liste der Hauptgerichte. */
function openPicker(day, container) {
  const pool = state.recipes.filter((r) => MEAL_CATEGORIES.includes(r.category));
  const rowHTML = (r) => {
    const mins = getTotalMinutes(r);
    return `<div class="match-row" data-pick="${esc(r.id)}">
      <div class="match-info"><div class="mn">${esc(r.name)}</div>
        <div class="mm">${esc(r.category)}${mins ? ` · ⏱ ${mins} Min` : ""}${r.cuisine ? ` · ${esc(r.cuisine)}` : ""}</div></div>
    </div>`;
  };
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${t("planner.pickFor", { d: esc(day) })}</span><button class="icon-btn close">✕</button></div>
    <div class="search-wrap"><span>🔍</span><input id="pick-search" placeholder="${t("common.search")}" /></div>
    <div id="pick-list">${pool.map(rowHTML).join("")}</div>
  `);
  const wire = () => {
    el.querySelectorAll("[data-pick]").forEach((row) => {
      row.onclick = () => {
        const entry = PLAN.days.find((d) => d.day === day);
        entry.recipeId = row.dataset.pick;
        entry.locked = true; // manuell gewählt = gesperrt
        delete entry.leftoverOf;
        savePlan();
        close();
        paintDays(container);
      };
    });
  };
  wire();
  el.querySelector("#pick-search").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    el.querySelector("#pick-list").innerHTML = pool
      .filter((r) => r.name.toLowerCase().includes(q) || (r.ingredients || []).join(" ").toLowerCase().includes(q))
      .map(rowHTML).join("");
    wire();
  };
}
