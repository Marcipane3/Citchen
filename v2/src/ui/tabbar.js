// tabbar.js — J2: feste Tab-Leiste unten für die 5 Hauptbereiche. Lebt AUSSERHALB von #app
// (Views ersetzen #app per innerHTML), wird einmal in app.js eingehängt und bei jedem
// Routenwechsel per setActiveTab() aktualisiert. 🛒 zeigt die Zahl offener Artikel.

import { TABS, tabForRoute, hidesTabBar, badgeText } from "./tabs.js";
import { navigate } from "../router.js";
import { t, onLangChange } from "../i18n.js";
import * as listSync from "../data/listSync.js";

let bar = null;
let active = null;
let openCount = 0;

function paint() {
  if (!bar) return;
  bar.setAttribute("aria-label", t("tab.aria"));
  bar.innerHTML = TABS.map((tab) => {
    const on = tab.go === active;
    const b = tab.badge ? badgeText(openCount) : "";
    const label = t(tab.k) + (b ? ", " + t("tab.badgeAria", { n: openCount }) : "");
    return `<button class="tab${on ? " on" : ""}" data-go="${tab.go}"${on ? ' aria-current="page"' : ""} aria-label="${label}">
      <span class="tab-ic" aria-hidden="true">${tab.icon}${b ? `<span class="tab-badge">${b}</span>` : ""}</span>
      <span class="tab-lbl" aria-hidden="true">${t(tab.k)}</span>
    </button>`;
  }).join("");
  bar.querySelectorAll(".tab").forEach((btn) => {
    btn.onclick = () => {
      // Erneut auf den aktiven Tab → nach oben scrollen (gängiges Tab-Bar-Verhalten).
      if (btn.dataset.go === active) window.scrollTo({ top: 0, behavior: "smooth" });
      else navigate(btn.dataset.go);
    };
  });
}

/** Einmal beim Start aufrufen. */
export function mountTabBar() {
  if (bar) return;
  bar = document.createElement("nav");
  bar.className = "tabbar";
  document.body.appendChild(bar);
  paint();
  onLangChange(paint);
  listSync.onCount((n) => { openCount = n; paint(); });
  listSync.getOpenCount().then((n) => { openCount = n; paint(); }).catch(() => {});
  // Bildschirmtastatur offen → Leiste weg, sonst frisst sie Platz über der Tastatur (nur Touch, s. CSS).
  const isText = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|file|color)$/.test(el.type)));
  document.addEventListener("focusin", (e) => { if (isText(e.target)) document.body.classList.add("typing"); });
  document.addEventListener("focusout", () => document.body.classList.remove("typing"));
}

/** Bei jedem Routenwechsel: aktiven Tab markieren bzw. Leiste im Kochmodus ausblenden. */
export function setActiveTab(routeName) {
  active = tabForRoute(routeName);
  document.body.classList.toggle("no-tabbar", hidesTabBar(routeName));
  paint();
}
