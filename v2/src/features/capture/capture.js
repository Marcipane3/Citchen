// capture.js — 📸 Rezept erfassen (#/capture). Foto-Scan + URL-Import (beide
// KI/BYOK, key-gated) + manueller Pfad. Review-vor-Speichern über openForm(draft).

import * as gate from "../../ai/gate.js";
import { VISION_MODEL } from "../../ai/client.js";
import { AiError } from "../../ai/client.js";
import { parseCapture, draftFromInput, CaptureDisabledError, CaptureParseError } from "./parse.js";
import { esc } from "../../ui/helpers.js";
import { openForm } from "../cookbook/form.js";
import { openMenu } from "../menu.js";
import { navigate } from "../../router.js";
import { BUILD } from "../../version.js";
import { t } from "../../i18n.js";

export function renderCapture(container) {
  const hasKey = gate.isPremium();
  let photoFile = null;

  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l"><span style="font-size:24px">📸</span><div><h1>${t("capture.title")}</h1><div class="sub">${t("capture.subtitle")}</div></div></div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
    </header>
    <main class="app-main">

      <div class="card set-card">
        <h3>${t("capture.howHeading")}</h3>
        <p class="set-note">${t("capture.howBody")}</p>
        <p class="set-note">${hasKey ? t("capture.keyOk") : `${t("capture.lockedNote")} (<a href="#/settings">${t("nav.settings")}</a>)`} · ${esc(VISION_MODEL)}</p>
      </div>

      <div class="card set-card">
        <h3>${t("capture.photoHeading")}</h3>
        <button class="photo-add" id="cap-photo">${t("detail.addPhoto")}</button>
        <div id="cap-preview"></div>
        <button class="btn-primary" id="cap-photo-analyze" style="width:100%;margin-top:10px;display:none">${t("capture.analyze")}</button>
      </div>

      <div class="card set-card">
        <h3>${t("capture.urlHeading")}</h3>
        <div style="display:flex;gap:8px">
          <input class="f" id="cap-url" type="url" placeholder="${t("capture.urlPlaceholder")}" style="flex:1" />
          <button class="btn-primary" id="cap-url-analyze">${t("capture.urlAnalyze")}</button>
        </div>
      </div>

      <div class="card set-card">
        <h3>${t("capture.manualHeading")}</h3>
        <p class="set-note">${t("capture.manualBody")}</p>
        <button class="btn-sec" id="cap-manual" style="width:100%">${t("capture.manualBtn")}</button>
      </div>

      <p class="set-note" id="cap-status" style="text-align:center"></p>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("capture");
  const status = container.querySelector("#cap-status");
  const preview = container.querySelector("#cap-preview");
  const photoAnalyzeBtn = container.querySelector("#cap-photo-analyze");

  function requireKey() {
    if (gate.isPremium()) return true;
    status.innerHTML = `🔒 ${t("capture.lockedNote")} — <a href="#/settings">${t("nav.settings")}</a>`;
    return false;
  }

  async function runParse(input, btn) {
    if (!requireKey()) return;
    const label = btn.textContent;
    btn.disabled = true;
    status.textContent = t("capture.analyzing");
    try {
      const draft = await parseCapture(input);
      status.textContent = t("capture.gotRecipe");
      openForm(draft, { draft: true }); // Review-vor-Speichern
    } catch (e) {
      if (e instanceof CaptureDisabledError) {
        status.textContent = "🟡 " + e.message;
      } else if (e instanceof AiError && e.kind === "auth") {
        status.innerHTML = `⚠️ ${esc(e.message)} <a href="#/settings">${t("nav.settings")}</a>`;
      } else {
        status.textContent = t("capture.parseFailed", { e: (e instanceof CaptureParseError || e instanceof AiError) ? e.message : e.message });
      }
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // Foto wählen → Vorschau + Analysieren freischalten
  container.querySelector("#cap-photo").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.style.cssText = "position:fixed;left:-9999px;opacity:0";
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      photoFile = f;
      preview.innerHTML = `<img class="cap-thumb" src="${URL.createObjectURL(f)}" alt="">`;
      photoAnalyzeBtn.style.display = "";
    };
    inp.click();
  };
  photoAnalyzeBtn.onclick = (e) => { if (photoFile) runParse({ photoBlob: photoFile, note: "Foto: " + photoFile.name }, e.currentTarget); };

  // URL analysieren
  container.querySelector("#cap-url-analyze").onclick = (e) => {
    const url = container.querySelector("#cap-url").value.trim();
    if (!url) { status.textContent = t("capture.enterUrl"); return; }
    runParse({ url }, e.currentTarget);
  };

  // Manuell
  container.querySelector("#cap-manual").onclick = () => openForm(draftFromInput({}), { draft: true });
}
