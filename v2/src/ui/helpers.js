// helpers.js — kleine geteilte UI-Bausteine (Escaping, Badges, Sterne, Bilder).

import * as drive from "../data/drive.js";
import { t } from "../i18n.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function starsMini(n) {
  if (!n) return "";
  return `<span class="rate-mini">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

/** Badges aus den v3-Metadaten. compact=true für Karten (weniger Badges). */
export function metaBadges(r, compact = false) {
  const b = [];
  if (r.effort === "alltag") b.push(`<span class="badge alltag">${t("badge.alltag")}</span>`);
  else if (r.effort === "besonders") b.push(`<span class="badge besonders">${t("badge.besonders")}</span>`);
  if (r.difficulty) b.push(`<span class="badge">${esc(r.difficulty)}</span>`);
  if (!compact && r.cuisine) b.push(`<span class="badge">${esc(r.cuisine)}</span>`);
  if (r.mealPrep) b.push(`<span class="badge prep">${t("badge.mealprep")}</span>`);
  if (r.toTry) b.push(`<span class="badge totry">${t("badge.totry")}</span>`);
  if (!compact && r.season) b.push(`<span class="badge">${esc(r.season)}</span>`);
  return b.join("");
}

/** Titelbild (neuestes eigenes Foto > Bild-URL) asynchron in ein Element laden. */
export async function loadHeroInto(el, r) {
  let url = null;
  if (r.photos && r.photos.length && drive.isSignedIn()) {
    try { url = await drive.imageUrl(r.photos[0].id); } catch (e) { /* offline o.ä. */ }
  }
  if (!url && r.image) url = r.image;
  if (url) { el.style.backgroundImage = `url("${url}")`; el.classList.add("has-img"); }
}

export function hydrateHeroes(scope, recipes) {
  (scope || document).querySelectorAll("[data-hero]").forEach((el) => {
    const r = recipes.find((x) => x.id === el.dataset.hero);
    if (r) loadHeroInto(el, r);
  });
}

/** Bild clientseitig verkleinern + als JPEG komprimieren, bevor es zu Drive geht (v1-Parität). */
export function compressImage(file, maxDim = 1280, quality = 0.72) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob((b) => b ? res(b) : rej(new Error("Komprimierung fehlgeschlagen")), "image/jpeg", quality);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/** Wiederverwendbarer Zeilen-Editor (Zutaten/Schritte). Gibt einen Getter zurück (v1-Parität). */
export function makeListEditor(mount, initial, placeholder, numbered) {
  const wrap = document.createElement("div");
  function renum() {
    if (!numbered) return;
    Array.from(wrap.querySelectorAll(".num")).forEach((n, i) => { n.textContent = (i + 1) + "."; });
  }
  function addRow(val) {
    const row = document.createElement("div");
    row.className = "frow";
    row.innerHTML = `${numbered ? '<span class="num"></span>' : ""}<input class="f"><button class="rm" type="button">✕</button>`;
    const input = row.querySelector("input");
    input.value = val || "";
    input.placeholder = placeholder;
    row.querySelector(".rm").onclick = () => { row.remove(); renum(); };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); const nr = addRow(""); nr.querySelector("input").focus(); }
    });
    wrap.appendChild(row);
    renum();
    return row;
  }
  (initial && initial.length ? initial : [""]).forEach((v) => addRow(v));
  const add = document.createElement("button");
  add.className = "addrow";
  add.type = "button";
  add.textContent = "+ Zeile hinzufügen";
  add.onclick = () => { const r = addRow(""); r.querySelector("input").focus(); };
  mount.appendChild(wrap);
  mount.appendChild(add);
  return () => Array.from(wrap.querySelectorAll("input")).map((i) => i.value.trim()).filter(Boolean);
}
