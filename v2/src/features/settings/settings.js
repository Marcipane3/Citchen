// settings.js — Einstellungen (#/settings). Frei nutzbar, schaltet Premium frei.
// 🔑 KI (BYOK) · 🥫 Lager-Link · ☁️ Drive · 🎨 Design · 🌍 Sprache · ℹ️ Guide.

import { state, setRecipes } from "../../store.js";
import * as gate from "../../ai/gate.js";
import { testKey, AiError } from "../../ai/client.js";
import * as drive from "../../data/drive.js";
import * as sync from "../../data/sync.js";
import { getTheme, setTheme } from "../../data/settings.js";
import { esc } from "../../ui/helpers.js";
import { openMenu } from "../menu.js";
import { navigate } from "../../router.js";
import { BUILD } from "../../version.js";
import { t, LANGS, getLang, setLang } from "../../i18n.js";

export function renderSettings(container) {
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l"><span style="font-size:24px">⚙️</span><div><h1>${t("settings.title")}</h1></div></div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
    </header>
    <main class="app-main">

      <div class="card set-card">
        <h3>${t("settings.aiHeading")}</h3>
        <p class="set-note">${t("settings.aiNote")}</p>
        <label>${t("settings.apiKey")}</label>
        <div style="display:flex;gap:8px">
          <input class="f" id="set-key" type="password" placeholder="sk-ant-…" autocomplete="off" style="flex:1" />
          <button class="btn-sec" id="key-toggle" title="anzeigen">👁</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-primary" id="key-save">${t("settings.keySave")}</button>
          <button class="btn-sec" id="key-test">${t("settings.keyTest")}</button>
          <button class="btn-sec btn-del" id="key-del">${t("settings.keyRemove")}</button>
        </div>
        <p class="set-note" id="key-status"></p>
        <label style="margin-top:14px">${t("settings.model")}</label>
        ${gate.MODELS.map((m) => `
          <label class="check"><input type="radio" name="set-model" value="${m.id}" ${gate.getModel() === m.id ? "checked" : ""}/> ${esc(m.label)}</label>`).join("")}
      </div>

      <div class="card set-card">
        <h3>${t("settings.lagerHeading")}</h3>
        <p class="set-note">${t("settings.lagerNote")}</p>
        <button class="btn-sec" id="open-lager" style="width:100%">${t("settings.lagerOpen")}</button>
      </div>

      <div class="card set-card">
        <h3>${t("settings.driveHeading")}</h3>
        <p class="set-note">${t("settings.driveNote")}</p>
        <p id="drive-status" style="font-weight:600;margin-bottom:10px"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" id="drive-connect">${t("settings.driveConnect")}</button>
          <button class="btn-sec" id="drive-sync">${t("settings.driveSync")}</button>
          <button class="btn-sec btn-del" id="drive-disconnect">${t("settings.driveDisconnect")}</button>
        </div>
      </div>

      <div class="card set-card">
        <h3>${t("settings.langHeading")}</h3>
        <div class="lang-toggle">
          ${LANGS.map((l) => `<button class="lang-btn ${getLang() === l.code ? "on" : ""}" data-setlang="${l.code}"><span class="lang-flag">${l.flag}</span>${l.label}</button>`).join("")}
        </div>
      </div>

      <div class="card set-card">
        <h3>${t("settings.themeHeading")}</h3>
        <label class="check"><input type="radio" name="set-theme" value="system"/> ${t("settings.themeSystem")}</label>
        <label class="check"><input type="radio" name="set-theme" value="light"/> ${t("settings.themeLight")}</label>
        <label class="check"><input type="radio" name="set-theme" value="dark"/> ${t("settings.themeDark")}</label>
      </div>

      <div class="card set-card">
        <h3>${t("settings.aboutHeading")}</h3>
        <p class="set-note">${t("settings.aboutLine", { b: BUILD, n: state.recipes.length, src: state.meta?.source === "drive" ? t("settings.srcDrive") : t("settings.srcLocal") })}</p>
        <button class="btn-sec" id="open-guide" style="width:100%;margin-top:6px">${t("settings.guideBtn")}</button>
      </div>

    </main>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("settings");
  container.querySelector("#open-lager").onclick = () => navigate("lager");
  container.querySelector("#open-guide").onclick = () => navigate("guide");

  /* ---------- KI / Key ---------- */
  const keyInput = container.querySelector("#set-key");
  const keyStatus = container.querySelector("#key-status");
  if (gate.isPremium()) { keyInput.value = gate.getKey(); keyStatus.textContent = t("settings.keyActive"); }
  container.querySelector("#key-toggle").onclick = () => { keyInput.type = keyInput.type === "password" ? "text" : "password"; };
  container.querySelector("#key-save").onclick = () => {
    const k = keyInput.value.trim();
    if (k && !gate.looksLikeKey(k) && !confirm(t("settings.keyWeird"))) return;
    gate.setKey(k);
    keyStatus.textContent = k ? t("settings.keyStored") : t("settings.keyRemoved");
  };
  container.querySelector("#key-del").onclick = () => {
    gate.clearKey(); keyInput.value = ""; keyStatus.textContent = t("settings.keyRemoved");
  };
  container.querySelector("#key-test").onclick = async (e) => {
    const btn = e.currentTarget;
    const k = keyInput.value.trim() || gate.getKey();
    if (!k) { keyStatus.textContent = t("settings.keyNone"); return; }
    btn.disabled = true; keyStatus.textContent = t("settings.keyTesting");
    try {
      const res = await testKey(k, gate.getModel());
      keyStatus.textContent = t("settings.keyOk", { m: res.displayName, vision: res.vision ? t("settings.keyVision") : "" });
    } catch (err) {
      keyStatus.textContent = t("settings.keyBad", { e: err.message });
    }
    btn.disabled = false;
  };
  container.querySelectorAll('input[name="set-model"]').forEach((r) => { r.onchange = () => gate.setModel(r.value); });

  /* ---------- Drive ---------- */
  const driveStatus = container.querySelector("#drive-status");
  const paintDrive = () => {
    driveStatus.textContent = state.signedIn ? t("settings.driveConnected", { s: sync.getStatus() || "ok" }) : t("settings.driveNot");
    container.querySelector("#drive-connect").style.display = state.signedIn ? "none" : "";
    container.querySelector("#drive-sync").style.display = state.signedIn ? "" : "none";
    container.querySelector("#drive-disconnect").style.display = state.signedIn ? "" : "none";
  };
  paintDrive();
  container.querySelector("#drive-connect").onclick = () => drive.login().catch((e) => alert(e.message));
  container.querySelector("#drive-sync").onclick = async (e) => {
    e.currentTarget.disabled = true;
    const res = await sync.syncWithDrive();
    if (res.changed) setRecipes(res.recipes, res.meta);
    e.currentTarget.disabled = false; paintDrive();
  };
  container.querySelector("#drive-disconnect").onclick = () => {
    if (!confirm(t("settings.driveConfirmDisconnect"))) return;
    drive.logout(); paintDrive();
  };
  drive.onAuthChange(paintDrive);
  sync.onStatus(paintDrive);

  /* ---------- Sprache ---------- */
  container.querySelectorAll("[data-setlang]").forEach((b) => {
    b.onclick = () => setLang(b.dataset.setlang); // löst Re-Render via onLangChange aus
  });

  /* ---------- Theme ---------- */
  getTheme().then((th) => {
    const r = container.querySelector(`input[name="set-theme"][value="${th}"]`);
    if (r) r.checked = true;
  });
  container.querySelectorAll('input[name="set-theme"]').forEach((r) => { r.onchange = () => setTheme(r.value); });
}
