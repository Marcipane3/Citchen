// assistant.js — KI-Assistent (#/assistant, Premium/BYOK).
// Drei Werkzeuge: "Was koche ich heute?", Reste-Verwerter, Rezept erfinden —
// plus Freitext. Antworten auf Deutsch; Vorschläge verlinken ins Kochbuch,
// generierte Rezepte gehen über eine Vorschau in die Sammlung (addRecipe).
// Ohne Key: freundlicher Hinweis Richtung Einstellungen — Free-Tier bleibt voll nutzbar.

import { state, addRecipe } from "../../store.js";
import * as gate from "../../ai/gate.js";
import { complete, AiError } from "../../ai/client.js";
import { buildSystemPrompt, suggestUserPrompt, leftoverUserPrompt, fromStockUserPrompt, generateUserPrompt, elaborateUserPrompt } from "../../ai/prompts.js";
import { extractJson, coerceRecipe, coerceSuggestions } from "../../ai/parse.js";
import { getStaples, getProfile } from "../../data/settings.js";
import { esc, appHeader, wireHeader } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { openDetail } from "../cookbook/detail.js";
import { navigate } from "../../router.js";
import { BUILD } from "../../version.js";
import { t, getLang } from "../../i18n.js";

let history = [];   // [{role, content}] — API-Verlauf (Session, nicht persistiert)
let chatLog = [];   // gerenderte Einträge {who:"user"|"ai", html}
let busy = false;

// KI nicht nutzbar: ehrlich erklären, warum (kein Key vs. offline), statt nur
// fehlzuschlagen. Offline = vorübergehend → „Erneut versuchen“ statt Einstellungen.
function unavailableView(container, reason) {
  const offline = reason === "offline";
  const icon = offline ? "📡" : "🔐";
  const title = offline ? t("assistant.offlineTitle") : t("assistant.lockedTitle");
  const body = offline ? t("assistant.offlineBody") : t("assistant.lockedBody");
  const btn = offline
    ? `<button class="btn-primary" id="retry">${t("assistant.retry")}</button>`
    : `<button class="btn-primary" id="goSettings">${t("assistant.goSettings")}</button>`;
  container.innerHTML = `
    ${appHeader({ icon: "✨", title: t("assistant.title"), sub: t("assistant.premiumSub"), source: "assistant" })}
    <main class="app-main">
      <div class="card" style="text-align:center;padding:28px 20px">
        <div style="font-size:40px;margin-bottom:10px">${icon}</div>
        <h3 style="color:var(--accent);margin-bottom:8px">${title}</h3>
        <p style="color:var(--muted-strong);line-height:1.6;margin-bottom:16px">${body}</p>
        ${btn}
      </div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;
  wireHeader(container, "assistant");
  const gs = container.querySelector("#goSettings");
  if (gs) gs.onclick = () => navigate("settings");
  const rt = container.querySelector("#retry");
  if (rt) rt.onclick = () => renderAssistant(container);
}

export function renderAssistant(container) {
  const reason = gate.aiUnavailableReason();
  if (reason) { unavailableView(container, reason); return; }

  container.innerHTML = `
    ${appHeader({
      icon: "✨",
      title: t("assistant.title"),
      sub: esc(gate.getModel()),
      source: "assistant",
      extra: `
      <div class="ai-tools">
        <button class="chip" data-tool="suggest">${t("assistant.toolSuggest")}</button>
        <button class="chip" data-tool="fromStock">${t("assistant.toolFromStock")}</button>
        <button class="chip" data-tool="leftover">${t("assistant.toolLeftover")}</button>
        <button class="chip" data-tool="generate">${t("assistant.toolGenerate")}</button>
      </div>`,
    })}
    <main class="app-main">
      <div id="chat"></div>
      <div id="ai-busy" style="display:none" class="ai-busy">${t("assistant.thinking")}</div>
    </main>
    <div class="ai-inputbar">
      <input id="ai-input" placeholder="${t("assistant.inputPlaceholder")}" />
      <button class="btn-primary" id="ai-send">➤</button>
    </div>
    <div class="build-line" style="padding-bottom:90px"></div>`;

  wireHeader(container, "assistant");
  paintChat(container);

  const input = container.querySelector("#ai-input");
  const send = () => { const v = input.value.trim(); if (v) { input.value = ""; ask(container, v, v); } };
  container.querySelector("#ai-send").onclick = send;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });

  container.querySelectorAll("[data-tool]").forEach((b) => {
    b.onclick = () => {
      const tool = b.dataset.tool;
      if (tool === "suggest") {
        const wd = new Date().getDay();
        ask(container, "Was koche ich heute?", suggestUserPrompt({ isWeekend: wd === 0 || wd === 6 }));
      } else if (tool === "fromStock") {
        import("../../data/lager.js").then(async ({ getFridge }) => {
          const fridge = await getFridge();
          ask(container, t("assistant.toolFromStock"), fromStockUserPrompt({ fridge }));
        });
      } else if (tool === "leftover") {
        const ing = prompt(t("assistant.leftoverPrompt"));
        if (ing) ask(container, `${t("assistant.toolLeftover")}: ${ing}`, leftoverUserPrompt(ing));
      } else if (tool === "generate") {
        const wish = prompt(t("assistant.generatePrompt"));
        if (wish) ask(container, `${t("assistant.toolGenerate")}: ${wish}`, generateUserPrompt(wish));
      }
    };
  });
}

function paintChat(container) {
  const el = container.querySelector("#chat");
  if (!el) return;
  el.innerHTML = chatLog.length ? chatLog.map((m) => `<div class="ai-msg ${m.who}">${m.html}</div>`).join("")
    : `<p class="empty" style="margin-top:30px">${t("assistant.empty")}</p>`;
  wireChat(container);
  el.scrollTop = el.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
}

async function ask(container, displayText, apiPrompt) {
  if (busy) return;
  busy = true;
  chatLog.push({ who: "user", html: esc(displayText) });
  paintChat(container);
  container.querySelector("#ai-busy").style.display = "";

  try {
    const [staples, profile, { getFridge }] = await Promise.all([getStaples(), getProfile(), import("../../data/lager.js")]);
    const fridge = await getFridge();
    const system = buildSystemPrompt({ recipes: state.recipes, staples, fridge, profile, lang: getLang() });
    history.push({ role: "user", content: apiPrompt });
    if (history.length > 12) history = history.slice(-12); // Verlauf begrenzen
    const { text } = await complete({ system, messages: history });
    history.push({ role: "assistant", content: text });
    chatLog.push({ who: "ai", html: renderAnswer(text) });
  } catch (e) {
    const hint = e instanceof AiError && e.kind === "auth" ? ` <a href="#/settings">${t("assistant.toSettings")}</a>` : "";
    chatLog.push({ who: "ai", html: `<span style="color:var(--danger)">⚠️ ${esc(e.message)}</span>${hint}` });
  }
  busy = false;
  const b = container.querySelector("#ai-busy");
  if (b) b.style.display = "none";
  paintChat(container);
}

/** Antwort-JSON → hübsches HTML (Vorschlags-Karten / Rezept-Vorschau / Text). */
function renderAnswer(text) {
  const json = extractJson(text);
  const knownIds = new Set(state.recipes.map((r) => r.id));

  if (json && json.type === "suggestions") {
    const s = coerceSuggestions(json, knownIds);
    if (s) {
      return `${s.intro ? `<p>${esc(s.intro)}</p>` : ""}
        <div class="ai-suggestions">
        ${s.items.map((it) => `
          <div class="ai-sug">
            <div class="sug-name">${esc(it.name)}${it.id ? "" : ` <span class="badge totry">${t("assistant.newIdea")}</span>`}</div>
            <div class="sug-reason">${esc(it.reason)}</div>
            ${it.id
              ? `<button class="btn-sec" data-open-recipe="${esc(it.id)}">${t("assistant.openInCookbook")}</button>`
              : `<button class="btn-sec" data-elaborate="${esc(it.name)}">${t("assistant.elaborate")}</button>`}
          </div>`).join("")}
        </div>`;
    }
  }

  if (json && json.type === "recipe") {
    const { recipe, errors } = coerceRecipe(json.recipe);
    if (recipe) {
      const payload = esc(JSON.stringify(recipe));
      return `${json.intro ? `<p>${esc(json.intro)}</p>` : ""}
        <div class="ai-recipe">
          <div class="cat-label">${esc(recipe.category)}</div>
          <div class="sug-name" style="font-size:19px">${esc(recipe.name)}</div>
          <div class="rmeta">${recipe.time ? `⏱ ${esc(recipe.time)}` : ""} · 🍽 ${esc(recipe.servings)}${recipe.cuisine ? ` · ${esc(recipe.cuisine)}` : ""}</div>
          <p class="sug-reason" style="margin-top:6px">${recipe.ingredients.length} Zutaten · ${recipe.steps.length} Schritte${recipe.tips ? " · mit Tipps" : ""}</p>
          <button class="btn-primary" data-save-recipe="${payload}">${t("assistant.saveToCookbook")}</button>
          <button class="btn-sec" data-preview-recipe="${payload}">${t("assistant.lookFirst")}</button>
        </div>`;
    }
    return `<p>${t("assistant.schemaFail", { errors: esc(errors.join("; ")) })}</p>`;
  }

  if (json && json.type === "text") return `<p>${esc(json.text)}</p>`;
  return `<p>${esc(text)}</p>`; // Fallback: Rohtext
}

function wireChat(container) {
  container.querySelectorAll("[data-open-recipe]").forEach((b) => {
    b.onclick = () => openDetail(b.dataset.openRecipe);
  });
  container.querySelectorAll("[data-elaborate]").forEach((b) => {
    b.onclick = () => ask(container, `${t("assistant.elaborate")}: ${b.dataset.elaborate}`, elaborateUserPrompt(b.dataset.elaborate));
  });
  container.querySelectorAll("[data-save-recipe]").forEach((b) => {
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        const recipe = JSON.parse(b.dataset.saveRecipe);
        const saved = await addRecipe(recipe);
        b.textContent = t("common.saved");
        setTimeout(() => openDetail(saved.id), 400);
      } catch (e) {
        b.disabled = false;
        alert(t("form.saveFailed", { e: e.message }));
      }
    };
  });
  container.querySelectorAll("[data-preview-recipe]").forEach((b) => {
    b.onclick = () => previewRecipe(JSON.parse(b.dataset.previewRecipe), b);
  });
}

/** Vorschau-Sheet (Review vor dem Speichern). */
function previewRecipe(recipe, sourceBtn) {
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${t("assistant.previewTitle", { cat: esc(recipe.category) })}</span><button class="icon-btn close" aria-label="${t("common.close")}">✕</button></div>
    <div class="detail-name">${esc(recipe.name)}</div>
    <div class="rmeta">${recipe.time ? `⏱ ${esc(recipe.time)}` : ""} · 🍽 ${esc(recipe.servings)}${recipe.cuisine ? ` · ${esc(recipe.cuisine)}` : ""}</div>
    <h3>${t("detail.ingredients")}</h3><ul>${recipe.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    <h3>${t("detail.steps")}</h3><ol>${recipe.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    ${recipe.tips ? `<h3>${t("detail.tips")}</h3><p class="tips-box">${esc(recipe.tips)}</p>` : ""}
    <button class="save-btn" id="pv-save">${t("assistant.saveToCookbook")}</button>
  `);
  el.querySelector("#pv-save").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      const saved = await addRecipe(recipe);
      close();
      if (sourceBtn) { sourceBtn.textContent = "✓ Gespeichert!"; sourceBtn.disabled = true; }
      openDetail(saved.id);
    } catch (err) {
      e.currentTarget.disabled = false;
      alert("Speichern fehlgeschlagen: " + err.message);
    }
  };
}
