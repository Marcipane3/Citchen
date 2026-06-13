// capture.js — 📸 Rezept erfassen (#/capture). Foto-Scan + URL-Import (beide
// KI/BYOK, key-gated) + manueller Pfad. Review-vor-Speichern über openForm(draft).

import * as gate from "../../ai/gate.js";
import { VISION_MODEL } from "../../ai/client.js";
import { AiError } from "../../ai/client.js";
import { parseCapture, draftFromInput, parseBulk, CaptureDisabledError, CaptureParseError } from "./parse.js";
import { esc } from "../../ui/helpers.js";
import { addRecipe } from "../../store.js";
import { getTotalMinutes } from "../../data/derive.js";
import { openForm } from "../cookbook/form.js";
import { openMenu } from "../menu.js";
import { navigate } from "../../router.js";
import { BUILD } from "../../version.js";
import { t } from "../../i18n.js";

export function renderCapture(container) {
  const reason = gate.aiUnavailableReason();
  const aiNote = reason === "offline"
    ? `🟡 ${t("capture.offlineNote")}`
    : reason === "nokey"
      ? `${t("capture.lockedNote")} (<a href="#/settings">${t("nav.settings")}</a>)`
      : t("capture.keyOk");
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
        <p class="set-note">${aiNote} · ${esc(VISION_MODEL)}</p>
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
        <h3>${t("capture.bulkHeading")}</h3>
        <p class="set-note">${t("capture.bulkBody")}</p>
        <textarea class="f" id="cap-bulk" rows="5" placeholder="${t("capture.bulkPlaceholder")}"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-primary" id="cap-bulk-text">${t("capture.bulkFromText")}</button>
          <button class="btn-sec" id="cap-bulk-gen">${t("capture.bulkGenerate")}</button>
        </div>
        <div id="cap-bulk-review"></div>
      </div>

      <div class="card set-card">
        <h3>${t("capture.manualHeading")}</h3>
        <p class="set-note">${t("capture.manualBody")}</p>
        <button class="btn-sec" id="cap-manual" style="width:100%">${t("capture.manualBtn")}</button>
      </div>

      <div id="cap-busy"></div>
      <p class="set-note" id="cap-status" style="text-align:center"></p>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  container.querySelector("#menuBtn").onclick = () => openMenu("capture");
  const status = container.querySelector("#cap-status");
  const preview = container.querySelector("#cap-preview");
  const busy = container.querySelector("#cap-busy");
  const photoAnalyzeBtn = container.querySelector("#cap-photo-analyze");
  const urlInput = container.querySelector("#cap-url");

  function requireKey() {
    const r = gate.aiUnavailableReason();
    if (!r) return true;
    status.innerHTML = r === "offline"
      ? `📡 ${t("capture.offlineNote")}`
      : `🔒 ${t("capture.lockedNote")} — <a href="#/settings">${t("nav.settings")}</a>`;
    return false;
  }

  // A2: sichtbarer Arbeits-Zustand (Spinner + zweistufiger Text).
  let buildTimer = null;
  function showBusy(text) {
    busy.innerHTML = `<div class="cap-busy"><div class="spinner"></div><div><div class="cap-busy-text">${esc(text)}</div><div class="cap-busy-sub">${t("capture.analyzing")}</div></div></div>`;
  }
  function hideBusy() {
    if (buildTimer) { clearTimeout(buildTimer); buildTimer = null; }
    busy.innerHTML = "";
  }

  // A1: nach Speichern/Abbruch ist die Erfassung ein sauberes Blatt.
  function resetCaptureUI() {
    photoFile = null;
    preview.innerHTML = "";
    photoAnalyzeBtn.style.display = "none";
    if (urlInput) urlInput.value = "";
    hideBusy();
    status.textContent = "";
  }

  async function runParse(input, btn) {
    if (!requireKey()) return;
    const label = btn.textContent;
    btn.disabled = true;
    status.textContent = "";
    showBusy(t("capture.reading"));
    // Nach kurzer Zeit auf „baue zusammen“ wechseln — fühlt sich responsiv an
    // (beides passiert real innerhalb des einen Vision-Aufrufs).
    buildTimer = setTimeout(() => showBusy(t("capture.building")), 1600);
    try {
      const draft = await parseCapture(input);
      resetCaptureUI();                  // A1: Vorschau/Foto/URL zurücksetzen
      status.textContent = t("capture.gotRecipe");
      openForm(draft, { draft: true });  // Review-vor-Speichern
    } catch (e) {
      hideBusy();
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

  /* ---------- C1: Mehrere Rezepte auf einmal ---------- */
  const bulkInput = container.querySelector("#cap-bulk");
  const bulkReview = container.querySelector("#cap-bulk-review");

  async function runBulk({ generate }, btn) {
    if (!requireKey()) return;
    const text = bulkInput.value.trim();
    if (!generate && !text) { status.textContent = t("capture.bulkNeedsText"); return; }
    bulkReview.innerHTML = "";
    btn.disabled = true;
    showBusy(generate ? t("capture.building") : t("capture.reading"));
    try {
      const recipes = await parseBulk({ text, generate, wish: generate ? text : "", count: 6 });
      hideBusy();
      renderBulkReview(recipes);
    } catch (e) {
      hideBusy();
      if (e instanceof CaptureDisabledError) status.textContent = "🟡 " + e.message;
      else if (e instanceof AiError && e.kind === "auth") status.innerHTML = `⚠️ ${esc(e.message)} <a href="#/settings">${t("nav.settings")}</a>`;
      else status.textContent = t("capture.parseFailed", { e: e.message });
    } finally {
      btn.disabled = false;
    }
  }

  function renderBulkReview(recipes) {
    bulkReview.innerHTML = `
      <p class="set-note" style="margin-top:12px">${t("capture.bulkReview", { n: recipes.length })}</p>
      <div id="bulk-list">${recipes.map((r, i) => {
        const mins = getTotalMinutes(r);
        return `<label class="bulk-row">
          <input type="checkbox" class="bulk-cb" data-i="${i}" checked />
          <span class="bulk-meta"><span class="bulk-name">${esc(r.name)}</span>
          <span class="bulk-sub">${esc(r.category)}${mins ? " · " + mins + " Min" : ""} · ${r.ingredients.length} Zutaten</span></span>
          <button type="button" class="btn-sec bulk-edit" data-i="${i}">${t("capture.bulkEdit")}</button>
        </label>`;
      }).join("")}</div>
      <button class="btn-primary" id="bulk-save" style="width:100%;margin-top:10px">${t("capture.bulkSave")}</button>`;

    bulkReview.querySelectorAll(".bulk-edit").forEach((b) => {
      b.onclick = (e) => { e.preventDefault(); openForm(recipes[+b.dataset.i], { draft: true }); };
    });
    bulkReview.querySelector("#bulk-save").onclick = async (e) => {
      const picked = [...bulkReview.querySelectorAll(".bulk-cb")].filter((c) => c.checked).map((c) => recipes[+c.dataset.i]);
      if (!picked.length) { status.textContent = t("capture.bulkNonePicked"); return; }
      e.currentTarget.disabled = true;
      let saved = 0;
      for (const r of picked) { try { await addRecipe(r); saved++; } catch (_) { /* skip */ } }
      bulkReview.innerHTML = "";
      bulkInput.value = "";
      status.textContent = t("capture.bulkSaved", { n: saved });
    };
  }

  container.querySelector("#cap-bulk-text").onclick = (e) => runBulk({ generate: false }, e.currentTarget);
  container.querySelector("#cap-bulk-gen").onclick = (e) => runBulk({ generate: true }, e.currentTarget);
}
