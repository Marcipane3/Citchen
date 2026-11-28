// move.js — P5 (#108): Einstellungen → „Umzug auf die neue Adresse“. Exportiert auf der alten Adresse,
// importiert auf der neuen. Die Regeln (was mit darf, Prüfung, leer füllen / nachfragen) stehen pur
// in data/moveFile.js; hier nur DOM, Speicherzugriff und die Rückfragen.

import { state, applySynced } from "../../store.js";
import * as db from "../../data/db.js";
import * as sync from "../../data/sync.js";
import {
  collectValues, writeValues, buildMoveFile, parseMoveFile, moveFileName,
  planMoveImport, writesFor, exportWarning, MoveRejected,
} from "../../data/moveFile.js";
import { deliverExportFile } from "../cookbook/export.js";
import { openSheet } from "../../ui/sheet.js";
import { esc } from "../../ui/helpers.js";
import { t } from "../../i18n.js";

const io = {
  kvGet: (k) => db.kvGet(k),
  kvSet: (k, v) => db.kvSet(k, v),
  storeGet: (s, id) => db.get(s, id),
  storePut: (s, row) => db.put(s, row),
  lsGet: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  lsSet: (k, v) => { localStorage.setItem(k, v); },
};

export function moveCardHtml() {
  return `
      <div class="card set-card" id="move-card">
        <h3>${t("settings.move.heading")}</h3>
        <p class="set-note">${t("settings.move.note")}</p>
        <p class="set-note" id="move-private" style="color:var(--danger);font-weight:600">${t("settings.move.private")}</p>
        <p class="set-note">${t("settings.move.keyNote")}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" id="move-export">${t("settings.move.exportBtn")}</button>
          <button class="btn-sec" id="move-import">${t("settings.move.importBtn")}</button>
        </div>
        <p class="set-note" id="move-status"></p>
      </div>`;
}

/** Rückfrage als Blatt mit zwei Knöpfen → Promise<true (erster Knopf) | false>. Schließen = false. */
function ask(cls, text, yes, no, extra = "") {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (!answered) { answered = true; resolve(v); } };
    const { el, close } = openSheet(`
      <div class="sheet-head"><span class="cat-label">${esc(t("settings.move.heading"))}</span><button class="icon-btn close" aria-label="${esc(t("common.close"))}">✕</button></div>
      <div class="${cls}">
        <p class="set-note">${esc(text)}</p>${extra}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn-primary move-yes">${esc(yes)}</button>
          <button class="btn-sec move-no">${esc(no)}</button>
        </div>
      </div>`, { onClose: () => done(false) });
    el.querySelector(".move-yes").onclick = () => { done(true); close(); };
    el.querySelector(".move-no").onclick = () => { done(false); close(); };
  });
}

export function wireMove(container) {
  const status = container.querySelector("#move-status");

  async function doExport() {
    const file = buildMoveFile(await collectValues(io), { from: location.origin + location.pathname });
    await deliverExportFile(file, moveFileName());
    status.textContent = t("settings.move.exported");
  }

  container.querySelector("#move-export").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    status.textContent = "";
    try {
      const warn = exportWarning(state.meta, state.signedIn);
      if (warn === "dirty") {
        if (await ask("move-warn-dirty", t("settings.move.warnDirty"), t("settings.move.syncFirst"), t("settings.move.exportAnyway"))) {
          applySynced(await sync.syncWithDrive());
          if (exportWarning(state.meta, state.signedIn)) { status.textContent = t("settings.move.syncFailed"); return; }
        }
      } else if (warn === "local") {
        if (!await ask("move-warn-local", t("settings.move.warnLocal"), t("settings.move.exportAnyway"), t("common.cancel"))) return;
      }
      await doExport();
    } catch (err) {
      status.textContent = t("settings.move.exportFail", { msg: err.message });
    } finally {
      btn.disabled = false;
    }
  };

  async function importText(text) {
    let parsed;
    try { parsed = parseMoveFile(text); }
    catch (err) {
      if (err instanceof MoveRejected) { status.textContent = t("settings.move.err." + err.code); return; }
      throw err;
    }
    const plan = planMoveImport(parsed.data, await collectValues(io));
    let replace = false;
    if (plan.conflicts.length) {
      const list = `<ul class="set-note move-conflicts">${plan.conflicts.map((s) => `<li>${esc(t("settings.move.section." + s))}</li>`).join("")}</ul>`;
      replace = await ask("move-conflict", t("settings.move.conflictBody"), t("settings.move.replace"), t("settings.move.keep"), list);
    }
    const writes = writesFor(plan, replace);
    if (!Object.keys(writes).length) { status.textContent = t("settings.move.nothing"); return; }
    await writeValues(writes, io);
    // Neu laden: Sprache, Theme, Listen-Abgleich und Freunde-Link lesen ihren Stand beim Start.
    alert(t("settings.move.imported"));
    location.reload();
  }

  container.querySelector("#move-import").onclick = () => {
    status.textContent = "";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      try { await importText(await file.text()); }
      catch (err) { status.textContent = t("settings.move.readFail", { msg: err.message }); }
    });
    input.addEventListener("cancel", () => input.remove());
    input.click();
  };
}
