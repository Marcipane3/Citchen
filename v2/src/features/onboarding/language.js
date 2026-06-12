// language.js — Sprachauswahl-Overlay beim Erststart (keine Sprache gesetzt)
// und wiederverwendbar als Umschalter. Reines DOM, kein Sheet-Helper nötig.

import { LANGS, setLang, getLang } from "../../i18n.js";
import { t } from "../../i18n.js";

/** Modales Overlay; ruft onPick(code) nach Auswahl. */
export function showLanguageModal({ dismissable = false, onPick } = {}) {
  const ov = document.createElement("div");
  ov.className = "overlay lang-overlay";
  ov.innerHTML = `
    <div class="lang-modal">
      <div style="font-size:34px;margin-bottom:6px">🍳</div>
      <h2>${t("onboarding.pick")}</h2>
      <p class="lang-sub">${t("onboarding.pickSub")}</p>
      <div class="lang-grid">
        ${LANGS.map((l) => `<button class="lang-btn ${getLang() === l.code ? "on" : ""}" data-lang="${l.code}">
          <span class="lang-flag">${l.flag}</span><span>${l.label}</span></button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll(".lang-btn").forEach((b) => {
    b.onclick = () => {
      setLang(b.dataset.lang);
      ov.remove();
      if (onPick) onPick(b.dataset.lang);
    };
  });
  if (dismissable) ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
}
