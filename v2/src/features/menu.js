// menu.js — ☰ Navigations-Sheet. i18n-fähig; Lager als Top-Level-Eintrag.

import { state } from "../store.js";
import * as drive from "../data/drive.js";
import { openSheet } from "../ui/sheet.js";
import { navigate } from "../router.js";
import { copyExport } from "./cookbook/export.js";
import { t } from "../i18n.js";

const ITEMS = [
  { go: "cookbook", icon: "📖", k: "nav.cookbook" },
  { go: "match", icon: "🔥", k: "nav.match" },
  { go: "lager", icon: "📦", k: "nav.lager" },
  { go: "shopping", icon: "🛒", k: "nav.shopping" },
  { go: "planner", icon: "🗓", k: "nav.planner" },
  { go: "assistant", icon: "✨", k: "nav.assistant" },
  { go: "capture", icon: "📸", k: "nav.capture" },
  { go: "settings", icon: "⚙️", k: "nav.settings" },
  { go: "__export", icon: "⬇️", k: "nav.export" },
];

export function openMenu(current) {
  const driveItem = state.signedIn
    ? `<button class="menu-item" disabled style="opacity:.7">☁️ ${t("nav.driveConnected")}<span class="soon">${t("nav.driveSyncActive")}</span></button>`
    : `<button class="menu-item" data-go="__login">☁️ ${t("nav.driveConnect")}</button>`;

  const html = `
    <div class="sheet-head"><span class="cat-label">${t("common.menu")}</span><button class="icon-btn close">✕</button></div>
    ${ITEMS.map((it) => `
      <button class="menu-item ${current === it.go ? "on" : ""}" data-go="${it.go}">
        ${it.icon} ${t(it.k)}
      </button>`).join("")}
    ${driveItem}
  `;
  const { el, close } = openSheet(html);
  el.querySelectorAll(".menu-item:not([disabled])").forEach((b) => {
    b.onclick = () => {
      const go = b.dataset.go;
      close();
      if (go === "__export") copyExport(state.recipes);
      else if (go === "__login") drive.login().catch((e) => alert(e.message));
      else navigate(go);
    };
  });
}
