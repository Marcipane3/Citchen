// form.js — Neues Rezept / Bearbeiten (Bottom-Sheet). v1-Parität P7.1–P7.5,
// Validierung gegen Schema v3 vor dem Speichern.

import { CATEGORIES, EFFORT_VALUES, DIFFICULTY_VALUES } from "../../data/schema.js";
import { addRecipe, updateRecipe } from "../../store.js";
import { esc, makeListEditor } from "../../ui/helpers.js";
import { openSheet } from "../../ui/sheet.js";
import { openDetail } from "./detail.js";

export function openForm(existing) {
  const ed = existing || null;

  const html = `
    <div class="sheet-head"><span class="cat-label">${ed ? "Rezept bearbeiten" : "Neues Rezept"}</span><button class="icon-btn close">✕</button></div>
    <label>Name</label><input class="f" id="f-name" placeholder="z.B. Linsensuppe" />
    <label>Kategorie</label>
    <select class="f" id="f-cat">${CATEGORIES.map((c) => `<option ${ed && ed.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>Zeit</label><input class="f" id="f-time" placeholder="25 Min" /></div>
      <div style="flex:1"><label>Portionen</label><input class="f" id="f-serv" value="~4" /></div>
    </div>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>Aufwand</label>
        <select class="f" id="f-effort"><option value="">—</option><option value="alltag">⚡ Alltag</option><option value="besonders">✨ Besonders</option></select>
      </div>
      <div style="flex:1"><label>Schwierigkeit</label>
        <select class="f" id="f-diff"><option value="">—</option>${DIFFICULTY_VALUES.filter(Boolean).map((d) => `<option>${d}</option>`).join("")}</select>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>Küche</label><input class="f" id="f-cuisine" placeholder="z.B. Italienisch" /></div>
      <div style="flex:1"><label>Saison</label><input class="f" id="f-season" placeholder="optional" /></div>
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="f-mealprep"/> 🍱 Meal-Prep (hält ~4 Tage)</label>
    <label class="check"><input type="checkbox" id="f-totry"/> 🆕 Zu probieren (noch nie gekocht)</label>
    <label>Bild-URL (optional)</label><input class="f" id="f-image" placeholder="https://… (Titelbild)" />
    <label>Zutaten</label><div id="f-ing"></div>
    <label>Zubereitung</label><div id="f-steps"></div>
    <label>Tipps (optional)</label><textarea class="f" id="f-tips" rows="3" placeholder="Konvention: Topping: … Swap: … Alltags-Upgrade: …"></textarea>
    <button class="save-btn">Speichern</button>
  `;

  const { el, close } = openSheet(html);

  if (ed) {
    el.querySelector("#f-name").value = ed.name || "";
    el.querySelector("#f-time").value = ed.time || "";
    el.querySelector("#f-serv").value = ed.servings || "";
    el.querySelector("#f-image").value = ed.image || "";
    el.querySelector("#f-tips").value = ed.tips || "";
    el.querySelector("#f-effort").value = ed.effort || "";
    el.querySelector("#f-diff").value = ed.difficulty || "";
    el.querySelector("#f-cuisine").value = ed.cuisine || "";
    el.querySelector("#f-season").value = ed.season || "";
    el.querySelector("#f-mealprep").checked = !!ed.mealPrep;
    el.querySelector("#f-totry").checked = !!ed.toTry;
  }
  const getIng = makeListEditor(el.querySelector("#f-ing"), ed ? ed.ingredients : [], "z.B. 2 Eier", false);
  const getSteps = makeListEditor(el.querySelector("#f-steps"), ed ? ed.steps : [], "Schritt beschreiben…", true);

  let submitting = false;
  const saveBtn = el.querySelector(".save-btn");
  saveBtn.onclick = async () => {
    if (submitting) return;
    const name = el.querySelector("#f-name").value.trim();
    if (!name) { alert("Name fehlt"); return; }
    submitting = true;
    saveBtn.disabled = true;
    saveBtn.textContent = "Speichere…";

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
        await addRecipe(fields);
        close();
      }
    } catch (err) {
      submitting = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Speichern";
      alert("Speichern fehlgeschlagen: " + err.message);
    }
  };
}
