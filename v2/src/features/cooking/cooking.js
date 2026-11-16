// cooking.js — Kochmodus (Vollbild-Route #/cook/:id).
// v1-Parität P6.1–P6.7 (Wake Lock, Übersicht/Pager, Abhaken mit persistiertem
// Fortschritt, Schritt-Timer mit Alarm, einklappbare Zutaten ohne Re-Render)
// + v2: Portions-Scaler (live skalierte Mengen) und kontextuelle Tipps.

import { getRecipe, getRecipeDe } from "../../store.js";
import { ingredientIcons } from "../../data/catalog.js";
import * as db from "../../data/db.js";
import { parseMinutes, parseTipps, hasStructuredTipps, scaleIngredient, parseServings } from "../../data/derive.js";
import { esc } from "../../ui/helpers.js";
import { navigate } from "../../router.js";
import { t, tn } from "../../i18n.js";
import { getFactor, setFactor, startFor } from "./portions.js";
import { createTimers } from "./timers.js";

/* ---------- Wake Lock ---------- */
let wakeLock = null;
async function reqWake() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* egal */ }
}
function relWake() {
  try { wakeLock && wakeLock.release(); } catch (e) { /* egal */ }
  wakeLock = null;
}

/* ---------- Fortschritt (IndexedDB statt localStorage, gleiche Semantik) ---------- */
const progKey = (id) => "progress:" + id;

/* ---------- Alarm: 3 Pieptöne + Vibration (v1-Parität) ---------- */
function alarm() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.28);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) { /* egal */ }
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) { /* egal */ }
}

/**
 * Rendert den Kochmodus in den Container. Gibt eine cleanup()-Funktion zurück
 * (Timer stoppen, Wake Lock freigeben) — wird vom Router beim Verlassen gerufen.
 */
export function renderCook(container, id) {
  const r = getRecipe(id);
  if (!r) { navigate("cookbook"); return () => {}; }

  const ings = r.ingredients || [], steps = r.steps || [];
  const ingIcons = ingredientIcons(ings, (getRecipeDe(r.id) || {}).ingredients || []); // D2
  const tipps = parseTipps(r.tips || "");
  const baseServings = parseServings(r.servings);

  let mode = "list";       // "list" | "pager"
  let cur = 0;
  let ingOpen = true;
  let tippOpen = false;
  // QW-2: zuletzt gewählte Portionen dieses Rezepts (nur auf diesem Gerät), sonst Faktor 1
  // target = Ziel-Portionen (wenn Basis bekannt), factor = Portions-Faktor
  let { target, factor } = startFor(baseServings, getFactor(id));
  // QW-8: Timer-Zustand lebt außerhalb des DOM (timers.js) — paint() darf ihn nicht anfassen.
  const timers = createTimers();
  let ticker = null; // ein Intervall für alle Timer; läuft nur, solange einer läuft
  let prog = { steps: {}, ings: {} };

  const view = document.createElement("div");
  view.className = "cook";
  container.innerHTML = "";
  container.appendChild(view);
  reqWake();

  // Fortschritt laden (async), dann neu zeichnen
  db.kvGet(progKey(id), { steps: {}, ings: {} }).then((p) => {
    prog = p && typeof p === "object" ? { steps: p.steps || {}, ings: p.ings || {} } : { steps: {}, ings: {} };
    paint();
  });

  const saveProg = () => { db.kvSet(progKey(id), prog).catch(() => {}); };
  const stopTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };
  const clearTimers = () => { timers.clear(); stopTicker(); };
  const exit = () => navigate("cookbook"); // cleanup macht der Router

  /* ---------- Timer (Zustand in timers.js, Buttons sind nur Anzeige) ---------- */
  const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

  function timerBaseLabel(btn) {
    const m = parseInt(btn.dataset.mins, 10) || null;
    return btn.classList.contains("pager-timer")
      ? (t("cooking.countdown") + (m ? ` (${m} Min)` : ""))
      : ("⏱" + (m ? ` ${m}′` : ""));
  }

  // Zeichnet alle sichtbaren Timer-Buttons aus dem Zustand (nach jedem paint() und bei jedem Tick).
  function refreshTimers() {
    const now = Date.now();
    view.querySelectorAll(".step-timer, .pager-timer").forEach((btn) => {
      const i = +btn.dataset.timer;
      const run = timers.running(i, now), done = timers.fired(i, now);
      btn.classList.toggle("running", run);
      btn.classList.toggle("fired", done);
      btn.textContent = run ? "⏱ " + fmt(timers.remaining(i, now)) : done ? t("cooking.timerDone") : timerBaseLabel(btn);
    });
  }

  function tick() {
    const now = Date.now();
    if (timers.takeFired(now).length) alarm(); // auch wenn der Schritt gerade nicht gezeigt wird
    if (!timers.anyRunning(now)) stopTicker();
    refreshTimers();
  }

  function onTimerClick(btn) {
    const i = +btn.dataset.timer;
    if (timers.running(i, Date.now())) {
      timers.stop(i);
    } else {
      let m = parseInt(btn.dataset.mins, 10) || null;
      if (!m) {
        const v = prompt(t("cooking.timerPrompt"), "5");
        m = parseInt(v, 10);
        if (!m || m <= 0) return;
      }
      timers.start(i, m * 60, Date.now());
      if (!ticker) ticker = setInterval(tick, 250);
    }
    refreshTimers();
  }

  const toggleStep = (i) => { prog.steps[i] = !prog.steps[i]; if (!prog.steps[i]) delete prog.steps[i]; saveProg(); };
  const toggleIng = (i) => { prog.ings[i] = !prog.ings[i]; if (!prog.ings[i]) delete prog.ings[i]; saveProg(); };

  /* ---------- HTML-Blöcke ---------- */
  function scalerHTML() {
    if (!ings.length) return "";
    const display = baseServings !== null
      ? tn("cooking.portion", target)
      : `×${String(factor).replace(".", ",")}`;
    return `<div class="scaler">
      <span class="lbl">${t("cooking.portions")}</span>
      <button data-scale="-">−</button>
      <span class="val">${esc(display)}</span>
      <button data-scale="+">+</button>
      ${factor !== 1 ? `<span class="note">${t("cooking.amountsAdjusted")}</span>` : ""}
    </div>`;
  }

  function ingredientsBlock() {
    if (!ings.length) return "";
    return `<div class="cook-sec foldhead" data-fold="ing">${t("cooking.ingredients")} <span class="chev">${ingOpen ? "▾" : "▸"}</span></div>
      <div class="foldbody-ing"${ingOpen ? "" : ' style="display:none"'}>
        ${ings.map((txt, idx) => `<div class="cook-ing ${prog.ings[idx] ? "done" : ""}" data-ing="${idx}"><span class="tick"></span><span class="ing-ic" aria-hidden="true">${ingIcons[idx] || "·"}</span><span>${esc(factor !== 1 ? scaleIngredient(txt, factor) : txt)}</span></div>`).join("")}
      </div>`;
  }

  function tippsBlock() {
    if (!r.tips) return "";
    const inner = hasStructuredTipps(tipps)
      ? [
          tipps.toppings.length ? `<strong>🧀 Topping:</strong> ${tipps.toppings.map(esc).join(" · ")}` : "",
          tipps.variationen.length ? `<strong>🔄 Variation:</strong> ${tipps.variationen.map(esc).join(" · ")}` : "",
          tipps.alltagsUpgrade ? `<strong>✨ Upgrade:</strong> ${esc(tipps.alltagsUpgrade)}` : "",
          tipps.technik ? `<strong>🧑‍🍳 Technik:</strong> ${esc(tipps.technik)}` : "",
          tipps.rest ? esc(tipps.rest) : "",
        ].filter(Boolean).join("<br>")
      : esc(tipps.rest || r.tips);
    return `<div class="cook-sec foldhead" data-fold="tipp">${t("cooking.tips")} <span class="chev">${tippOpen ? "▾" : "▸"}</span></div>
      <div class="foldbody-tipp"${tippOpen ? "" : ' style="display:none"'}>
        <div class="cook-tipp" style="margin-top:4px">${inner}</div>
      </div>`;
  }

  function bodyHTML() {
    if (mode === "list") {
      return `${scalerHTML()}${ingredientsBlock()}${tippsBlock()}
        ${steps.length ? `<div class="cook-sec">${t("cooking.steps")}</div>${steps.map((s, i) => {
          const mins = parseMinutes(s);
          return `<div class="cook-step ${prog.steps[i] ? "done" : ""}" data-step="${i}">
            <span class="cook-num">${i + 1}</span>
            <span class="cook-text">${esc(s)}</span>
            <button class="step-timer" data-timer="${i}" data-mins="${mins || ""}"></button>
          </div>`;
        }).join("")}` : ""}`;
    }
    // Pager
    const s = steps[cur] || "";
    const mins = parseMinutes(s);
    const isLast = cur >= steps.length - 1;
    const upgradeHint = isLast && (tipps.alltagsUpgrade || tipps.toppings.length)
      ? `<div class="cook-tipp">✨ ${esc(tipps.alltagsUpgrade || ("Topping: " + tipps.toppings[0]))}</div>`
      : "";
    return `${scalerHTML()}${ingredientsBlock()}${tippsBlock()}
      <div class="pager">
        <div class="pager-count">${t("cooking.step", { a: cur + 1, b: steps.length })}</div>
        <div class="pager-step ${prog.steps[cur] ? "done" : ""}">
          <span class="cook-num big">${cur + 1}</span>
          <div class="pager-text">${esc(s)}</div>
        </div>
        <button class="pager-timer" data-timer="${cur}" data-mins="${mins || ""}"></button>
        ${upgradeHint}
        <div class="pager-nav">
          <button class="btn-sec pg-prev" ${cur === 0 ? "disabled" : ""}>←</button>
          <button class="btn-sec pg-check">${prog.steps[cur] ? t("cooking.checked") : t("cooking.check")}</button>
          <button class="btn-primary pg-next" ${cur >= steps.length - 1 ? "disabled" : ""}>→</button>
        </div>
      </div>`;
  }

  function paint() {
    view.innerHTML = `
      <div class="cook-top">
        <span class="ct">${t("cooking.title")}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="modeswitch">
            <button class="ms ${mode === "list" ? "on" : ""}" data-mode="list">${t("cooking.overview")}</button>
            <button class="ms ${mode === "pager" ? "on" : ""}" data-mode="pager">${t("cooking.pager")}</button>
          </div>
          <button class="icon-btn close" aria-label="${t("common.close")}">✕</button>
        </div>
      </div>
      <h2>${esc(r.name)}</h2>
      <div class="wakeinfo">${t("cooking.screenOn")}<button class="reset-prog">${t("cooking.reset")}</button></div>
      ${bodyHTML()}
      <button class="cook-done-btn done-btn">${t("cooking.finish")}</button>`;
    wire();
  }

  function wire() {
    view.querySelector(".close").onclick = exit;
    view.querySelector(".done-btn").onclick = exit;
    view.querySelectorAll(".ms").forEach((b) => {
      b.onclick = () => { if (mode !== b.dataset.mode) { mode = b.dataset.mode; paint(); } };
    });
    const rp = view.querySelector(".reset-prog");
    if (rp) rp.onclick = () => {
      if (confirm(t("cooking.resetConfirm"))) { prog = { steps: {}, ings: {} }; saveProg(); paint(); }
    };

    // Scaler: −/+ ändert Ziel-Portionen bzw. Faktor (Repaint; laufende Timer überleben, QW-8)
    view.querySelectorAll("[data-scale]").forEach((b) => {
      b.onclick = () => {
        if (baseServings !== null) {
          target = Math.max(1, Math.min(24, target + (b.dataset.scale === "+" ? 1 : -1)));
          factor = target / baseServings;
        } else {
          const stepsF = [0.5, 1, 1.5, 2, 3, 4];
          let i = stepsF.indexOf(factor);
          if (i < 0) i = 1;
          i = Math.max(0, Math.min(stepsF.length - 1, i + (b.dataset.scale === "+" ? 1 : -1)));
          factor = stepsF[i];
        }
        setFactor(id, factor); // Faktor 1 entfernt den gemerkten Wert
        paint();
      };
    });

    // Falten ohne Re-Render (laufende Timer überleben)
    view.querySelectorAll("[data-fold]").forEach((fold) => {
      fold.onclick = () => {
        const which = fold.dataset.fold;
        const body = view.querySelector(which === "ing" ? ".foldbody-ing" : ".foldbody-tipp");
        const open = body.style.display === "none";
        body.style.display = open ? "" : "none";
        fold.querySelector(".chev").textContent = open ? "▾" : "▸";
        if (which === "ing") ingOpen = open; else tippOpen = open;
      };
    });

    view.querySelectorAll("[data-ing]").forEach((el) => {
      el.onclick = () => { toggleIng(+el.dataset.ing); el.classList.toggle("done"); };
    });
    view.querySelectorAll(".cook-step").forEach((el) => {
      el.onclick = () => { toggleStep(+el.dataset.step); el.classList.toggle("done"); };
    });

    const prev = view.querySelector(".pg-prev");
    if (prev) prev.onclick = () => { if (cur > 0) { cur--; paint(); } };
    const next = view.querySelector(".pg-next");
    if (next) next.onclick = () => { if (cur < steps.length - 1) { cur++; paint(); } };
    const chk = view.querySelector(".pg-check");
    if (chk) chk.onclick = () => { toggleStep(cur); paint(); };

    view.querySelectorAll(".step-timer, .pager-timer").forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); onTimerClick(btn); }; // nicht den Schritt abhaken
    });
    refreshTimers();
  }

  paint();

  // Cleanup für den Router
  return () => { clearTimers(); relWake(); };
}
