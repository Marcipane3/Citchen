// capture.js — 📸 Rezept erfassen (#/capture). Foto-Scan + URL-Import (beide
// KI/BYOK, key-gated) + manueller Pfad. Review-vor-Speichern über openForm(draft).
// C2: Fortschritt + Meldungen erscheinen IN der Karte, die man angetippt hat (vorher ganz
// unten, auf dem Handy außer Sicht); es läuft immer nur EINE KI-Analyse gleichzeitig.
// C3: Koch-Profil + Vorrat fließen in die Prompts (KI-Ideen nach Profil, 🛒-Marker).

import * as gate from "../../ai/gate.js";
import { VISION_MODEL } from "../../ai/client.js";
import { AiError } from "../../ai/client.js";
import { parseCapture, draftFromInput, parseBulk, CaptureDisabledError, CaptureParseError } from "./parse.js";
import { esc, appHeader, wireHeader } from "../../ui/helpers.js";
import { addRecipe } from "../../store.js";
import { getTotalMinutes } from "../../data/derive.js";
import { getProfile, getStaples } from "../../data/settings.js";
import { openForm } from "../cookbook/form.js";
import { BUILD } from "../../version.js";
import { t } from "../../i18n.js";

/** Fehler → übersetzte Meldung (HTML). Codes aus parse.js, AiError-Arten aus client.js. */
function errorHtml(e) {
  if (e instanceof AiError && e.kind === "auth") return `⚠️ ${esc(e.message)} <a href="#/settings">${t("nav.settings")}</a>`;
  if (e instanceof CaptureDisabledError) return "🟡 " + t("capture.err.disabled");
  if (e instanceof CaptureParseError) {
    const msg = t("capture.err." + e.code);
    return "⚠️ " + esc(e.code === "invalid" && e.detail ? `${msg} (${e.detail})` : msg);
  }
  return "⚠️ " + esc(t("capture.parseFailed", { e: e.message }));
}

export function renderCapture(container) {
  const reason = gate.aiUnavailableReason();
  const aiNote = reason === "offline"
    ? `🟡 ${t("capture.offlineNote")}`
    : reason === "nokey"
      ? `${t("capture.lockedNote")} (<a href="#/settings">${t("nav.settings")}</a>)`
      : t("capture.keyOk");
  let photoFile = null;
  let photoUrl = null;   // Object-URL der Vorschau (wird freigegeben)
  let running = false;   // nur eine KI-Analyse gleichzeitig

  container.innerHTML = `
    ${appHeader({ icon: "📸", title: t("capture.title"), sub: t("capture.subtitle"), source: "capture" })}
    <main class="app-main">

      <div class="card set-card">
        <h3>${t("capture.howHeading")}</h3>
        <p class="set-note">${t("capture.howBody")}</p>
        <p class="set-note">${aiNote} · ${esc(VISION_MODEL)}</p>
      </div>

      <div class="card set-card" id="card-photo">
        <h3>${t("capture.photoHeading")}</h3>
        <button class="photo-add" id="cap-photo">${t("detail.addPhoto")}</button>
        <div id="cap-preview"></div>
        <button class="btn-primary ai-run" id="cap-photo-analyze" style="width:100%;margin-top:10px;display:none">${t("capture.analyze")}</button>
        <div class="cap-slot" aria-live="polite"></div>
      </div>

      <div class="card set-card" id="card-url">
        <h3>${t("capture.urlHeading")}</h3>
        <form id="cap-url-form" style="display:flex;gap:8px">
          <input class="f" id="cap-url" type="url" inputmode="url" enterkeyhint="go" placeholder="${t("capture.urlPlaceholder")}" style="flex:1" />
          <button class="btn-primary ai-run" id="cap-url-analyze" type="submit">${t("capture.urlAnalyze")}</button>
        </form>
        <div class="cap-slot" aria-live="polite"></div>
      </div>

      <div class="card set-card" id="card-bulk">
        <h3>${t("capture.bulkHeading")}</h3>
        <p class="set-note">${t("capture.bulkBody")}</p>
        <textarea class="f" id="cap-bulk" rows="5" placeholder="${t("capture.bulkPlaceholder")}"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-primary ai-run" id="cap-bulk-text">${t("capture.bulkFromText")}</button>
          <button class="btn-sec ai-run" id="cap-bulk-gen">${t("capture.bulkGenerate")}</button>
        </div>
        <div class="cap-slot" aria-live="polite"></div>
        <div id="cap-bulk-review"></div>
      </div>

      <div class="card set-card">
        <h3>${t("capture.manualHeading")}</h3>
        <p class="set-note">${t("capture.manualBody")}</p>
        <button class="btn-sec" id="cap-manual" style="width:100%">${t("capture.manualBtn")}</button>
      </div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  wireHeader(container, "capture");
  const preview = container.querySelector("#cap-preview");
  const photoAnalyzeBtn = container.querySelector("#cap-photo-analyze");
  const urlInput = container.querySelector("#cap-url");
  const slotOf = (cardId) => container.querySelector(`#${cardId} .cap-slot`);

  /** Meldung in der Karte zeigen (und in Sicht scrollen). */
  function say(slot, html) {
    slot.innerHTML = html ? `<p class="set-note cap-msg">${html}</p>` : "";
    if (html) slot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function requireKey(slot) {
    const r = gate.aiUnavailableReason();
    if (!r) return true;
    say(slot, r === "offline"
      ? `📡 ${t("capture.offlineNote")}`
      : `${t("capture.lockedNote")} — <a href="#/settings">${t("nav.settings")}</a>`);
    return false;
  }

  // A2: sichtbarer Arbeits-Zustand (Spinner + zweistufiger Text) — jetzt in der aktiven Karte.
  let buildTimer = null;
  function showBusy(slot, text) {
    slot.innerHTML = `<div class="cap-busy"><div class="spinner"></div><div><div class="cap-busy-text">${esc(text)}</div><div class="cap-busy-sub">${t("capture.analyzing")}</div></div></div>`;
    slot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function stopBusyTimer() { if (buildTimer) { clearTimeout(buildTimer); buildTimer = null; } }

  /** Während einer Analyse alle KI-Knöpfe sperren (kein Doppel-Tippen, keine Parallel-Läufe). */
  function lock(on) {
    running = on;
    container.querySelectorAll(".ai-run").forEach((b) => { b.disabled = on; });
  }

  // A1: nach erfolgreicher Analyse ist die Erfassung ein sauberes Blatt.
  function resetPhotoAndUrl() {
    photoFile = null;
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    preview.innerHTML = "";
    photoAnalyzeBtn.style.display = "none";
    urlInput.value = "";
  }

  async function runParse(input, slot) {
    if (running || !requireKey(slot)) return;
    lock(true);
    showBusy(slot, t("capture.reading"));
    // Nach kurzer Zeit auf „baue zusammen“ wechseln — beides passiert im selben KI-Aufruf.
    buildTimer = setTimeout(() => showBusy(slot, t("capture.building")), 1600);
    try {
      const staples = await getStaples().catch(() => []);
      const draft = await parseCapture({ ...input, staples });
      stopBusyTimer();
      resetPhotoAndUrl();
      say(slot, "✓ " + t("capture.gotRecipe"));
      openForm(draft, { draft: true });  // Review-vor-Speichern
    } catch (e) {
      stopBusyTimer();
      say(slot, errorHtml(e));
    } finally {
      lock(false);
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
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(f);
      preview.innerHTML = `<img class="cap-thumb" src="${photoUrl}" alt="">`;
      photoAnalyzeBtn.style.display = "";
      say(slotOf("card-photo"), "");
    };
    inp.click();
  };
  photoAnalyzeBtn.onclick = () => { if (photoFile) runParse({ photoBlob: photoFile, note: "Foto: " + photoFile.name }, slotOf("card-photo")); };

  // URL analysieren — Knopf ODER Enter/„Los“ auf der Tastatur
  container.querySelector("#cap-url-form").onsubmit = (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    const slot = slotOf("card-url");
    if (!url) { say(slot, t("capture.enterUrl")); return; }
    runParse({ url }, slot);
  };

  // Manuell
  container.querySelector("#cap-manual").onclick = () => openForm(draftFromInput({}), { draft: true });

  /* ---------- C1: Mehrere Rezepte auf einmal ---------- */
  const bulkInput = container.querySelector("#cap-bulk");
  const bulkReview = container.querySelector("#cap-bulk-review");
  const bulkSlot = slotOf("card-bulk");

  async function runBulk({ generate }) {
    if (running || !requireKey(bulkSlot)) return;
    const text = bulkInput.value.trim();
    if (!generate && !text) { say(bulkSlot, t("capture.bulkNeedsText")); return; }
    bulkReview.innerHTML = "";
    lock(true);
    showBusy(bulkSlot, generate ? t("capture.building") : t("capture.reading"));
    try {
      const [profile, staples] = await Promise.all([getProfile().catch(() => null), getStaples().catch(() => [])]);
      const recipes = await parseBulk({ text, generate, wish: generate ? text : "", count: 6, profile, staples });
      say(bulkSlot, "");
      renderBulkReview(recipes);
    } catch (e) {
      say(bulkSlot, errorHtml(e));
    } finally {
      lock(false);
    }
  }

  function bulkRow(r, i) {
    const mins = getTotalMinutes(r);
    const sub = [esc(r.category), mins ? esc(t("capture.bulkMins", { n: mins })) : "", esc(t("capture.bulkIngs", { n: r.ingredients.length }))]
      .filter(Boolean).join(" · ");
    return `<label class="bulk-row" data-row="${i}">
      <input type="checkbox" class="bulk-cb" data-i="${i}" checked />
      <span class="bulk-meta"><span class="bulk-name">${esc(r.name)}</span><span class="bulk-sub">${sub}</span></span>
      <button type="button" class="btn-sec bulk-edit" data-i="${i}">${t("capture.bulkEdit")}</button>
    </label>`;
  }

  function renderBulkReview(recipes) {
    bulkReview.innerHTML = `
      <p class="set-note" style="margin-top:12px">${t("capture.bulkReview", { n: recipes.length })}</p>
      <div id="bulk-list">${recipes.map(bulkRow).join("")}</div>
      <button class="btn-primary" id="bulk-save" style="width:100%;margin-top:10px">${t("capture.bulkSave")}</button>`;

    // C2-Fix: „Bearbeiten“ speichert NICHT mehr sofort (vorher → Duplikat beim Sammel-Speichern),
    // sondern übernimmt die Änderungen in die Liste; gespeichert wird nur über „Ausgewählte speichern“.
    bulkReview.querySelectorAll(".bulk-edit").forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        const i = +b.dataset.i;
        openForm(recipes[i], {
          draft: true,
          onSubmit: (fields) => {
            recipes[i] = { ...recipes[i], ...fields };
            const row = bulkReview.querySelector(`[data-row="${i}"]`);
            const checked = row.querySelector(".bulk-cb").checked;
            row.outerHTML = bulkRow(recipes[i], i);
            const fresh = bulkReview.querySelector(`[data-row="${i}"]`);
            fresh.querySelector(".bulk-cb").checked = checked;
            fresh.querySelector(".bulk-edit").onclick = b.onclick;
            say(bulkSlot, "✓ " + t("capture.bulkEdited"));
          },
        });
      };
    });
    bulkReview.querySelector("#bulk-save").onclick = async (e) => {
      const picked = [...bulkReview.querySelectorAll(".bulk-cb")].filter((c) => c.checked).map((c) => recipes[+c.dataset.i]);
      if (!picked.length) { say(bulkSlot, t("capture.bulkNonePicked")); return; }
      e.currentTarget.disabled = true;
      let saved = 0;
      for (const r of picked) { try { await addRecipe(r); saved++; } catch (_) { /* unten gemeldet */ } }
      bulkReview.innerHTML = "";
      bulkInput.value = "";
      const failed = picked.length - saved;
      say(bulkSlot, t("capture.bulkSaved", { n: saved }) + (failed ? " ⚠️ " + t("capture.bulkSomeFailed", { n: failed }) : ""));
    };
  }

  container.querySelector("#cap-bulk-text").onclick = () => runBulk({ generate: false });
  container.querySelector("#cap-bulk-gen").onclick = () => runBulk({ generate: true });
}
