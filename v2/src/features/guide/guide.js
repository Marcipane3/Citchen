// guide.js — ℹ️ Features & Versionen (#/guide). In-App-Übersicht, aus den
// Einstellungen geöffnet. Reines HTML (kein Markdown), i18n-fähig.

import { esc } from "../../ui/helpers.js";
import { openMenu } from "../menu.js";
import { navigate } from "../../router.js";
import { BUILD } from "../../version.js";
import { APP_VERSION, CHANGELOG } from "../../version.js";
import { t } from "../../i18n.js";

const FEATURES = ["cookbook", "capture", "cooking", "planner", "shopping", "lager", "ai"];

export function renderGuide(container) {
  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-l">
          <button class="icon-btn" id="backBtn" title="${t("common.back")}">←</button>
          <div><h1>${t("guide.title")}</h1><div class="sub">${t("guide.version", { v: APP_VERSION })} · ${t("guide.updated", { d: "2026-06-10" })}</div></div>
        </div>
        <button class="icon-btn" id="menuBtn" title="${t("common.menu")}">☰</button>
      </div>
    </header>
    <main class="app-main">
      ${FEATURES.map((f) => `
        <div class="guide-feat">
          <div class="gf-t">${t("guide.feats." + f + "T")}</div>
          <div class="gf-b">${t("guide.feats." + f + "B")}</div>
        </div>`).join("")}

      <div class="card set-card">
        <h3>${t("guide.byokHeading")}</h3>
        <p class="set-note" style="line-height:1.7">${t("guide.byokBody")}</p>
      </div>

      <div class="card set-card">
        <h3>${t("guide.changelogHeading")}</h3>
        <ul class="guide-changelog">
          ${CHANGELOG.map((c) => `<li><strong>${esc(c.v)}</strong> — ${esc(c.txt)}</li>`).join("")}
        </ul>
      </div>
    </main>
    <div class="build-line">Build ${esc(BUILD)}</div>`;

  container.querySelector("#backBtn").onclick = () => navigate("settings");
  container.querySelector("#menuBtn").onclick = () => openMenu("settings");
}
