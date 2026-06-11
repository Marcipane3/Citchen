// menu.js — ☰ Navigations-Sheet (v1-Parität P4.1, erweitert um v2-Routen).
// Noch nicht gebaute Bereiche zeigen ein "bald"-Badge statt zu navigieren.

import { state } from "../store.js";
import * as drive from "../data/drive.js";
import * as sync from "../data/sync.js";
import { openSheet } from "../ui/sheet.js";
import { navigate } from "../router.js";
import { copyExport } from "./cookbook/export.js";

const ITEMS = [
  { go: "cookbook", icon: "📖", label: "Rezepte" },
  { go: "match", icon: "🔥", label: "Koch-Match (Swipe)" },
  { go: "shopping", icon: "🛒", label: "Einkaufsliste" },
  { go: "planner", icon: "🗓", label: "Wochenplan" },
  { go: "assistant", icon: "✨", label: "KI-Assistent" },
  { go: "settings", icon: "⚙️", label: "Einstellungen" },
  { go: "__export", icon: "⬇️", label: "Rezepte als Markdown exportieren" },
];

export function openMenu(current) {
  const driveItem = state.signedIn
    ? `<button class="menu-item" disabled style="opacity:.7">☁️ Google Drive verbunden<span class="soon">✓ Sync aktiv</span></button>`
    : `<button class="menu-item" data-go="__login">☁️ Mit Google Drive verbinden</button>`;

  const html = `
    <div class="sheet-head"><span class="cat-label">Menü</span><button class="icon-btn close">✕</button></div>
    ${ITEMS.map((it) => `
      <button class="menu-item ${current === it.go ? "on" : ""}" data-go="${it.go}" ${it.soon ? "disabled style='opacity:.55'" : ""}>
        ${it.icon} ${it.label}${it.soon ? `<span class="soon">${it.soon}</span>` : ""}
      </button>`).join("")}
    ${driveItem}
  `;
  const { el, close } = openSheet(html);
  el.querySelectorAll(".menu-item:not([disabled])").forEach((b) => {
    b.onclick = () => {
      const go = b.dataset.go;
      close();
      if (go === "__export") copyExport(state.recipes);
      else if (go === "__login") drive.login().catch((e) => alert("Anmeldung nicht möglich: " + e.message));
      else navigate(go);
    };
  });
}
