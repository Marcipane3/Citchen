// importFile.js — Import-Datei wählen, lesen, speichern, Ergebnis zeigen (G2.3).
// Kern (parse/plan/summarize) ist pur in data/recipeImport.js; hier nur DOM + Store.

import { parseImportFile, summarizeImport } from "../../data/recipeImport.js";
import { importRecipes } from "../../store.js";
import { openSheet } from "../../ui/sheet.js";
import { esc } from "../../ui/helpers.js";
import { t } from "../../i18n.js";

function resultSheet(summary) {
  const failed = summary.imported === 0 && summary.skipped > 0;
  const line = failed
    ? t("importFile.invalid")
    : [t("importFile.imported", { n: summary.imported }),
       t("importFile.skipped", { n: summary.skipped }),
       t("importFile.renamed", { n: summary.renamed })].join(" · ");
  const reasons = summary.reasons.length
    ? `<ul class="import-reasons">${summary.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "";
  const { el, close } = openSheet(`
    <div class="sheet-head"><span class="cat-label">${esc(t("importFile.title"))}</span><button class="icon-btn close" aria-label="${esc(t("common.close"))}">✕</button></div>
    <p class="import-summary ${failed ? "err" : ""}">${esc(line)}</p>${reasons}
    <button class="btn-primary import-done">${esc(t("common.done"))}</button>`);
  el.querySelector(".close").onclick = close;
  el.querySelector(".import-done").onclick = close;
}

export async function importText(text) {
  const { recipes, errors } = parseImportFile(text);
  if (!recipes.length) { resultSheet(summarizeImport({ toAdd: [], skipped: [], renamed: [] }, errors.length ? errors : ["–"])); return; }
  let plan;
  try { plan = await importRecipes(recipes); }
  catch (e) { alert(t("importFile.saveFail", { msg: e.message })); return; }
  resultSheet(summarizeImport(plan, errors));
}

/** Dateiauswahl öffnen (Klick muss aus der Nutzergeste kommen); Fehler beim Lesen → Meldung, nichts geändert. */
export function pickAndImport() {
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
    catch (e) { alert(t("importFile.readFail", { msg: e.message })); }
  });
  input.addEventListener("cancel", () => input.remove());
  input.click();
}
