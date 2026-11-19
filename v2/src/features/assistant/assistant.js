// assistant.js — KI-Assistent (#/assistant, Premium/BYOK).
// Drei Werkzeuge: "Was koche ich heute?", Reste-Verwerter, Rezept erfinden —
// plus Freitext. Antworten auf Deutsch; Vorschläge verlinken ins Kochbuch,
// generierte Rezepte gehen über eine Vorschau in die Sammlung (addRecipe).
// Ohne Key: freundlicher Hinweis Richtung Einstellungen — Free-Tier bleibt voll nutzbar.

import { state, addRecipe, getRecipeDe, updateRecipe } from "../../store.js";
import * as gate from "../../ai/gate.js";
import { complete, AiError } from "../../ai/client.js";
import { buildSystemPrompt, suggestUserPrompt, leftoverUserPrompt, fromStockUserPrompt, generateUserPrompt, elaborateUserPrompt, changeUserPrompt } from "../../ai/prompts.js";
import { extractJson, coerceRecipe, coerceSuggestions, coerceUpdate, coerceChange, recipeChanges, makeUpdatePatch, applyUpdatePatch } from "../../ai/parse.js";
import { getStaples, getProfile, getInstructions } from "../../data/settings.js";
import { esc, appHeader, wireHeader } from "../../ui/helpers.js";
import { openSheet, closeAllSheets } from "../../ui/sheet.js";
import { openDetail } from "../cookbook/detail.js";
import { navigate } from "../../router.js";
import { BUILD } from "../../version.js";
import { t, getLang } from "../../i18n.js";

let history = [];   // [{role, content}] — API-Verlauf (Session, nicht persistiert)
let chatLog = [];   // gerenderte Einträge {who:"user"|"ai", html}
let busy = false;
let attachedId = null; // G3.2 (#73): Rezept, das die nächste Nachricht im Wortlaut mitschickt

/** G3.2: „✨ Mit Assistent ändern“ — dieses Rezept anhängen und den Assistenten öffnen. */
export function startChange(id) {
  if (!getRecipeDe(id)) return;
  attachedId = id;
  closeAllSheets();
  navigate("assistant");
}

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
      ${attachedHTML()}
      <input id="ai-input" placeholder="${attachedId ? t("assistant.changePlaceholder") : t("assistant.inputPlaceholder")}" />
      <button class="btn-primary" id="ai-send">➤</button>
    </div>
    <div class="build-line" style="padding-bottom:90px"></div>`;

  wireHeader(container, "assistant");
  paintChat(container);

  const input = container.querySelector("#ai-input");
  const send = () => {
    const v = input.value.trim();
    if (!v || busy) return;
    input.value = "";
    const de = attachedId && getRecipeDe(attachedId);
    if (de) {
      // Das deutsche Original geht mit, egal in welcher Sprache die App läuft (Rezeptdatei bleibt deutsch).
      attachedId = null;
      renderAssistant(container);
      ask(container, `📎 ${de.name}: ${v}`, changeUserPrompt(de, v));
    } else ask(container, v, v);
  };
  container.querySelector("#ai-send").onclick = send;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  const detach = container.querySelector("#ai-detach");
  if (detach) detach.onclick = () => { attachedId = null; renderAssistant(container); };
  if (attachedId) input.focus();

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

function attachedHTML() {
  const de = attachedId && getRecipeDe(attachedId);
  if (!de) { attachedId = null; return ""; }
  return `<div class="ai-attach" id="ai-attach">📎 <span>${esc(t("assistant.attached", { name: de.name }))}</span>
    <button class="icon-btn" id="ai-detach" aria-label="${t("common.remove")}">✕</button></div>`;
}

function paintChat(container) {
  const el = container.querySelector("#chat");
  if (!el) return;
  el.innerHTML = chatLog.length ? chatLog.map((m, i) => `<div class="ai-msg ${m.who}" data-i="${i}">${m.html}</div>`).join("")
    : `<p class="empty" style="margin-top:30px">${t("assistant.empty")}</p>`;
  wireChat(container);
  el.querySelectorAll(".ai-msg").forEach((d) => {
    if (chatLog[Number(d.dataset.i)]?.applied) d.querySelectorAll("[data-apply-update]").forEach((b) => { b.disabled = true; b.textContent = t("assistant.changeApplied"); });
  });
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
    const [staples, profile, template, { getFridge }] = await Promise.all([getStaples(), getProfile(), getInstructions(), import("../../data/lager.js")]);
    const fridge = await getFridge();
    // Q4.2: eigene Anweisungen aus den Einstellungen (Default = unverändert); der Planner nutzt sie nicht.
    const system = buildSystemPrompt({ recipes: state.recipes, staples, fridge, profile, lang: getLang(), template });
    history.push({ role: "user", content: apiPrompt });
    if (history.length > 12) history = history.slice(-12); // Verlauf begrenzen
    // Q2: System-Prompt (Profil + Vorrat + Kochbuch) bleibt im Gespräch gleich → aus dem Cache.
    const { text } = await complete({ system, messages: history, cacheSystem: true, action: "assistant" });
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
      const payload = esc(JSON.stringify(makeUpdatePatch(before, recipe)));
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

  if (json && json.type === "update") return renderUpdate(json);

  if (json && json.type === "change") {
    const c = coerceChange(json, knownIds);
    const de = c && getRecipeDe(c.id);
    if (de) {
      return `${c.intro ? `<p>${esc(c.intro)}</p>` : ""}
        <button class="btn-primary" data-change-recipe="${esc(c.id)}">${esc(t("assistant.changeThis", { name: de.name }))}</button>`;
    }
    return `<p>${esc(toStr(json.intro) || text)}</p>`; // unbekannte id: nur Klartext, kein Raten
  }

  if (json && json.type === "text") return `<p>${esc(json.text)}</p>`;
  return `<p>${esc(text)}</p>`; // Fallback: Rohtext
}

const toStr = (v) => (v === null || v === undefined) ? "" : String(v);

/** Feldname für die Bestätigungskarte (UI-Sprache); Werte bleiben deutsch wie gespeichert. */
function fieldLabel(f) {
  const map = {
    name: "form.name", category: "form.category", time: "form.time", servings: "form.servings",
    effort: "form.effort", difficulty: "form.difficulty", cuisine: "form.cuisine", season: "form.season",
    ingredients: "detail.ingredients", steps: "detail.steps", tips: "detail.tips",
  };
  return t(map[f] || "assistant.field." + f);
}
function fieldValue(v) {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return String(v);
}

/** G3.2: Update-Antwort → Bestätigungskarte (nur was sich ändert). Nichts wird hier gespeichert. */
function renderUpdate(json) {
  const before = getRecipeDe(toStr(json.id));
  const { recipe, errors } = coerceUpdate(json, before);
  if (!recipe) return `<p>${t("assistant.schemaFail", { errors: esc(errors.join("; ")) })}</p>`;
  const changes = recipeChanges(before, recipe);
  if (!changes.length) return `<p>${t("assistant.updateNoChange")}</p>`;
  const rows = changes.map((c) => {
    if (c.added) {
      return `<li class="upd-field" data-field="${c.field}"><b>${fieldLabel(c.field)}</b>
        ${c.removed.map((l) => `<div class="upd-rm">− ${esc(l)}</div>`).join("")}
        ${c.added.map((l) => `<div class="upd-add">+ ${esc(l)}</div>`).join("")}
        ${!c.added.length && !c.removed.length ? `<div class="upd-order">${t("assistant.updateOrder")}</div>` : ""}</li>`;
    }
    return `<li class="upd-field" data-field="${c.field}"><b>${fieldLabel(c.field)}</b>
      <div><span class="upd-old">${esc(fieldValue(c.before))}</span> → <span class="upd-new">${esc(fieldValue(c.after))}</span></div></li>`;
  }).join("");
  const payload = esc(JSON.stringify(makeUpdatePatch(before, recipe)));
  return `${json.intro ? `<p>${esc(json.intro)}</p>` : ""}
    <div class="ai-recipe ai-update">
      <div class="sug-name" style="font-size:19px">${esc(before.name)}</div>
      <ul class="upd-changes">${rows}</ul>
      <button class="btn-primary" data-apply-update="${payload}">${t("assistant.applyChange")}</button>
      <button class="btn-sec" data-preview-update="${payload}">${t("assistant.lookFirst")}</button>
    </div>`;
}

/** „Änderung übernehmen“: nur die Felder der Karte, auf das aktuell gespeicherte Rezept; Rest bleibt. */
async function applyUpdate(patch) {
  let result;
  await updateRecipe(patch.id, (x) => { result = applyUpdatePatch(x, patch); });
  if (!result.applied) throw new Error(t("assistant.changeStale"));
  return getRecipeDe(patch.id);
}

/** Karte als übernommen merken, damit sie nach einem Neuzeichnen deaktiviert bleibt. */
function markApplied(btn) {
  const m = chatLog[Number(btn.closest(".ai-msg")?.dataset.i)];
  if (m) m.applied = true;
  btn.textContent = t("assistant.changeApplied");
  btn.disabled = true;
}

function wireChat(container) {
  container.querySelectorAll("[data-change-recipe]").forEach((b) => {
    b.onclick = () => startChange(b.dataset.changeRecipe);
  });
  container.querySelectorAll("[data-apply-update]").forEach((b) => {
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await applyUpdate(JSON.parse(b.dataset.applyUpdate));
        markApplied(b);
      } catch (e) {
        b.disabled = false;
        alert(t("form.saveFailed", { e: e.message }));
      }
    };
  });
  container.querySelectorAll("[data-preview-update]").forEach((b) => {
    b.onclick = () => {
      const patch = JSON.parse(b.dataset.previewUpdate);
      const applyBtn = b.parentElement.querySelector("[data-apply-update]");
      const current = getRecipeDe(patch.id);
      if (!current) return;
      const merged = { ...current };
      if (!applyUpdatePatch(merged, patch).applied) { alert(t("assistant.changeStale")); return; }
      previewRecipe(merged, applyBtn, { label: t("assistant.applyChange"), done: t("assistant.changeApplied"), save: async () => { const r = await applyUpdate(patch); markApplied(applyBtn); return r; } });
    };
  });
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

/** Vorschau-Sheet (Review vor dem Speichern). Ohne opts: neues Rezept anlegen; G3.2: mit opts eine Änderung übernehmen. */
function previewRecipe(recipe, sourceBtn, opts = {}) {
  const label = opts.label || t("assistant.saveToCookbook");
  const save = opts.save || ((r) => addRecipe(r));
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${t("assistant.previewTitle", { cat: esc(recipe.category) })}</span><button class="icon-btn close" aria-label="${t("common.close")}">✕</button></div>
    <div class="detail-name">${esc(recipe.name)}</div>
    <div class="rmeta">${recipe.time ? `⏱ ${esc(recipe.time)}` : ""} · 🍽 ${esc(recipe.servings)}${recipe.cuisine ? ` · ${esc(recipe.cuisine)}` : ""}</div>
    <h3>${t("detail.ingredients")}</h3><ul>${recipe.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    <h3>${t("detail.steps")}</h3><ol>${recipe.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    ${recipe.tips ? `<h3>${t("detail.tips")}</h3><p class="tips-box">${esc(recipe.tips)}</p>` : ""}
    <button class="save-btn" id="pv-save">${label}</button>
  `);
  el.querySelector("#pv-save").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      const saved = await save(recipe);
      close();
      if (sourceBtn) { sourceBtn.textContent = opts.done || "✓ Gespeichert!"; sourceBtn.disabled = true; }
      openDetail(saved.id);
    } catch (err) {
      e.currentTarget.disabled = false;
      alert(t("form.saveFailed", { e: err.message }));
    }
  };
}
