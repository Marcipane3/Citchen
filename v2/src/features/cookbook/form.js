// form.js — Neues Rezept / Bearbeiten (Bottom-Sheet). v1-Parität P7.1–P7.5,
// Validierung gegen Schema v3 vor dem Speichern.

import { CATEGORIES, EFFORT_VALUES, DIFFICULTY_VALUES } from "../../data/schema.js";
import { addRecipe, updateRecipe } from "../../store.js";
import { esc, makeListEditor } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { openDetail } from "./detail.js";
import { t, tCat } from "../../i18n.js";

/**
 * Neues Rezept / Bearbeiten / Entwurf prüfen.
 * draft=true: existing füllt nur die Felder vor (Review-vor-Speichern,
 * z.B. aus der Erfassung) — gespeichert wird als NEUES Rezept via addRecipe.
 */
export function openForm(existing, { draft = false } = {}) {
  const prefill = existing || null;       // füllt die Felder
  const ed = draft ? null : prefill;      // nur echte Rezepte werden aktualisiert

  const html = `
    <div class="sheet-head"><span class="cat-label">${draft ? t("form.reviewDraft") : ed ? t("form.editRecipe") : t("form.newRecipe")}</span><button class="icon-btn close">✕</button></div>
    <label>${t("form.name")}</label><input class="f" id="f-name" placeholder="${t("form.namePlaceholder")}" />
    <label>${t("form.category")}</label>
    <select class="f" id="f-cat">${CATEGORIES.map((c) => `<option value="${esc(c)}" ${prefill && prefill.category === c ? "selected" : ""}>${esc(tCat(c))}</option>`).join("")}</select>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>${t("form.time")}</label><input class="f" id="f-time" placeholder="25 Min" /></div>
      <div style="flex:1"><label>${t("form.servings")}</label><input class="f" id="f-serv" value="~4" /></div>
    </div>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>${t("form.effort")}</label>
        <select class="f" id="f-effort"><option value="">${t("form.effortNone")}</option><option value="alltag">${t("form.effortAlltag")}</option><option value="besonders">${t("form.effortBesonders")}</option></select>
      </div>
      <div style="flex:1"><label>${t("form.difficulty")}</label>
        <select class="f" id="f-diff"><option value="">${t("form.effortNone")}</option>${DIFFICULTY_VALUES.filter(Boolean).map((d) => `<option>${d}</option>`).join("")}</select>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>${t("form.cuisine")}</label><input class="f" id="f-cuisine" placeholder="${t("form.cuisinePlaceholder")}" /></div>
      <div style="flex:1"><label>${t("form.season")}</label><input class="f" id="f-season" placeholder="${t("form.seasonPlaceholder")}" /></div>
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="f-mealprep"/> ${t("form.mealprep")}</label>
    <label class="check"><input type="checkbox" id="f-totry"/> ${t("form.totry")}</label>
    <label>${t("form.imageUrl")}</label><input class="f" id="f-image" placeholder="https://…" />
    <label>${t("form.ingredients")}</label><div id="f-ing"></div>
    <label>${t("form.steps")}</label><div id="f-steps"></div>
    <label>${t("form.tips")}</label><textarea class="f" id="f-tips" rows="3" placeholder="${t("form.tipsPlaceholder")}"></textarea>
    <button class="save-btn">${t("common.save")}</button>
  `;

  const { el, close } = openSheet(html);

  if (prefill) {
    el.querySelector("#f-name").value = prefill.name || "";
    el.querySelector("#f-time").value = prefill.time || "";
    el.querySelector("#f-serv").value = prefill.servings || "";
    el.querySelector("#f-image").value = prefill.image || "";
    el.querySelector("#f-tips").value = prefill.tips || "";
    el.querySelector("#f-effort").value = prefill.effort || "";
    el.querySelector("#f-diff").value = prefill.difficulty || "";
    el.querySelector("#f-cuisine").value = prefill.cuisine || "";
    el.querySelector("#f-season").value = prefill.season || "";
    el.querySelector("#f-mealprep").checked = !!prefill.mealPrep;
    el.querySelector("#f-totry").checked = !!prefill.toTry;
  }
  const getIng = makeListEditor(el.querySelector("#f-ing"), prefill ? prefill.ingredients : [], t("form.ingPlaceholder"), false);
  const getSteps = makeListEditor(el.querySelector("#f-steps"), prefill ? prefill.steps : [], t("form.stepPlaceholder"), true);

  let submitting = false;
  const saveBtn = el.querySelector(".save-btn");
  saveBtn.onclick = async () => {
    if (submitting) return;
    const name = el.querySelector("#f-name").value.trim();
    if (!name) { alert(t("form.nameMissing")); return; }
    submitting = true;
    saveBtn.disabled = true;
    saveBtn.textContent = t("common.saving");

    const fields = {
      name,
      category: el.querySelector("#f-cat").value,
      time: el.querySelector("#f-time").value.trim(),
      servings: el.querySelector("#f-serv").value.trim(),
      image: el.querySelector("#f-image").value.trim(),
      ingredients: getIng(),
      steps: getSteps(),
      tips: el.querySelector("#f-tips").value.trim(),
      effort: el.querySelector("#f-effort").value,
      difficulty: el.querySelector("#f-diff").value,
      cuisine: el.querySelector("#f-cuisine").value.trim(),
      season: el.querySelector("#f-season").value.trim(),
      mealPrep: el.querySelector("#f-mealprep").checked,
      toTry: el.querySelector("#f-totry").checked,
    };

    try {
      if (ed) {
        await updateRecipe(ed.id, (x) => Object.assign(x, fields));
        close();
        openDetail(ed.id); // v1-Verhalten: zurück zur Rezeptansicht
      } else {
        const saved = await addRecipe(fields);
        close();
        if (draft) openDetail(saved.id); // Review-Flow: das Ergebnis direkt zeigen
      }
    } catch (err) {
      submitting = false;
      saveBtn.disabled = false;
      saveBtn.textContent = t("common.save");
      alert(t("form.saveFailed", { e: err.message }));
    }
  };
}
