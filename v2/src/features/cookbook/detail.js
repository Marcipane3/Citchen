// detail.js — Rezept-Detailansicht (Bottom-Sheet). v1-Parität P5.1–P5.13
// plus v2: strukturierte Tipps prominent (Priorität laut Spec).

import { state, getRecipe, updateRecipe, deleteRecipe } from "../../store.js";
import * as drive from "../../data/drive.js";
import { parseTipps, hasStructuredTipps } from "../../data/derive.js";
import { esc, metaBadges, loadHeroInto, compressImage } from "../../ui/helpers.js";
import { openSheet, closeAllSheets } from "../../ui/sheet.js";
import { openForm } from "./form.js";
import { navigate } from "../../router.js";

function tippsHTML(r) {
  if (!r.tips) return "";
  const p = parseTipps(r.tips);
  if (!hasStructuredTipps(p)) {
    return `<h3>Tipps</h3><p class="tips-box">${esc(p.rest || r.tips)}</p>`;
  }
  return `
    <h3>Tipps</h3>
    <div class="tips-box">
      ${p.toppings.length ? `<div class="tipp-sec"><span class="tl">🧀 Topping</span><br>${p.toppings.map(esc).join("<br>")}</div>` : ""}
      ${p.variationen.length ? `<div class="tipp-sec"><span class="tl">🔄 Variation</span><br>${p.variationen.map(esc).join("<br>")}</div>` : ""}
      ${p.alltagsUpgrade ? `<div class="tipp-sec"><span class="tl">✨ Alltags-Upgrade</span><br>${esc(p.alltagsUpgrade)}</div>` : ""}
      ${p.technik ? `<div class="tipp-sec"><span class="tl">🧑‍🍳 Technik</span><br>${esc(p.technik)}</div>` : ""}
      ${p.rest ? `<div class="tipp-sec">${esc(p.rest)}</div>` : ""}
    </div>`;
}

export function openDetail(id) {
  const r = getRecipe(id);
  if (!r) return;

  const html = `
    <div class="sheet-head">
      <span class="cat-label">${esc(r.category)}</span>
      <div class="hd-r">
        <button class="heart" title="Favorit">${r.favorite ? "♥" : "♡"}</button>
        <button class="icon-btn close">✕</button>
      </div>
    </div>
    <div class="hero" data-hero="${esc(r.id)}"></div>
    <div class="detail-name">${esc(r.name)}</div>
    <div class="stars" data-rate>${[1, 2, 3, 4, 5].map((i) => `<span class="star ${i <= r.rating ? "on" : ""}" data-v="${i}">★</span>`).join("")}</div>
    <div class="rmeta">${r.time ? `⏱ ${esc(r.time)}` : ""} ${r.servings ? `· 🍽 ${esc(r.servings)}` : ""} ${r.cookedCount ? `· ${r.cookedCount}× gekocht` : ""}</div>
    ${metaBadges(r) ? `<div class="badges">${metaBadges(r)}</div>` : ""}
    ${(r.prepTime || r.cookTime || r.totalTime) ? `<p style="font-size:13px;color:var(--muted);margin-top:4px">⏱ ${[r.prepTime ? `Vorb. ${r.prepTime}′` : "", r.cookTime ? `Koch ${r.cookTime}′` : "", r.totalTime ? `Gesamt ${r.totalTime}′` : ""].filter(Boolean).join(" · ")}</p>` : ""}
    ${r.lastCooked ? `<p style="font-size:13px;color:var(--muted);font-style:italic;margin-top:4px">Zuletzt gekocht: ${esc(r.lastCooked)}</p>` : ""}

    <button class="photo-add">📷 Foto aufnehmen oder hochladen</button>
    ${r.photos && r.photos.length ? `<div class="photostrip">${r.photos.map((p) => `
      <div class="ph"><div class="thumb" data-photo="${esc(p.id)}"></div><button class="rm" data-rm="${esc(p.id)}">✕</button></div>`).join("")}</div>` : ""}

    ${r.ingredients && r.ingredients.length ? `<h3>Zutaten</h3><ul>${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      <button class="btn-sec add-ing-shop" style="width:100%;margin-top:6px">🛒 Zutaten zur Einkaufsliste</button>` : ""}
    ${r.steps && r.steps.length ? `<h3>Zubereitung</h3><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
    ${tippsHTML(r)}

    <h3>💬 Notiz für Claude</h3>
    <textarea class="f fb" placeholder='Was hat gefehlt oder wie war’s? z.B. „zu wenig Schärfe", „brauchte 10 Min länger", „mehr Knoblauch"…'>${esc(r.feedback || "")}</textarea>
    <button class="btn-sec fb-save" style="margin-top:8px">Notiz speichern</button>
    <p class="fb-note">Beim nächsten Claude-Lauf wird dein Rezept anhand dieser Notiz angepasst und die Notiz danach geleert.</p>

    <div class="actions">
      <button class="btn-primary btn-cook act-cook">👨‍🍳 Kochmodus</button>
      <button class="btn-primary cooked">✓ Heute gekocht</button>
      <button class="btn-sec edit">✎ Bearbeiten</button>
      <button class="btn-sec btn-del del">🗑 Löschen</button>
    </div>
    <button class="btn-sec back" style="width:100%;margin-top:10px">← Zurück zur Übersicht</button>
  `;

  const { el, close } = openSheet(html);

  // Bilder laden
  loadHeroInto(el.querySelector(".hero"), r);
  el.querySelectorAll("[data-photo]").forEach((ph) => {
    if (drive.isSignedIn()) {
      drive.imageUrl(ph.dataset.photo).then((u) => { ph.style.backgroundImage = `url("${u}")`; }).catch(() => {});
    }
  });

  // Bewertung (gleicher Stern nochmal = eins runter, v1-Verhalten)
  el.querySelectorAll("[data-rate] .star").forEach((s) => {
    s.onclick = async () => {
      const v = +s.dataset.v;
      const newRating = (r.rating === v) ? v - 1 : v;
      el.querySelectorAll("[data-rate] .star").forEach((x) => x.classList.toggle("on", +x.dataset.v <= newRating));
      try { await updateRecipe(r.id, (x) => { x.rating = newRating; }); r.rating = newRating; } catch (err) { alert(err.message); }
    };
  });

  // Favorit
  el.querySelector(".heart").onclick = async (e) => {
    const newVal = !r.favorite;
    e.target.textContent = newVal ? "♥" : "♡";
    try { await updateRecipe(r.id, (x) => { x.favorite = newVal; }); r.favorite = newVal; } catch (err) { alert(err.message); }
  };

  // Foto aufnehmen/hochladen (frischer Input pro Klick — mobil zuverlässiger)
  el.querySelector(".photo-add").onclick = () => {
    if (!drive.isSignedIn()) { alert("Für eigene Fotos bitte zuerst mit Google anmelden (Fotos werden in deinem Drive gespeichert)."); return; }
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.cssText = "position:fixed;left:-9999px;opacity:0";
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      try {
        const blob = await compressImage(f);
        const fid = await drive.uploadImage(blob, `kochbuch-foto-${r.id}-${Date.now()}.jpg`);
        await updateRecipe(r.id, (x) => { x.photos = [{ id: fid, added: new Date().toISOString() }, ...(x.photos || [])]; });
        close();
        openDetail(r.id);
      } catch (err) { alert("Foto fehlgeschlagen: " + err.message); }
    };
    inp.click();
  };

  // Foto löschen
  el.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Foto löschen?")) return;
      const fid = b.dataset.rm;
      try {
        await updateRecipe(r.id, (x) => { x.photos = (x.photos || []).filter((p) => p.id !== fid); });
        drive.deleteFile(fid);
        close();
        openDetail(r.id);
      } catch (err) { alert(err.message); }
    };
  });

  // Notiz für Claude
  el.querySelector(".fb-save").onclick = async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const val = el.querySelector(".fb").value.trim();
    btn.disabled = true;
    btn.textContent = "✓ Gespeichert!";
    try { await updateRecipe(r.id, (x) => { x.feedback = val; }); } catch (err) { alert(err.message); }
    setTimeout(() => { if (btn.isConnected) { btn.disabled = false; btn.textContent = "Notiz speichern"; } }, 1600);
  };

  // Zutaten auf die Einkaufsliste (P5.8) — aggregiert, Vorrat abgezogen
  const addIngBtn = el.querySelector(".add-ing-shop");
  if (addIngBtn) addIngBtn.onclick = async () => {
    const [{ aggregateIngredients }, { addItemsToList }, { getStaples }] = await Promise.all([
      import("../shopping/logic.js"),
      import("../shopping/shopping.js"),
      import("../../data/settings.js"),
    ]);
    const { items, skipped } = aggregateIngredients([r], { staples: await getStaples() });
    if (!items.length) { alert(skipped ? "Alles schon im Vorrat — nichts zu kaufen." : "Keine Zutaten zum Übernehmen."); return; }
    await addItemsToList(items);
    if (confirm(`${items.length} ${items.length === 1 ? "Artikel" : "Artikel"} zur Einkaufsliste hinzugefügt` +
      (skipped ? ` (${skipped} im Vorrat übersprungen).` : ".") + `\nZur Liste wechseln?`)) {
      closeAllSheets();
      navigate("shopping");
    }
  };

  // Aktionen
  el.querySelector(".back").onclick = close;
  el.querySelector(".act-cook").onclick = () => { closeAllSheets(); navigate(`cook/${r.id}`); };
  el.querySelector(".edit").onclick = () => { close(); openForm(r); };
  el.querySelector(".cooked").onclick = async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "✓ Eingetragen!";
    try {
      await updateRecipe(r.id, (x) => {
        x.lastCooked = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });
        x.cookedCount = (x.cookedCount || 0) + 1;
      });
    } catch (err) { alert(err.message); }
    setTimeout(() => { if (btn.isConnected) { btn.disabled = false; btn.textContent = "✓ Heute gekocht"; } }, 1600);
  };
  el.querySelector(".del").onclick = async () => {
    if (!confirm("Rezept wirklich löschen?")) return;
    (r.photos || []).forEach((p) => drive.deleteFile(p.id)); // Drive-Fotos mit aufräumen
    try { await deleteRecipe(r.id); close(); } catch (err) { alert(err.message); }
  };
}
